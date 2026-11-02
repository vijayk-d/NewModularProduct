import base64,hashlib,importlib.util,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'python-worker'))
from gmail_message_style import style_email_body,THEME_MARKER
from gmail_draft_worker import _build_message
from gmail_send_worker import process_send
class Result:
 def __init__(self,value):self.value=value
 def execute(self,**kwargs):return self.value
class FakeGmail:
 def __init__(self):self.raw=None;self.sends=0
 def users(self):return self
 def getProfile(self,**kwargs):return Result({'emailAddress':'sender@example.test'})
 def messages(self):return self
 def send(self,**kwargs):self.raw=kwargs['body']['raw'];self.sends+=1;return Result({'id':'fake-confirmed-message','threadId':'fake-thread'})
class Tests(unittest.TestCase):
 def draft(self):return {'recipient':{'email':'ada@example.test'},'subject':'Reviewed subject','bodyPlainText':'Dear Ada,\n\nReviewed words £600K.\n\nWarm regards,\nTest Candidate','bodyHtml':'<p>Dear Ada,</p><p>Reviewed <mark style="background-color:#fff2a8">words £600K</mark>.</p><p>Warm regards,<br>Test Candidate</p>'}
 def test_light_blue_wrapper_and_inner_yellow_are_both_retained(self):
  body=self.draft()['bodyHtml'];result=style_email_body(body);self.assertIn('bgcolor="#f3f9ff"',result);self.assertIn('background-color:#f3f9ff',result);self.assertIn(body,result);self.assertIn('background-color:#fff2a8',result)
 def test_wrapper_is_idempotent(self):
  body=style_email_body(self.draft()['bodyHtml']);self.assertEqual(style_email_body(body),body);self.assertEqual(body.count(THEME_MARKER),1)
 def test_plain_recipient_subject_are_unchanged(self):
  draft=self.draft();message=_build_message(draft,'sender@example.test');self.assertEqual(message['To'],'ada@example.test');self.assertEqual(message['Subject'],'Reviewed subject');self.assertEqual(message.get_body(preferencelist=('plain',)).get_content().rstrip('\n'),draft['bodyPlainText']);self.assertIn(draft['bodyHtml'],message.get_body(preferencelist=('html',)).get_content())
 def test_signature_boundary_is_preserved_inside_the_wrapper(self):
  body=self.draft()['bodyHtml']+'<!-- application-gmail-signature:v1 --><p>Approved signature</p>';result=style_email_body(body);self.assertIn(body,result);self.assertEqual(result.count('application-gmail-signature:v1'),1)
 def test_no_font_or_line_height_rewrite(self):
  result=style_email_body('<p>Words</p>');self.assertNotIn('font-size',result);self.assertNotIn('font-family',result);self.assertNotIn('line-height',result)
 def test_no_theme_can_fix_unresolved_identity_placeholder(self):
  draft=self.draft();draft['bodyHtml']='<p>Dear {{firstname}},</p>'
  with self.assertRaises(ValueError):_build_message(draft,'sender@example.test')
 def test_frozen_prepared_mime_is_identical_at_fake_commit(self):
  with tempfile.TemporaryDirectory() as folder:
   cv=b'%PDF-1.4\nsynthetic CV';Path(folder,'cv.pdf').write_bytes(cv);draft=self.draft();draft['attachment']={'relativePath':'cv.pdf','name':'CV.pdf','sha256':hashlib.sha256(cv).hexdigest()};env={'ENABLE_GMAIL':'true','ENABLE_GMAIL_SENDING':'true','GMAIL_FROM_ADDRESS':'sender@example.test','CV_FOLDER':folder};service=FakeGmail()
   with patch.dict(os.environ,env):
    prepared=process_send({'action':'prepare','mode':'new','expectedAddress':env['GMAIL_FROM_ADDRESS'],'recipient':'ada@example.test','draft':draft},service_factory=lambda:service,env=env);self.assertTrue(prepared['ok']);self.assertEqual(service.sends,0);self.assertIn(THEME_MARKER,prepared['summary']['bodyHtml']);self.assertIn('#fff2a8',prepared['summary']['bodyHtml']);committed=process_send({'action':'commit','mode':'new','expectedAddress':env['GMAIL_FROM_ADDRESS'],'recipient':'ada@example.test','raw':prepared['raw'],'expectedHash':prepared['summary']['contentHash'],'expiresAt':9999999999999,'confirmed':True},service_factory=lambda:service,env=env);self.assertTrue(committed['sent']);self.assertEqual(service.sends,1);self.assertEqual(service.raw,prepared['raw'])
if __name__=='__main__':unittest.main()
