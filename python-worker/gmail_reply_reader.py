"""Read-only: find the replies to an application email: in the threads of the emails you sent, and recent messages from its contacts.

Reads only those threads and messages. Never sends, drafts, labels, archives or marks anything as read (threads.get does not change
read state). Needs the gmail.readonly permission; without it the result says SCOPE_MISSING and nothing else happens.
Input (stdin JSON): {"action": "find_replies", "expectedAddress": "...", "threads": [{"threadId", "sentMessageId"}], "fromAddresses": [...], "after": "YYYY/MM/DD"}.
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
    value = re.sub(r'(?i)<br\s*/?>|</p>|</div>|</li>|</td>|</tr>|</table>|</h[1-6]>', '\n', value)
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


EMAIL = re.compile(r'[^\s@<>()"]+@[^\s@<>()"]+\.[A-Za-z]{2,}')
MAX_THREADS, MAX_ADDRESSES, MAX_FOUND = 5, 20, 10


def _reply(m, own):
    headers = (m.get('payload') or {}).get('headers')
    name, address = parseaddr(_header(headers, 'From'))
    if not address or address.lower() == own:
        return None
    text = without_quoted(body_text(m.get('payload') or {}))[:MAX_BODY]
    return {'messageId': m.get('id', ''), 'threadId': m.get('threadId', ''), 'internalDate': int(m.get('internalDate') or 0), 'fromName': name, 'fromAddress': address,
            'date': _header(headers, 'Date'), 'subject': _header(headers, 'Subject'), 'text': text or str(m.get('snippet', ''))[:MAX_BODY]}


TRACKING_QUERY = 'from:(mailsuite.com OR mailtrack.io)'
MAX_ALERTS, MAX_ALERT_TEXT = 100, 4000


def find_tracking_alerts(request, service_factory=None, env=os.environ):
    """find_tracking_alerts: the open and click alert emails your email tracker (Mailsuite, formerly Mailtrack) sent to
    this mailbox since a date. A fixed search; read-only; at most MAX_ALERTS, newest first."""
    expected = str(request.get('expectedAddress', '')).strip()
    if not expected or expected.lower() != str(env.get('GMAIL_FROM_ADDRESS', '')).strip().lower():
        return {'ok': False, 'code': 'SENDER_MISMATCH', 'error': 'The configured Gmail address does not match.'}
    after = str(request.get('after', '') or '')
    if not re.fullmatch(r'\d{4}/\d{2}/\d{2}', after):
        return {'ok': False, 'code': 'INVALID_REQUEST', 'error': 'Invalid search date.'}
    try:
        service = (service_factory or _service)()
        mailbox = str(service.users().getProfile(userId='me').execute().get('emailAddress', ''))
        if mailbox.lower() != expected.lower():
            return {'ok': False, 'code': 'SENDER_MISMATCH', 'error': 'The authorised Gmail mailbox is not the configured sender.'}
        listed = service.users().messages().list(userId='me', q=TRACKING_QUERY + ' after:' + after, maxResults=MAX_ALERTS).execute().get('messages') or []
        alerts = []
        for item in listed[:MAX_ALERTS]:
            m = service.users().messages().get(userId='me', id=item['id'], format='full').execute()
            headers = (m.get('payload') or {}).get('headers')
            text = re.sub(r'[ \t]+', ' ', body_text(m.get('payload') or {}))
            alerts.append({'messageId': m.get('id', ''), 'internalDate': int(m.get('internalDate') or 0), 'subject': _header(headers, 'Subject'),
                           'text': (text.strip() or str(m.get('snippet', '')))[:MAX_ALERT_TEXT]})
    except Exception as error:
        status, text = _status(error), str(error)
        if status == 403 or 'insufficient' in text.lower() or 'scope' in text.lower():
            return {'ok': False, 'code': 'SCOPE_MISSING', 'error': 'Gmail has not granted read access. Re-authorise Gmail with read-only access first.'}
        return {'ok': False, 'code': 'READ_FAILED', 'error': 'Gmail could not be read. Nothing was changed.'}
    alerts.sort(key=lambda a: -a['internalDate'])
    return {'ok': True, 'mailbox': mailbox, 'alerts': alerts}


def process_request(request, service_factory=None, env=os.environ):
    """find_replies: replies in the threads of emails you sent (by thread ID, or found from the sent message ID), plus
    recent messages from this application's contact addresses. Read-only; at most MAX_FOUND replies, newest first."""
    if isinstance(request, dict) and request.get('action') == 'find_tracking_alerts':
        return find_tracking_alerts(request, service_factory, env)
    if not isinstance(request, dict) or request.get('action') != 'find_replies':
        return {'ok': False, 'code': 'INVALID_REQUEST', 'error': 'Only reading replies is allowed.'}
    expected = str(request.get('expectedAddress', '')).strip()
    if not expected or expected.lower() != str(env.get('GMAIL_FROM_ADDRESS', '')).strip().lower():
        return {'ok': False, 'code': 'SENDER_MISMATCH', 'error': 'The configured Gmail address does not match.'}
    threads = [t for t in (request.get('threads') or []) if isinstance(t, dict)][:MAX_THREADS]
    for t in threads:
        if t.get('threadId') and not re.fullmatch(r'[A-Za-z0-9]{1,40}', str(t['threadId'])):
            return {'ok': False, 'code': 'INVALID_THREAD', 'error': 'A Gmail thread ID is not valid.'}
        if t.get('sentMessageId') and not re.fullmatch(r'[A-Za-z0-9]{1,40}', str(t['sentMessageId'])):
            return {'ok': False, 'code': 'INVALID_THREAD', 'error': 'A Gmail message ID is not valid.'}
    addresses = sorted({a.lower() for a in (request.get('fromAddresses') or []) if isinstance(a, str) and EMAIL.fullmatch(a.strip())})[:MAX_ADDRESSES]
    after = str(request.get('after', '') or '')
    if after and not re.fullmatch(r'\d{4}/\d{2}/\d{2}', after):
        return {'ok': False, 'code': 'INVALID_REQUEST', 'error': 'Invalid search date.'}
    if not threads and not addresses:
        return {'ok': False, 'code': 'NOTHING_TO_SEARCH', 'error': 'This application has no sent email or contact address to look for.'}
    own, found, seen = expected.lower(), [], set()
    try:
        service = (service_factory or _service)()
        mailbox = str(service.users().getProfile(userId='me').execute().get('emailAddress', ''))
        if mailbox.lower() != own:
            return {'ok': False, 'code': 'SENDER_MISMATCH', 'error': 'The authorised Gmail mailbox is not the configured sender.'}
        for t in threads:
            thread_id, sent_id = str(t.get('threadId') or ''), str(t.get('sentMessageId') or '')
            try:
                if not thread_id and sent_id:
                    thread_id = str(service.users().messages().get(userId='me', id=sent_id, format='minimal').execute().get('threadId', ''))
                if not thread_id:
                    continue
                thread = service.users().threads().get(userId='me', id=thread_id, format='full').execute()
            except Exception as error:
                if _status(error) == 404:
                    continue
                raise
            messages = sorted(thread.get('messages') or [], key=lambda m: int(m.get('internalDate') or 0))
            ids = [m.get('id') for m in messages]
            start = ids.index(sent_id) + 1 if sent_id in ids else 0
            for m in messages[start:]:
                m.setdefault('threadId', thread_id)
                r = _reply(m, own)
                if r and r['messageId'] not in seen:
                    seen.add(r['messageId']); found.append(r)
        if addresses:
            q = 'from:(' + ' OR '.join(addresses) + ')' + (' after:' + after if after else '')
            listed = service.users().messages().list(userId='me', q=q, maxResults=MAX_FOUND).execute().get('messages') or []
            for item in listed:
                if item.get('id') in seen:
                    continue
                r = _reply(service.users().messages().get(userId='me', id=item['id'], format='full').execute(), own)
                if r:
                    seen.add(r['messageId']); found.append(r)
    except Exception as error:
        status, text = _status(error), str(error)
        if status == 403 or 'insufficient' in text.lower() or 'scope' in text.lower():
            return {'ok': False, 'code': 'SCOPE_MISSING', 'error': 'Gmail has not granted read access. Re-authorise Gmail with read-only access first.'}
        return {'ok': False, 'code': 'READ_FAILED', 'error': 'Gmail could not be read. Nothing was changed.'}
    found.sort(key=lambda r: -r['internalDate'])
    return {'ok': True, 'mailbox': mailbox, 'replies': found[:MAX_FOUND]}


def main():
    request = json.loads(sys.stdin.read(4097) or '{}')
    print(json.dumps(process_request(request), ensure_ascii=True))


if __name__ == '__main__':
    main()
