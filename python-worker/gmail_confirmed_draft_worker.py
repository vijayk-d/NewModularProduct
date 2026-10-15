import base64
import hashlib
import json
import os
import sys
sys.dont_write_bytecode = True
from gmail_draft_worker import _build_message, _gmail_service


def process_confirmed_draft(request, service_factory=None, env=None):
    env = os.environ if env is None else env
    drafts = request.get('drafts', []) if isinstance(request, dict) else []
    if not isinstance(drafts, list):
        drafts = []
    key = drafts[0].get('queueId') if len(drafts) == 1 and isinstance(drafts[0], dict) else None
    def failed(code):
        return {'sent': 0, 'drafted': 0, 'failed': 1, 'profileVerified': False,
            'details': [{'queueId': key, 'status': 'failed', 'draftId': None, 'messageId': None,
                'creationAttempted': False, 'error': code}]}
    if not isinstance(request, dict) or request.get('action') != 'draft' or len(drafts) != 1 or not isinstance(key, str) or not key:
        return failed('INVALID_SINGLE_DRAFT_REQUEST')
    if str(env.get('ENABLE_GMAIL_DRAFT_CREATION', '')).strip().lower() != 'true':
        return failed('DRAFT_CREATION_DISABLED')
    expected = str(env.get('GMAIL_FROM_ADDRESS', '')).strip()
    if not expected or str(request.get('expectedAddress', '')).strip().lower() != expected.lower():
        return failed('SENDER_CONFIGURATION_CHANGED')
    try:
        message = _build_message(drafts[0], expected)
        attachment = drafts[0].get('attachment') or {}
        expected_hash = attachment.get('sha256')
        parts = list(message.iter_attachments())
        if not isinstance(expected_hash, str) or len(parts) != 1 or hashlib.sha256(parts[0].get_payload(decode=True)).hexdigest() != expected_hash:
            return failed('APPROVED_CV_BYTES_CHANGED')
        service = (service_factory or _gmail_service)()
        profile = service.users().getProfile(userId='me').execute()
        mailbox = str(profile.get('emailAddress', '')).strip()
        if not mailbox or mailbox.lower() != expected.lower():
            return failed('MAILBOX_MISMATCH')
    except Exception:
        return failed('MESSAGE_OR_AUTH_PREFLIGHT_FAILED')
    try:
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode('ascii')
        response = service.users().drafts().create(userId='me', body={'message': {'raw': raw}}).execute()
        draft_id = response.get('id')
        if not isinstance(draft_id, str) or not draft_id:
            raise ValueError('No confirmed draft ID')
        return {'sent': 0, 'drafted': 1, 'failed': 0, 'profileVerified': True, 'sendingAccount': mailbox,
            'details': [{'queueId': key, 'status': 'drafted', 'draftId': draft_id,
                'messageId': response.get('message', {}).get('id'), 'creationAttempted': True}]}
    except Exception:
        return {'sent': 0, 'drafted': 0, 'failed': 0, 'unknown': 1, 'profileVerified': True, 'sendingAccount': mailbox,
            'details': [{'queueId': key, 'status': 'unknown', 'draftId': None, 'messageId': None,
                'creationAttempted': True, 'error': 'CREATION_OUTCOME_UNCERTAIN'}]}


if __name__ == '__main__':
    try:
        text = sys.stdin.read(16 * 1024 * 1024 + 1)
        if len(text) > 16 * 1024 * 1024:
            raise ValueError('Too large')
        print(json.dumps(process_confirmed_draft(json.loads(text))))
    except Exception:
        print('Confirmed draft worker rejected its request; do not retry blindly.', file=sys.stderr)
        sys.exit(1)
