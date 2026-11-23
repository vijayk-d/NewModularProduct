import base64
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('reply_reader', Path(__file__).resolve().parents[2] / 'python-worker/gmail_reply_reader.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

ME = 'me@example.test'
ENV = {'GMAIL_FROM_ADDRESS': ME}


def b64(text):
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip('=')


def message(mid, sender, text, when, mime='text/plain'):
    return {'id': mid, 'internalDate': str(when), 'snippet': text[:40],
            'payload': {'mimeType': 'multipart/alternative', 'headers': [{'name': 'From', 'value': sender}, {'name': 'Date', 'value': 'Mon, 23 Nov 2026 10:00:00 +0000'}, {'name': 'Subject', 'value': 'Re: Application'}],
                        'parts': [{'mimeType': mime, 'body': {'data': b64(text)}}]}}


class Calls:
    def __init__(self, thread=None, mailbox=ME, error=None):
        self.thread, self.mailbox, self.error, self.calls = thread, mailbox, error, []

    def users(self):
        return self

    def getProfile(self, userId):
        self.calls.append(('getProfile', userId))
        return self._result({'emailAddress': self.mailbox})

    def threads(self):
        return self

    def get(self, userId, id, format):
        self.calls.append(('threads.get', id, format))
        if self.error:
            raise self.error
        return self._result(self.thread)

    def _result(self, value):
        return type('R', (), {'execute': lambda s: value})()


class HttpErr(Exception):
    def __init__(self, status):
        super().__init__('HttpError')
        self.resp = type('Resp', (), {'status': status})()


THREAD = {'messages': [
    message('m1', 'Me <me@example.test>', 'Dear Sam, my application.', 1),
    message('m2', 'Sam Recruiter <sam@agency.test>', 'Thanks. Please apply online via our portal.\n\nOn Mon, 23 Nov 2026, Me wrote:\n> Dear Sam, my application.', 2),
    message('m3', 'Me <me@example.test>', 'Will do.', 3),
    message('m4', 'Sam Recruiter <sam@agency.test>', '<p>Great &amp; thanks.</p><p>Speak soon</p>', 4, mime='text/html'),
]}


class GmailReplyReaderTests(unittest.TestCase):
    def test_reads_only_their_replies_after_the_sent_email_without_quoted_text(self):
        svc = Calls(THREAD)
        out = r.process_request({'action': 'read_replies', 'threadId': 'abc123def', 'expectedAddress': ME, 'sentMessageId': 'm1'}, lambda: svc, ENV)
        self.assertTrue(out['ok'])
        self.assertEqual([x['messageId'] for x in out['replies']], ['m2', 'm4'])
        self.assertEqual(out['replies'][0]['text'], 'Thanks. Please apply online via our portal.')
        self.assertEqual(out['replies'][0]['fromName'], 'Sam Recruiter')
        self.assertEqual(out['replies'][1]['text'], 'Great & thanks.\nSpeak soon')
        self.assertEqual(svc.calls, [('getProfile', 'me'), ('threads.get', 'abc123def', 'full')], 'one read of one thread; nothing else')

    def test_refuses_other_actions_wrong_sender_and_bad_thread_ids(self):
        self.assertEqual(r.process_request({'action': 'send'}, lambda: Calls(THREAD), ENV)['code'], 'INVALID_REQUEST')
        self.assertEqual(r.process_request({'action': 'read_replies', 'threadId': 'abc123def', 'expectedAddress': 'other@example.test'}, lambda: Calls(THREAD), ENV)['code'], 'SENDER_MISMATCH')
        self.assertEqual(r.process_request({'action': 'read_replies', 'threadId': 'abc123def', 'expectedAddress': ME}, lambda: Calls(THREAD, mailbox='x@example.test'), ENV)['code'], 'SENDER_MISMATCH')
        self.assertEqual(r.process_request({'action': 'read_replies', 'threadId': '../x', 'expectedAddress': ME}, lambda: Calls(THREAD), ENV)['code'], 'INVALID_THREAD')

    def test_missing_permission_and_deleted_threads_are_explained(self):
        req = {'action': 'read_replies', 'threadId': 'abc123def', 'expectedAddress': ME}
        self.assertEqual(r.process_request(req, lambda: Calls(error=HttpErr(403)), ENV)['code'], 'SCOPE_MISSING')
        self.assertEqual(r.process_request(req, lambda: Calls(error=HttpErr(404)), ENV)['code'], 'THREAD_NOT_FOUND')
        self.assertEqual(r.process_request(req, lambda: Calls(error=HttpErr(500)), ENV)['code'], 'READ_FAILED')

    def test_quoted_outlook_style_history_is_dropped(self):
        self.assertEqual(r.without_quoted('Hi,\nPlease apply.\n\n-----Original Message-----\nFrom: me'), 'Hi,\nPlease apply.')
        self.assertEqual(r.without_quoted('Thanks\n________________\nFrom: Me\nSent: Monday'), 'Thanks')


if __name__ == '__main__':
    unittest.main()
