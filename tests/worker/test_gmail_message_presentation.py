import importlib.util,sys,unittest,tempfile,hashlib,os
from pathlib import Path
from unittest.mock import patch
folder=Path(__file__).resolve().parents[2]/'python-worker'
spec=importlib.util.spec_from_file_location('signature_reader',folder/'gmail_signature_reader.py');reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
spec2=importlib.util.spec_from_file_location('signature_mime_builder',folder/'gmail_draft_worker.py');worker=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(worker)
class Result:
 def __init__(self,data):self.data=data
 def execute(self,**kw):return self.data
class Service:
 def __init__(self,mailbox='sender@example.test',alias=None,signature='<b>Test Person</b>'):self.mailbox=mailbox;self.alias=alias or mailbox;self.signature=signature;self.reads=[]
 def users(self):return self
 def getProfile(self,**kw):self.reads.append('profile');return Result({'emailAddress':self.mailbox})
 def settings(self):return self
 def sendAs(self):return self
 def get(self,**kw):self.reads.append('signature');return Result({'sendAsEmail':self.alias,'signature':self.signature})
 def drafts(self):raise AssertionError('must not touch drafts')
 def messages(self):raise AssertionError('must not touch messages')
class Tests(unittest.TestCase):
 def parse(self,s):p=reader.SignatureParser();p.feed(s);p.close();return p.result()
 def test_read_is_profile_and_signature_only(self):
  s=Service();r=reader.read_signature(s,'sender@example.test');self.assertTrue(r['ok']);self.assertEqual(s.reads,['profile','signature'])
 def test_mailbox_mismatch_stops_before_settings(self):
  s=Service('other@example.test')
  with self.assertRaises(ValueError):reader.read_signature(s,'sender@example.test')
  self.assertEqual(s.reads,['profile'])
 def test_alias_mismatch_rejects(self):
  with self.assertRaises(ValueError):reader.read_signature(Service(alias='other@example.test'),'sender@example.test')
 def test_empty_image_only_and_oversized_signature_reject(self):
  for html in ['', '<img src="https://example.test/logo">', 'x'*100001]:
   with self.assertRaises(ValueError):reader.read_signature(Service(signature=html),'sender@example.test')
 def test_tables_names_unicode_and_https_images_preserved(self):
  r=self.parse('<table><tr><td><b>Renée — £2M</b><img src="https://example.test/logo.png" alt="Logo" width="90"></td></tr></table>')
  self.assertIn('<table>',r['html']);self.assertIn('Renée — £2M',r['plainText']);self.assertTrue(r['containsImages']);self.assertIn('https://example.test/logo.png',r['html'])
 def test_active_markup_and_event_handlers_removed(self):
  r=self.parse('<script>PRIVATE_SCRIPT</script><div onclick="bad()">Name<img src="javascript:bad()"><iframe>HIDDEN</iframe></div>')
  self.assertNotIn('script',r['html']);self.assertNotIn('PRIVATE_SCRIPT',r['plainText']);self.assertNotIn('onclick',r['html']);self.assertNotIn('javascript',r['html']);self.assertNotIn('HIDDEN',r['plainText'])
 def test_unsafe_css_removed_without_image_download(self):
  r=self.parse('<span style="color:#123456;background-image:url(https://bad.test);width:expression(bad);font-weight:bold">Name</span>')
  self.assertIn('color:#123456',r['html']);self.assertNotIn('url(',r['html']);self.assertNotIn('expression',r['html'])
 def test_links_include_only_safe_schemes(self):
  r=self.parse('<a href="javascript:bad()">Bad</a><a href="mailto:a@example.test">Email</a><a href="https://example.test">Web</a>')
  self.assertNotIn('javascript',r['html']);self.assertIn('mailto:a@example.test',r['html']);self.assertIn('noopener noreferrer',r['html'])
 def test_mime_preserves_closing_signature_and_original_pdf_bytes(self):
  with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'CV_FOLDER':root}):
   content=b'%PDF-1.4 synthetic unchanged';p=Path(root)/'internal.pdf';p.write_bytes(content)
   body='Dear Zoe,\n\nEvidence £2M.\n\nWarm regards,\nTest Person\n\n-- \nTest Person\nContact details'
   draft={'recipient':{'email':'zoe@example.test'},'subject':'Application','bodyPlainText':body,'bodyHtml':body.replace('\n','<br>'),'attachment':{'relativePath':'internal.pdf','name':'Test_Person_Agile_Coach_CV.pdf'}}
   message=worker._build_message(draft,'sender@example.test');part=list(message.iter_attachments())[0]
   self.assertEqual(part.get_filename(),'Test_Person_Agile_Coach_CV.pdf');self.assertEqual(part.get_payload(decode=True),content);self.assertEqual(p.read_bytes(),content);self.assertIn('Warm regards,\nTest Person\n\n-- \nTest Person',message.get_body(preferencelist=('plain',)).get_content())
 def test_bad_display_names_reject(self):
  with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'CV_FOLDER':root}):
   Path(root,'cv.pdf').write_bytes(b'%PDF test')
   for name in ['cv.exe','../cv.pdf','bad\x00.pdf','bad\n.pdf','bad:cv.pdf','x'*181+'.pdf']:
    draft={'recipient':{'email':'zoe@example.test'},'subject':'Application','bodyPlainText':'Body','bodyHtml':'Body','attachment':{'relativePath':'cv.pdf','name':name}}
    with self.assertRaises(ValueError):worker._build_message(draft,'sender@example.test')
if __name__=='__main__':unittest.main()
