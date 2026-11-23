import base64
import email
import importlib.util
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'python-worker'))
spec = importlib.util.spec_from_file_location('reply_draft', Path(__file__).resolve().parents[2] / 'python-worker/gmail_reply_draft_worker.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)

ME = 'me@example.test'
ENV = {'GMAIL_FROM_ADDRESS': ME}
HEADERS = [{'name': 'Subject', 'value': 'Re: Delivery Manager application'}, {'name': 'Message-ID', 'value': '<abc@agency.test>'}, {'name': 'References', 'value': '<first@me.test>'}]


class HttpErr(Exception):
    def __init__(self, status):
        super().__init__('HttpError')
        self.resp = type('Resp', (), {'status': status})()


class Service:
    def __init__(self, thread='thread123', update_error=None, create_error=None):
        self.thread, self.update_error, self.create_error, self.calls = thread, update_error, create_error, []

    def users(self):
        return self

    def getProfile(self, userId):
        return self._r({'emailAddress': ME})

    def messages(self):
        return self

    def drafts(self):
        return Drafts(self)

    def get(self, userId, id, format, metadataHeaders):
        self.calls.append(('messages.get', id, format))
        return self._r({'id': id, 'threadId': self.thread, 'payload': {'headers': HEADERS}})

    def _r(self, value):
        return type('R', (), {'execute': lambda s: value})()


class Drafts:
    def __init__(self, svc):
        self.svc = svc

    def create(self, userId, body):
        self.svc.calls.append(('drafts.create', body))
        if self.svc.create_error:
            raise self.svc.create_error
        return self.svc._r({'id': 'd-new', 'message': {'id': 'm-new', 'threadId': body['message']['threadId']}})

    def update(self, userId, id, body):
        self.svc.calls.append(('drafts.update', id))
        if self.svc.update_error:
            raise self.svc.update_error
        return self.svc._r({'id': id, 'message': {'id': 'm-upd', 'threadId': body['message']['threadId']}})


def request(**extra):
    return {'action': 'reply_draft', 'expectedAddress': ME, 'threadId': 'thread123', 'replyToMessageId': 'msg2', 'to': 'sam@agency.test',
            'bodyPlainText': 'Hello Sam,\n\nThank you.\n\nKind regards,\nVijay', 'bodyHtml': '<p>Hello Sam,</p><p>Thank you.</p>', **extra}


class ReplyDraftWorkerTests(unittest.TestCase):
    def test_creates_a_draft_in_their_thread_with_reply_headers_and_never_sends(self):
        svc = Service()
        out = w.process_request(request(), lambda: svc, ENV)
        self.assertTrue(out['ok'])
        self.assertEqual((out['draftId'], out['threadId'], out['updated']), ('d-new', 'thread123', False))
        body = next(c[1] for c in svc.calls if c[0] == 'drafts.create')
        self.assertEqual(body['message']['threadId'], 'thread123')
        msg = email.message_from_bytes(base64.urlsafe_b64decode(body['message']['raw']))
        self.assertEqual(msg['To'], 'sam@agency.test')
        self.assertEqual(msg['Subject'], 'Re: Delivery Manager application', 'no double "Re:"')
        self.assertEqual(msg['In-Reply-To'], '<abc@agency.test>')
        self.assertEqual(msg['References'], '<first@me.test> <abc@agency.test>')
        self.assertFalse(any(c[0].endswith('send') for c in svc.calls))

    def test_an_existing_draft_is_updated_not_duplicated_and_a_deleted_one_is_recreated(self):
        svc = Service()
        out = w.process_request(request(draftId='d-old'), lambda: svc, ENV)
        self.assertEqual((out['draftId'], out['updated']), ('d-old', True))
        self.assertNotIn('drafts.create', [c[0] for c in svc.calls])
        gone = Service(update_error=HttpErr(404))
        out = w.process_request(request(draftId='d-old'), lambda: gone, ENV)
        self.assertEqual((out['draftId'], out['updated']), ('d-new', False))

    def test_refusals_and_uncertain_outcomes(self):
        self.assertEqual(w.process_request({'action': 'send'}, lambda: Service(), ENV)['code'], 'INVALID_REQUEST')
        self.assertEqual(w.process_request(request(expectedAddress='x@example.test'), lambda: Service(), ENV)['code'], 'SENDER_MISMATCH')
        self.assertEqual(w.process_request(request(threadId='../x'), lambda: Service(), ENV)['code'], 'INVALID_THREAD')
        self.assertEqual(w.process_request(request(), lambda: Service(thread='other'), ENV)['code'], 'INVALID_THREAD')
        self.assertEqual(w.process_request(request(to='not-an-address'), lambda: Service(), ENV)['code'], 'INVALID_REPLY')
        self.assertEqual(w.process_request(request(bodyPlainText='Hi {{name}}'), lambda: Service(), ENV)['code'], 'INVALID_REPLY')
        svc = Service(create_error=HttpErr(500))
        self.assertEqual(w.process_request(request(), lambda: svc, ENV)['code'], 'DRAFT_UNCERTAIN')
        self.assertEqual(sum(1 for c in svc.calls if c[0] == 'drafts.create'), 1, 'no automatic retry')

    def test_reply_subject(self):
        self.assertEqual(w.reply_subject('Application'), 'Re: Application')
        self.assertEqual(w.reply_subject('RE: Application'), 'RE: Application')
        self.assertEqual(w.reply_subject(''), 'Re: Your message')


if __name__ == '__main__':
    unittest.main()
