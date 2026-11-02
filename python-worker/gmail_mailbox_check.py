import json
import os
import re
import sys

sys.dont_write_bytecode = True
from gmail_draft_worker import _gmail_service


def _address(value):
    return isinstance(value, str) and bool(re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', value.strip()))


def check_mailbox(request, service_factory=None, env=None):
    env = os.environ if env is None else env
    base = {'ok': False, 'authenticated': False, 'draftCreated': False, 'sent': False}
    if not isinstance(request, dict) or request.get('action') != 'check_mailbox':
        return {**base, 'code': 'GMAIL_CHECK_CONFIGURATION'}
    if str(env.get('ENABLE_GMAIL_MAILBOX_CHECK', '')).strip().lower() != 'true':
        return {**base, 'code': 'GMAIL_CHECK_DISABLED'}
    expected = str(env.get('GMAIL_FROM_ADDRESS', '')).strip()
    supplied = request.get('expectedAddress', '')
    keys = ['GMAIL_OAUTH_CLIENT_ID', 'GMAIL_OAUTH_CLIENT_SECRET', 'GMAIL_OAUTH_REFRESH_TOKEN']
    if not _address(expected) or not _address(supplied) or expected.lower() != supplied.strip().lower() or not all(str(env.get(key, '')).strip() for key in keys):
        return {**base, 'code': 'GMAIL_CHECK_CONFIGURATION'}
    try:
        service = (service_factory or _gmail_service)()
        if service is None:
            return {**base, 'code': 'GMAIL_PROFILE_FAILED'}
        profile = service.users().getProfile(userId='me').execute()
        mailbox = profile.get('emailAddress', '')
        if not _address(mailbox):
            return {**base, 'code': 'GMAIL_PROFILE_FAILED'}
        matched = mailbox.strip().lower() == expected.lower()
        return {**base, 'ok': matched, 'authenticated': True, 'mailbox': mailbox.strip(),
            'mailboxMatch': matched, 'code': 'GMAIL_MAILBOX_MATCH' if matched else 'GMAIL_MAILBOX_MISMATCH'}
    except Exception as error:
        text = str(error).lower()
        if 'invalid_grant' in text or 'revoked' in text:
            code = 'GMAIL_OAUTH_REVOKED'
        elif isinstance(error, ImportError) or 'dependencies are unavailable' in text:
            code = 'GMAIL_DEPENDENCIES_MISSING'
        else:
            code = 'GMAIL_PROFILE_FAILED'
        return {**base, 'code': code}


def main():
    raw = sys.stdin.read(4097)
    if len(raw) > 4096:
        raise ValueError('Request too large')
    print(json.dumps(check_mailbox(json.loads(raw))))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Mailbox check request failed. No draft created or sent.', file=sys.stderr)
        sys.exit(1)
