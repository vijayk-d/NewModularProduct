"""Read-only: fetch the replies in one Gmail thread, by the thread ID stored when the application email was sent.

Reads only that thread. Never sends, drafts, labels, archives or marks anything as read (threads.get does not change
read state). Needs the gmail.readonly permission; without it the result says SCOPE_MISSING and nothing else happens.
Input (stdin JSON): {"action": "read_replies", "threadId": "...", "expectedAddress": "...", "sentMessageId": "..."}.
"""
import base64
import html
import json
import os
import re
import sys
from email.utils import parseaddr

MAX_BODY = 8000
QUOTE_START = [re.compile(r'^On .{3,200}wrote:\s*$'), re.compile(r'^-{2,}\s*Original Message\s*-{2,}', re.I),
               re.compile(r'^_{8,}\s*$'), re.compile(r'^From:\s.+', re.I)]


def _header(headers, name):
    for h in headers or []:
        if str(h.get('name', '')).lower() == name.lower():
            return str(h.get('value', ''))
    return ''


def _decode(data):
    try:
        return base64.urlsafe_b64decode(str(data) + '=' * (-len(str(data)) % 4)).decode('utf-8', 'replace')
    except Exception:
        return ''


def _parts(payload):
    yield payload
    for p in payload.get('parts') or []:
        yield from _parts(p)


def _html_to_text(value):
    value = re.sub(r'(?is)<(script|style).*?</\1>', '', value)
    value = re.sub(r'(?i)<br\s*/?>|</p>|</div>|</li>', '\n', value)
    value = re.sub(r'<[^>]+>', '', value)
    return html.unescape(value)


def body_text(payload):
    plain = [_decode(p.get('body', {}).get('data', '')) for p in _parts(payload) if p.get('mimeType') == 'text/plain' and p.get('body', {}).get('data')]
    if plain:
        return '\n'.join(plain)
    rich = [_decode(p.get('body', {}).get('data', '')) for p in _parts(payload) if p.get('mimeType') == 'text/html' and p.get('body', {}).get('data')]
    return _html_to_text('\n'.join(rich))


def without_quoted(text):
    """Keeps their new text only: stops at the quoted earlier message and drops '>' lines."""
    out = []
    for line in str(text).replace('\r\n', '\n').split('\n'):
        if any(p.match(line.strip()) for p in QUOTE_START):
            break
        if line.lstrip().startswith('>'):
            continue
        out.append(line.rstrip())
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(out)).strip()


def replies_in_thread(thread, own_address, sent_message_id=''):
    messages = sorted(thread.get('messages') or [], key=lambda m: int(m.get('internalDate') or 0))
    ids = [m.get('id') for m in messages]
    start = ids.index(sent_message_id) + 1 if sent_message_id and sent_message_id in ids else 0
    own = own_address.strip().lower()
    out = []
    for m in messages[start:]:
        headers = (m.get('payload') or {}).get('headers')
        name, address = parseaddr(_header(headers, 'From'))
        if not address or address.lower() == own:
            continue
        text = without_quoted(body_text(m.get('payload') or {}))[:MAX_BODY]
        out.append({'messageId': m.get('id', ''), 'fromName': name, 'fromAddress': address, 'date': _header(headers, 'Date'),
                    'subject': _header(headers, 'Subject'), 'text': text or str(m.get('snippet', ''))[:MAX_BODY]})
    return out


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
    if not isinstance(request, dict) or request.get('action') != 'read_replies':
        return {'ok': False, 'code': 'INVALID_REQUEST', 'error': 'Only reading replies is allowed.'}
    expected = str(request.get('expectedAddress', '')).strip()
    if not expected or expected.lower() != str(env.get('GMAIL_FROM_ADDRESS', '')).strip().lower():
        return {'ok': False, 'code': 'SENDER_MISMATCH', 'error': 'The configured Gmail address does not match.'}
    thread_id = str(request.get('threadId', ''))
    if not re.fullmatch(r'[A-Za-z0-9]{6,40}', thread_id):
        return {'ok': False, 'code': 'INVALID_THREAD', 'error': 'This sent email has no Gmail thread ID.'}
    sent_id = str(request.get('sentMessageId', '') or '')
    try:
        service = (service_factory or _service)()
        mailbox = str(service.users().getProfile(userId='me').execute().get('emailAddress', ''))
        if mailbox.lower() != expected.lower():
            return {'ok': False, 'code': 'SENDER_MISMATCH', 'error': 'The authorised Gmail mailbox is not the configured sender.'}
        thread = service.users().threads().get(userId='me', id=thread_id, format='full').execute()
    except Exception as error:
        status = _status(error)
        text = str(error)
        if status == 403 or 'insufficient' in text.lower() or 'scope' in text.lower():
            return {'ok': False, 'code': 'SCOPE_MISSING', 'error': 'Gmail has not granted read access. Re-authorise Gmail with read-only access first.'}
        if status == 404:
            return {'ok': False, 'code': 'THREAD_NOT_FOUND', 'error': 'That Gmail thread was not found (it may have been deleted).'}
        return {'ok': False, 'code': 'READ_FAILED', 'error': 'Gmail could not be read. Nothing was changed.'}
    return {'ok': True, 'mailbox': mailbox, 'replies': replies_in_thread(thread, expected, sent_id)}


def main():
    request = json.loads(sys.stdin.read(4097) or '{}')
    print(json.dumps(process_request(request), ensure_ascii=True))


if __name__ == '__main__':
    main()
