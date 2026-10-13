import base64
import importlib.util
import os
import tempfile
import unittest
from email import policy
from email.parser import BytesParser
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('gmail_draft_worker', Path(__file__).resolve().parents[2] / 'python-worker/gmail_draft_worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def draft():
    return {'queueId': 'b55a4a60-6d8e-4ce9-a57d-efb674358400', 'recipient': {'email': 'alice@example.test'},
        'subject': 'Application', 'bodyPlainText': 'Dear Alice,\nSaved £1.8M.',
        'bodyHtml': 'Dear Alice,<br><mark style="background-color:#fff2a8">Saved £1.8M.</mark>', 'attachment': None}


class WorkerTests(unittest.TestCase):
    def test_multipart_message_preserves_text_and_highlight(self):
        message = worker._build_message(draft(), 'sender@example.test')
        self.assertIn('£1.8M', message.get_body(preferencelist=('plain',)).get_content())
        self.assertIn('<mark', message.get_body(preferencelist=('html',)).get_content())

    def test_send_is_rejected(self):
        with self.assertRaises(ValueError):
            worker.process_request({'action': 'send', 'drafts': [draft()]}, lambda: self.fail('must not authenticate'))

    def test_unavailable_service_is_failure_not_mock_success(self):
        with patch.dict(os.environ, {'GMAIL_FROM_ADDRESS': 'sender@example.test'}):
            result = worker.process_request({'action': 'draft', 'drafts': [draft()]}, lambda: None)
        self.assertEqual(result['sent'], 0)
        self.assertEqual(result['drafted'], 0)
        self.assertEqual(result['failed'], 1)
        self.assertIsNone(result['details'][0]['draftId'])

    def test_confirmed_draft_and_message_ids_are_distinct(self):
        class Service:
            def users(self): return self
            def drafts(self): return self
            def create(self, **kwargs):
                self.raw = kwargs['body']['message']['raw']
                return self
            def execute(self): return {'id': 'draft-1', 'message': {'id': 'message-1'}}
        service = Service()
        with patch.dict(os.environ, {'GMAIL_FROM_ADDRESS': 'sender@example.test'}):
            result = worker.process_request({'action': 'draft', 'drafts': [draft()]}, lambda: service)
        self.assertEqual(result['details'][0]['draftId'], 'draft-1')
        self.assertEqual(result['details'][0]['messageId'], 'message-1')
        message = BytesParser(policy=policy.default).parsebytes(base64.urlsafe_b64decode(service.raw))
        self.assertEqual(message['To'], 'alice@example.test')
        self.assertIn('<mark', message.get_body(preferencelist=('html',)).get_content())

    def test_missing_provider_id_is_unknown_not_success(self):
        class Service:
            def users(self): return self
            def drafts(self): return self
            def create(self, **kwargs): return self
            def execute(self): return {}
        with patch.dict(os.environ, {'GMAIL_FROM_ADDRESS': 'sender@example.test'}):
            result = worker.process_request({'action': 'draft', 'drafts': [draft()]}, Service)
        self.assertEqual(result['unknown'], 1)
        self.assertEqual(result['drafted'], 0)

    def test_pdf_attachment_and_traversal_boundary(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'CV_FOLDER': folder}):
            Path(folder, 'cv.pdf').write_bytes(b'%PDF-1.4\nsynthetic')
            item = draft(); item['attachment'] = {'relativePath': 'cv.pdf', 'name': 'Selected CV.pdf'}
            message = worker._build_message(item, 'sender@example.test')
            self.assertEqual(list(message.iter_attachments())[0].get_filename(), 'Selected CV.pdf')
            item['attachment']['relativePath'] = '../outside.pdf'
            with self.assertRaises(ValueError): worker._build_message(item, 'sender@example.test')


if __name__ == '__main__':
    unittest.main()
