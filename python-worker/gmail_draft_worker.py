import base64
import json
import os
import re
import sys
from email.message import EmailMessage
from gmail_message_style import style_email_body
from pathlib import Path
import hashlib
sys.path.insert(0,str(Path(__file__).resolve().parent))
from cv_docx import MIME as DOCX_MIME,validate_docx


def _build_message(draft, from_address):
    email = draft.get('recipient', {}).get('email', '')
    subject = draft.get('subject', '')
    if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', email):
        raise ValueError('Recipient email is invalid.')
    if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', from_address):
        raise ValueError('Configure an explicit GMAIL_FROM_ADDRESS.')
    if not isinstance(subject, str) or not subject.strip() or '\r' in subject or '\n' in subject:
        raise ValueError('Draft subject is invalid.')
    plain, html = draft.get('bodyPlainText', ''), draft.get('bodyHtml', '')
    if not isinstance(plain, str) or not plain.strip() or not isinstance(html, str) or not html.strip():
        raise ValueError('Draft requires non-empty plain-text and HTML bodies.')
    if any('{{' in value or '}}' in value for value in [plain, html, subject]):
        raise ValueError('Resolve recipient placeholders before preparing the worker request.')
    message = EmailMessage()
    message['To'], message['From'], message['Subject'] = email, from_address, subject
    message.set_content(plain)
    message.add_alternative(style_email_body(html, draft.get('emailTheme')), subtype='html')
    attachment = draft.get('attachment')
    if attachment:
        folder = os.getenv('CV_FOLDER', '').strip()
        relative = str(attachment.get('relativePath', '')).replace('\\', '/')
        if not folder or not relative or re.match(r'^(?:/|[A-Za-z]:)', relative):
            raise ValueError('A configured CV_FOLDER and relative PDF/DOCX attachment are required.')
        root = Path(folder).resolve()
        path = (root / relative).resolve()
        if not path.is_relative_to(root) or path.suffix.lower() not in ['.pdf','.docx'] or not path.is_file():
            raise ValueError('Selected CV must be an existing PDF/DOCX beneath CV_FOLDER.')
        if path.stat().st_size > 20 * 1024 * 1024:
            raise ValueError('Selected CV exceeds the worker attachment limit.')
        name = str(attachment.get('name') or path.name)
        if (not name.strip() or len(name) > 180 or Path(name).suffix.lower()!=path.suffix.lower()
                or re.search(r'[\x00-\x1f\x7f<>:"/\\|?*]', name)):
            raise ValueError('Attachment display name is invalid.')
        with path.open('rb') as source:data=source.read(20*1024*1024+1)
        if len(data)>20*1024*1024:raise ValueError('Attachment size limit.')
        if attachment.get('sha256') and hashlib.sha256(data).hexdigest()!=attachment['sha256']:raise ValueError('CV changed after approval.')
        mime='application/pdf' if path.suffix.lower()=='.pdf' else DOCX_MIME
        if mime==DOCX_MIME:validate_docx(data)
        message.add_attachment(data,maintype='application',subtype=mime.split('/',1)[1],filename=name)
    return message


def _gmail_service():
    client_id = os.getenv('GMAIL_OAUTH_CLIENT_ID', '')
    secret = os.getenv('GMAIL_OAUTH_CLIENT_SECRET', '')
    token = os.getenv('GMAIL_OAUTH_REFRESH_TOKEN', '')
    if not all([client_id, secret, token]):
        raise RuntimeError('Configure Gmail OAuth before enabling live drafting.')
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
    except ImportError:
        raise RuntimeError('Gmail worker dependencies are unavailable.') from None
    credentials = Credentials(token=None, refresh_token=token,
        token_uri='https://oauth2.googleapis.com/token', client_id=client_id, client_secret=secret,
        scopes=['https://www.googleapis.com/auth/gmail.compose'])
    return build('gmail', 'v1', credentials=credentials, cache_discovery=False)


def process_request(request, service_factory=None):
    if not isinstance(request, dict) or request.get('action') != 'draft':
        raise ValueError('Only the draft action is allowed. Sending is disabled.')
    drafts = request.get('drafts')
    if not isinstance(drafts, list) or not 1 <= len(drafts) <= 100:
        raise ValueError('Select between 1 and 100 drafts.')
    ids = [draft.get('queueId') if isinstance(draft, dict) else None for draft in drafts]
    if any(not isinstance(key, str) or not key for key in ids) or len(set(ids)) != len(ids):
        raise ValueError('Distinct string queue IDs are required.')
    try:
        messages = [_build_message(draft, os.getenv('GMAIL_FROM_ADDRESS', '')) for draft in drafts]
        service = (service_factory or _gmail_service)()
        if service is None:
            raise RuntimeError('Gmail service is unavailable.')
    except Exception:
        return {'sent': 0, 'drafted': 0, 'failed': len(drafts), 'unknown': 0,
            'details': [{'queueId': key, 'status': 'failed', 'draftId': None, 'messageId': None,
                'error': 'Gmail setup or message validation failed. No draft creation was attempted.'} for key in ids]}
    details = []
    for draft, message in zip(drafts, messages):
        try:
            raw = base64.urlsafe_b64encode(message.as_bytes()).decode('ascii')
            response = service.users().drafts().create(userId='me', body={'message': {'raw': raw}}).execute()
            draft_id = response.get('id')
            if not isinstance(draft_id, str) or not draft_id:
                details.append({'queueId': draft['queueId'], 'status': 'unknown', 'draftId': None,
                    'messageId': None, 'error': 'Provider returned no draft ID. Check Gmail before retrying.'})
            else:
                details.append({'queueId': draft['queueId'], 'status': 'drafted', 'draftId': draft_id,
                    'messageId': response.get('message', {}).get('id')})
        except Exception as error:
            revoked = 'invalid_grant' in str(error).lower() or 'revoked' in str(error).lower()
            details.append({'queueId': draft['queueId'], 'status': 'failed' if revoked else 'unknown',
                'draftId': None, 'messageId': None,
                'error': 'Reconnect Gmail before retrying.' if revoked else 'Draft creation is uncertain. Check Gmail before retrying.'})
    return {'sent': 0, 'drafted': sum(row['status']=='drafted' for row in details),
        'failed': sum(row['status']=='failed' for row in details),
        'unknown': sum(row['status']=='unknown' for row in details), 'details': details}


def main():
    raw = sys.stdin.read(16 * 1024 * 1024 + 1)
    if len(raw) > 16 * 1024 * 1024:
        raise ValueError('Worker request is too large.')
    result = process_request(json.loads(raw))
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Draft worker rejected its request. No successful outcome was recorded.', file=sys.stderr)
        sys.exit(1)
