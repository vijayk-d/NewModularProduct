import sys as _sys
from pathlib import Path as _Path
_sys.path.insert(0,str(_Path(__file__).resolve().parent))
from cv_docx import MIME as DOCX_MIME,validate_docx
import base64
import hashlib
import json
import os
import re
import sys
import time
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses
sys.dont_write_bytecode = True
from gmail_draft_worker import _build_message, _gmail_service
LIMIT = 64 * 1024 * 1024

def process_send(request, service_factory=None, env=None):
    env = os.environ if env is None else env
    def failed(code):
        return {'ok': False, 'sent': False, 'sendingAttempted': False, 'error': code}
    if not isinstance(request, dict) or request.get('action') not in ('prepare', 'commit'):
        return failed('ACTION_INVALID')
    if any(str(env.get(k, '')).strip().lower() != 'true' for k in ('ENABLE_GMAIL', 'ENABLE_GMAIL_SENDING')):
        return failed('SENDING_DISABLED')
    account = str(env.get('GMAIL_FROM_ADDRESS', '')).strip()
    recipient = str(request.get('recipient', '')).strip()
    if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', account) or request.get('expectedAddress', '').lower() != account.lower():
        return failed('SENDER_CONFIGURATION_CHANGED')
    if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', recipient):
        return failed('RECIPIENT_INVALID')
    mode = request.get('mode')
    if mode not in ('new', 'draft', 'repeat'):
        return failed('MODE_INVALID')
    try:
        service = (service_factory or _gmail_service)()
        mailbox = str(service.users().getProfile(userId='me').execute(num_retries=0).get('emailAddress', '')).strip()
        if mailbox.lower() != account.lower():
            return failed('MAILBOX_MISMATCH')
        if request['action'] == 'prepare':
            if mode == 'draft':
                if not isinstance(request.get('draftId'), str) or not request['draftId']:
                    return failed('DRAFT_ID_MISSING')
                result = service.users().drafts().get(userId='me', id=request['draftId'], format='raw').execute(num_retries=0)
                raw = result.get('message', {}).get('raw', '')
            else:
                draft = request.get('draft', {})
                message = _build_message(draft, account)
                parts = list(message.iter_attachments())
                if len(parts) != 1 or hashlib.sha256(parts[0].get_payload(decode=True)).hexdigest() != (draft.get('attachment') or {}).get('sha256'):
                    return failed('CV_BYTES_CHANGED')
                raw = base64.urlsafe_b64encode(message.as_bytes()).decode('ascii')
        else:
            if request.get('confirmed') is not True:
                return failed('CONFIRMATION_REQUIRED')
            if type(request.get('expiresAt')) not in (int, float) or request['expiresAt'] <= time.time() * 1000:
                return failed('CONFIRMATION_EXPIRED')
            raw = request.get('raw', '')
        if not isinstance(raw, str) or not raw or len(raw) > LIMIT:
            return failed('MESSAGE_TOO_LARGE')
        data = base64.b64decode(raw + '=' * (-len(raw) % 4), altchars=b'-_', validate=True)
        if len(data) > 32 * 1024 * 1024:
            return failed('MESSAGE_TOO_LARGE')
        digest = hashlib.sha256(data).hexdigest()
        message = BytesParser(policy=policy.default).parsebytes(data)
        if len(message.get_all('To', [])) != 1 or [a.lower() for _, a in getaddresses(message.get_all('To', []))] != [recipient.lower()]:
            return failed('RECIPIENT_CHANGED')
        if len(message.get_all('From', [])) != 1 or [a.lower() for _, a in getaddresses(message.get_all('From', []))] != [account.lower()]:
            return failed('SENDER_CHANGED')
        if any(message.get_all(k) for k in ('Cc', 'Bcc', 'Sender', 'Resent-To', 'Resent-Cc', 'Resent-Bcc')):
            return failed('EXTRA_RECIPIENT_OR_SENDER_HEADERS')
        subject = str(message.get('Subject', ''))
        if len(message.get_all('Subject', [])) != 1 or not subject.strip() or len(subject) > 300 or any(c in subject for c in '\r\n'):
            return failed('SUBJECT_INVALID')
        attachments = []
        for part in message.iter_attachments():
            content = part.get_payload(decode=True) or b''
            attachments.append({'name': part.get_filename() or 'attachment', 'sizeBytes': len(content), 'sha256': hashlib.sha256(content).hexdigest(), 'type': part.get_content_type()})
        if len(attachments) != 1 or attachments[0]['type'] not in ['application/pdf',DOCX_MIME] or attachments[0]['sizeBytes'] > 20 * 1024 * 1024:
            return failed('ONE_PDF_OR_DOCX_CV_REQUIRED')
        plain, html = message.get_body(preferencelist=('plain',)), message.get_body(preferencelist=('html',))
        if plain is None or html is None:
            return failed('BOTH_BODIES_REQUIRED')
        plain_text, html_text = plain.get_content(), html.get_content()
        if len(plain_text) > 100000 or len(html_text) > 300000:
            return failed('BODY_TOO_LARGE')
        extension='.docx' if attachments[0]['type']==DOCX_MIME else '.pdf'
        if not attachments[0]['name'].lower().endswith(extension):return failed('CV_FILENAME_MISMATCH')
        if extension=='.docx':validate_docx(list(message.iter_attachments())[0].get_payload(decode=True))
        summary = {'recipient': recipient, 'subject': subject, 'attachments': attachments, 'contentHash': digest, 'bodyPlainText': plain_text, 'bodyHtml': html_text}
        if request['action'] == 'prepare':
            return {'ok': True, 'sent': False, 'sendingAttempted': False, 'sendingAccount': mailbox, 'raw': raw, 'summary': summary}
        if request.get('expectedHash') != digest:
            return failed('APPROVED_MESSAGE_CHANGED')
        if mode == 'draft':
            current = service.users().drafts().get(userId='me', id=request['draftId'], format='raw').execute(num_retries=0)
            value = current.get('message', {}).get('raw', '')
            if hashlib.sha256(base64.b64decode(value + '=' * (-len(value) % 4), altchars=b'-_', validate=True)).hexdigest() != digest:
                return failed('GMAIL_DRAFT_CHANGED_AFTER_CONFIRMATION')
    except Exception:
        return failed('SEND_PREFLIGHT_FAILED')
    if request['expiresAt'] <= time.time() * 1000:
        return failed('CONFIRMATION_EXPIRED')
    try:
        if mode == 'draft':
            response = service.users().drafts().send(userId='me', body={'id': request['draftId'], 'message': {'raw': raw}}).execute(num_retries=0)
        else:
            response = service.users().messages().send(userId='me', body={'raw': raw}).execute(num_retries=0)
        key = response.get('id')
        if not isinstance(key, str) or not key or key.lower().startswith('local-'):
            raise ValueError('Unconfirmed ID')
        return {'ok': True, 'sent': True, 'sendingAttempted': True, 'sendingAccount': mailbox, 'messageId': key, 'threadId': response.get('threadId', '')}
    except Exception:
        return {'ok': False, 'sent': False, 'sendingAttempted': True, 'unknown': True, 'error': 'SEND_OUTCOME_UNCERTAIN'}

if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(LIMIT + 1)
        if len(raw) > LIMIT:
            raise ValueError('Too large')
        sys.stdout.buffer.write(json.dumps(process_send(json.loads(raw.decode('utf-8'))), ensure_ascii=True).encode('utf-8'))
    except Exception:
        sys.exit(1)
