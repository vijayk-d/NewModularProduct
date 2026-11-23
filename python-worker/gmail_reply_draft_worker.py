"""Creates (or updates) a Gmail DRAFT reply inside the recruiter's thread. Never sends.

The draft is addressed to the person who replied, with "Re: <their subject>", In-Reply-To and References set from their
message, so Gmail shows it in the same conversation. If draftId is given and still exists, that draft is updated instead of
creating another. Reading their message headers needs gmail.readonly; creating the draft needs gmail.compose.
Input (stdin JSON): {"action": "reply_draft", "expectedAddress", "threadId", "replyToMessageId", "to", "bodyPlainText", "bodyHtml", "draftId"}.
"""
import base64
import json
import os
import re
import sys
from email.message import EmailMessage
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gmail_message_style import style_email_body  # noqa: E402

EMAIL = re.compile(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+')
GMAIL_ID = re.compile(r'[A-Za-z0-9]{1,40}')


def _header(headers, name):
    for h in headers or []:
        if str(h.get('name', '')).lower() == name.lower():
            return str(h.get('value', ''))
    return ''


def reply_subject(subject):
    s = re.sub(r'[\r\n]+', ' ', str(subject or '')).strip() or 'Your message'
    return s if re.match(r'^\s*re:', s, re.I) else 'Re: ' + s


def build_reply(request, from_address, original_headers):
    to = str(request.get('to', '')).strip()
    if not EMAIL.fullmatch(to):
        raise ValueError('Their email address is invalid.')
    if not EMAIL.fullmatch(from_address):
        raise ValueError('Configure an explicit GMAIL_FROM_ADDRESS.')
    plain, html = request.get('bodyPlainText', ''), request.get('bodyHtml', '')
    if not isinstance(plain, str) or not plain.strip() or not isinstance(html, str) or not html.strip():
        raise ValueError('The reply needs text.')
    if len(plain) > 20000 or len(html) > 60000:
        raise ValueError('The reply is too long.')
    if any('{{' in v or '}}' in v for v in (plain, html)):
        raise ValueError('Resolve placeholders before drafting.')
    message = EmailMessage()
    message['To'], message['From'] = to, from_address
    message['Subject'] = reply_subject(_header(original_headers, 'Subject'))
    message_id = _header(original_headers, 'Message-ID') or _header(original_headers, 'Message-Id')
    if message_id:
        message['In-Reply-To'] = message_id
        refs = _header(original_headers, 'References')
        message['References'] = (refs + ' ' + message_id).strip() if refs else message_id
    message.set_content(plain)
    message.add_alternative(style_email_body(html, None), subtype='html')
    return message


def _service():
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    keys = ['GMAIL_OAUTH_CLIENT_ID', 'GMAIL_OAUTH_CLIENT_SECRET', 'GMAIL_OAUTH_REFRESH_TOKEN']
    if not all(os.getenv(k, '').strip() for k in keys):
        raise ValueError('OAuth configuration missing')
    credentials = Credentials(token=None, refresh_token=os.environ[keys[2]], token_uri='https://oauth2.googleapis.com/token',
                              client_id=os.environ[keys[0]], client_secret=os.environ[keys[1]])
    return build('gmail', 'v1', credentials=credentials, cache_discovery=False)


def _status(error):
    return getattr(getattr(error, 'resp', None), 'status', None) or getattr(error, 'status_code', None)


def process_request(request, service_factory=None, env=os.environ):
    if not isinstance(request, dict) or request.get('action') != 'reply_draft':
        return {'ok': False, 'code': 'INVALID_REQUEST', 'error': 'Only creating a draft reply is allowed. Nothing is sent.'}
    expected = str(request.get('expectedAddress', '')).strip()
    if not expected or expected.lower() != str(env.get('GMAIL_FROM_ADDRESS', '')).strip().lower():
        return {'ok': False, 'code': 'SENDER_MISMATCH', 'error': 'The configured Gmail address does not match.'}
    thread_id, reply_to, draft_id = str(request.get('threadId', '')), str(request.get('replyToMessageId', '')), str(request.get('draftId', '') or '')
    if not GMAIL_ID.fullmatch(thread_id) or not GMAIL_ID.fullmatch(reply_to) or (draft_id and not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', draft_id)):
        return {'ok': False, 'code': 'INVALID_THREAD', 'error': 'The Gmail thread or message ID is not valid.'}
    try:
        service = (service_factory or _service)()
        mailbox = str(service.users().getProfile(userId='me').execute().get('emailAddress', ''))
        if mailbox.lower() != expected.lower():
            return {'ok': False, 'code': 'SENDER_MISMATCH', 'error': 'The authorised Gmail mailbox is not the configured sender.'}
        original = service.users().messages().get(userId='me', id=reply_to, format='metadata', metadataHeaders=['Message-ID', 'References', 'Subject']).execute()
        if str(original.get('threadId', thread_id)) != thread_id:
            return {'ok': False, 'code': 'INVALID_THREAD', 'error': 'That message is not in the expected Gmail thread.'}
        message = build_reply(request, mailbox, (original.get('payload') or {}).get('headers'))
    except ValueError as error:
        return {'ok': False, 'code': 'INVALID_REPLY', 'error': str(error)}
    except Exception as error:
        if _status(error) == 403 or 'insufficient' in str(error).lower():
            return {'ok': False, 'code': 'SCOPE_MISSING', 'error': 'Gmail has not granted the access needed to draft replies.'}
        return {'ok': False, 'code': 'DRAFT_FAILED', 'error': 'The Gmail draft could not be prepared. Nothing was created.'}
    body = {'message': {'raw': base64.urlsafe_b64encode(message.as_bytes()).decode(), 'threadId': thread_id}}
    drafts = service.users().drafts()
    try:
        if draft_id:
            try:
                result = drafts.update(userId='me', id=draft_id, body={'id': draft_id, **body}).execute()
                updated = True
            except Exception as error:
                if _status(error) != 404:
                    raise
                result, updated = drafts.create(userId='me', body=body).execute(), False
        else:
            result, updated = drafts.create(userId='me', body=body).execute(), False
    except Exception:
        # The outcome is uncertain: do not retry; the owner checks Gmail Drafts.
        return {'ok': False, 'code': 'DRAFT_UNCERTAIN', 'error': 'Gmail did not confirm the draft. Check your Gmail Drafts before trying again.'}
    msg = result.get('message') or {}
    return {'ok': True, 'mailbox': mailbox, 'draftId': str(result.get('id', '')), 'messageId': str(msg.get('id', '')), 'threadId': str(msg.get('threadId', thread_id)),
            'updated': updated, 'subject': str(message['Subject'])}


def main():
    request = json.loads(sys.stdin.read(200000) or '{}')
    print(json.dumps(process_request(request), ensure_ascii=True))


if __name__ == '__main__':
    main()
