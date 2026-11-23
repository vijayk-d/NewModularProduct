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


def message(mid, sender, text, when, mime='text/plain', thread='thread123'):
    return {'id': mid, 'threadId': thread, 'internalDate': str(when), 'snippet': text[:40],
            'payload': {'mimeType': 'multipart/alternative', 'headers': [{'name': 'From', 'value': sender}, {'name': 'Date', 'value': 'Mon, 23 Nov 2026 10:00:00 +0000'}, {'name': 'Subject', 'value': 'Re: Application'}],
                        'parts': [{'mimeType': mime, 'body': {'data': b64(text)}}]}}


THREAD = {'messages': [
    message('m1', 'Me <me@example.test>', 'Dear Sam, my application.', 1),
    message('m2', 'Sam Recruiter <sam@agency.test>', 'Thanks. Please apply online via our portal.\n\nOn Mon, 23 Nov 2026, Me wrote:\n> Dear Sam, my application.', 2),
    message('m3', 'Me <me@example.test>', 'Will do.', 3),
    message('m4', 'Sam Recruiter <sam@agency.test>', '<p>Great &amp; thanks.</p><p>Speak soon</p>', 4, mime='text/html'),
]}
SEARCHED = {'m2': THREAD['messages'][1], 'm9': message('m9', 'Andrew <andrew@client.test>', 'I am not involved in this requirement.', 9, thread='other99')}


class Service:
    def __init__(self, mailbox=ME, error=None, thread_error=None):
        self.mailbox, self.error, self.thread_error, self.calls = mailbox, error, thread_error, []

    def users(self):
        return self

    def getProfile(self, userId):
        self.calls.append('getProfile')
        return self._result({'emailAddress': self.mailbox})

    def threads(self):
        self._kind = 'threads'
        return self

    def messages(self):
        self._kind = 'messages'
        return self

    def get(self, userId, id, format):
        self.calls.append(f'{self._kind}.get:{id}:{format}')
        if self.error:
            raise self.error
        if self._kind == 'threads':
            if self.thread_error:
                raise self.thread_error
            return self._result(THREAD)
        if format == 'minimal':
            return self._result({'id': id, 'threadId': 'thread123'})
        return self._result(SEARCHED[id])

    def list(self, userId, q, maxResults):
        self.calls.append('messages.list:' + q)
        return self._result({'messages': [{'id': 'm2'}, {'id': 'm9'}]})

    def _result(self, value):
        return type('R', (), {'execute': lambda s: value})()


class HttpErr(Exception):
    def __init__(self, status):
        super().__init__('HttpError')
        self.resp = type('Resp', (), {'status': status})()


def find(svc, **extra):
    request = {'action': 'find_replies', 'expectedAddress': ME, 'threads': [{'threadId': 'thread123', 'sentMessageId': 'm1'}], **extra}
    return r.process_request(request, lambda: svc, ENV)


class GmailReplyReaderTests(unittest.TestCase):
    def test_replies_in_sent_threads_newest_first_without_quoted_text(self):
        svc = Service()
        out = find(svc)
        self.assertTrue(out['ok'])
        self.assertEqual([x['messageId'] for x in out['replies']], ['m4', 'm2'])
        self.assertEqual(out['replies'][1]['text'], 'Thanks. Please apply online via our portal.')
        self.assertEqual(out['replies'][0]['text'], 'Great & thanks.\nSpeak soon')
        self.assertEqual(svc.calls, ['getProfile', 'threads.get:thread123:full'], 'reads only that thread')

    def test_a_missing_thread_id_is_found_from_the_sent_message(self):
        svc = Service()
        out = find(svc, threads=[{'sentMessageId': 'm1'}])
        self.assertEqual([x['messageId'] for x in out['replies']], ['m4', 'm2'])
        self.assertIn('messages.get:m1:minimal', svc.calls)

    def test_contact_search_adds_replies_outside_the_sent_threads_once(self):
        svc = Service()
        out = find(svc, fromAddresses=['Andrew@Client.test', 'sam@agency.test', 'not-an-address'], after='2026/10/01')
        self.assertEqual([x['messageId'] for x in out['replies']], ['m9', 'm4', 'm2'])
        self.assertIn('messages.list:from:(andrew@client.test OR sam@agency.test) after:2026/10/01', svc.calls)
        self.assertNotIn('messages.get:m2:full', svc.calls, 'a message already found in a thread is not read again')
        self.assertEqual(out['replies'][0]['fromName'], 'Andrew')

    def test_refuses_other_actions_wrong_sender_bad_ids_and_nothing_to_search(self):
        self.assertEqual(r.process_request({'action': 'send'}, lambda: Service(), ENV)['code'], 'INVALID_REQUEST')
        self.assertEqual(find(Service(), expectedAddress='other@example.test')['code'], 'SENDER_MISMATCH')
        self.assertEqual(find(Service(mailbox='x@example.test'))['code'], 'SENDER_MISMATCH')
        self.assertEqual(find(Service(), threads=[{'threadId': '../x'}])['code'], 'INVALID_THREAD')
        self.assertEqual(find(Service(), threads=[], fromAddresses=[])['code'], 'NOTHING_TO_SEARCH')
        self.assertEqual(find(Service(), after='1 Nov')['code'], 'INVALID_REQUEST')

    def test_missing_permission_is_explained_and_a_deleted_thread_is_skipped(self):
        self.assertEqual(find(Service(error=HttpErr(403)))['code'], 'SCOPE_MISSING')
        self.assertEqual(find(Service(error=HttpErr(500)))['code'], 'READ_FAILED')
        out = find(Service(thread_error=HttpErr(404)))
        self.assertEqual((out['ok'], out['replies']), (True, []))

    def test_quoted_outlook_style_history_is_dropped(self):
        self.assertEqual(r.without_quoted('Hi,\nPlease apply.\n\n-----Original Message-----\nFrom: me'), 'Hi,\nPlease apply.')
        self.assertEqual(r.without_quoted('Thanks\n________________\nFrom: Me\nSent: Monday'), 'Thanks')


if __name__ == '__main__':
    unittest.main()
