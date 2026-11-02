import hashlib
import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

folder=Path(__file__).resolve().parents[2]/'python-worker'
sys.path.insert(0,str(folder))
spec=importlib.util.spec_from_file_location('confirmed_worker',folder/'gmail_confirmed_draft_worker.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
class Service:
 def __init__(self,mailbox='sender@example.test',missing=False):self.mailbox=mailbox;self.missing=missing;self.creates=0;self.mode='profile'
 def users(self):return self
 def getProfile(self,**kwargs):self.mode='profile';return self
 def drafts(self):return self
 def create(self,**kwargs):self.creates+=1;self.mode='create';return self
 def execute(self):return {'emailAddress':self.mailbox} if self.mode=='profile' else {} if self.missing else {'id':'draft-real','message':{'id':'message-real'}}
 def messages(self):raise AssertionError('must not send')
 def send(self,**kwargs):raise AssertionError('must not send')
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.pdf=Path(self.tmp.name,'cv.pdf');self.pdf.write_bytes(b'%PDF-1.4\nsynthetic');
  self.env={'ENABLE_GMAIL_DRAFT_CREATION':'true','GMAIL_FROM_ADDRESS':'sender@example.test','CV_FOLDER':self.tmp.name}
  self.request={'action':'draft','expectedAddress':'sender@example.test','drafts':[{'queueId':'queue-uuid','recipient':{'email':'matt@example.test'},'subject':'Reviewed subject','bodyPlainText':'Dear Matt,\nEvidence.','bodyHtml':'Dear Matt,<br>Evidence.','attachment':{'relativePath':'cv.pdf','name':'CV.pdf','sha256':hashlib.sha256(self.pdf.read_bytes()).hexdigest()}}]}
 def process(self,service):
  with patch.dict(os.environ,self.env):return worker.process_confirmed_draft(self.request,lambda:service)
 def test_disabled_does_not_create(self):
  self.env['ENABLE_GMAIL_DRAFT_CREATION']='false';service=Service();result=self.process(service);self.assertFalse(result['details'][0]['creationAttempted']);self.assertEqual(service.creates,0)
 def test_confirmed_ids_and_profile(self):
  service=Service();result=self.process(service);self.assertTrue(result['profileVerified']);self.assertEqual(result['details'][0]['draftId'],'draft-real');self.assertEqual(result['details'][0]['messageId'],'message-real');self.assertEqual(result['sent'],0);self.assertEqual(service.creates,1)
 def test_mailbox_mismatch_no_create(self):
  service=Service('other@example.test');result=self.process(service);self.assertEqual(service.creates,0);self.assertFalse(result['details'][0]['creationAttempted'])
 def test_actual_attached_bytes_must_match_preview(self):
  self.pdf.write_bytes(b'%PDF changed');service=Service();result=self.process(service);self.assertEqual(service.creates,0);self.assertFalse(result['details'][0]['creationAttempted'])
 def test_missing_id_is_unknown_not_success(self):
  result=self.process(Service(missing=True));self.assertEqual(result['details'][0]['status'],'unknown');self.assertEqual(result['drafted'],0)
 def test_send_action_is_not_supported(self):
  self.request['action']='send';service=Service();result=self.process(service);self.assertEqual(service.creates,0);self.assertFalse(result['details'][0]['creationAttempted'])
if __name__=='__main__':unittest.main()
