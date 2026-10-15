import base64,hashlib,importlib.util,os,sys,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
folder=Path(__file__).resolve().parents[2]/'python-worker';sys.path.insert(0,str(folder));spec=importlib.util.spec_from_file_location('send',folder/'gmail_send_worker.py');worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
class Result:
 def __init__(self,v):self.v=v
 def execute(self,**kw):
  assert kw.get('num_retries')==0
  if isinstance(self.v,Exception):raise self.v
  return self.v
class Resource:
 def __init__(self,s,kind):self.s=s;self.kind=kind
 def get(self,**kw):return Result({'id':kw['id'],'message':{'raw':self.s.raw}})
 def send(self,**kw):self.s.sends.append((self.kind,kw));return Result(self.s.result)
 def create(self,**kw):raise AssertionError('must not create drafts while sending')
class Service:
 def __init__(self,raw):self.raw=raw;self.mailbox='sender@business.test';self.result={'id':'message-test','threadId':'thread-test'};self.sends=[]
 def users(self):return self
 def getProfile(self,**kw):return Result({'emailAddress':self.mailbox})
 def drafts(self):return Resource(self,'draft')
 def messages(self):return Resource(self,'new')
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.pdf=Path(self.tmp.name)/'cv.pdf';self.pdf.write_bytes(b'%PDF fixture');self.env={'ENABLE_GMAIL':'true','ENABLE_GMAIL_SENDING':'true','GMAIL_FROM_ADDRESS':'sender@business.test','CV_FOLDER':self.tmp.name}
  self.draft={'recipient':{'email':'zoe@business.test'},'subject':'Application','bodyPlainText':'Dear Zoe,\n\nEvidence worth £2M.\n\nWarm regards,\nVijay DAFAL','bodyHtml':'Dear Zoe,<br>Evidence worth £2M.<br>Warm regards,<br>Vijay DAFAL','attachment':{'relativePath':'cv.pdf','name':'CV.pdf','sha256':hashlib.sha256(self.pdf.read_bytes()).hexdigest()}}
  with patch.dict(os.environ,self.env):self.message=worker._build_message(self.draft,self.env['GMAIL_FROM_ADDRESS'])
  self.service=Service(self.encode())
 def encode(self):return base64.urlsafe_b64encode(self.message.as_bytes()).decode()
 def call(self,action='prepare',mode='new',**kw):
  req={'action':action,'mode':mode,'expectedAddress':'sender@business.test','recipient':'zoe@business.test','draft':self.draft,'draftId':'draft-test','expiresAt':time.time()*1000+60000,**kw}
  with patch.dict(os.environ,self.env):return worker.process_send(req,lambda:self.service,self.env)
 def commit(self,p,mode='new',**kw):return self.call('commit',mode,confirmed=True,raw=p['raw'],expectedHash=p['summary']['contentHash'],**kw)
 def test_flags_block_without_authentication(self):
  self.env['ENABLE_GMAIL_SENDING']='false';r=worker.process_send({'action':'prepare'},lambda:self.fail('must not auth'),self.env);self.assertFalse(r['sendingAttempted'])
 def test_prepare_is_read_only_and_utf8(self):
  p=self.call();self.assertTrue(p['ok']);self.assertIn('£2M',p['summary']['bodyPlainText']);self.assertEqual(self.service.sends,[])
 def test_new_and_repeat_use_messages(self):
  for mode in ('new','repeat'):
   p=self.call(mode=mode);self.assertTrue(self.commit(p,mode)['sent']);self.assertEqual(self.service.sends[-1][0],'new')
 def test_existing_draft_binds_id_and_approved_raw(self):
  p=self.call(mode='draft');self.assertTrue(self.commit(p,'draft')['sent']);kind,kw=self.service.sends[0];self.assertEqual(kind,'draft');self.assertEqual(kw['body']['id'],'draft-test');self.assertEqual(kw['body']['message']['raw'],p['raw'])
 def test_wrong_mailbox_sender_and_recipient_block(self):
  self.service.mailbox='other@business.test';self.assertFalse(self.call()['sendingAttempted']);self.service.mailbox='sender@business.test'
  for key,value in [('To','other@business.test'),('From','other@business.test')]:
   old=self.message[key];self.message.replace_header(key,value);self.service.raw=self.encode();self.assertFalse(self.call(mode='draft')['ok']);self.message.replace_header(key,old)
  self.assertEqual(self.service.sends,[])
 def test_cc_and_bcc_block(self):
  for key in ('Cc','Bcc'):
   self.message[key]='other@business.test';self.service.raw=self.encode();self.assertFalse(self.call(mode='draft')['ok']);del self.message[key]
  self.assertEqual(self.service.sends,[])
 def test_expiry_and_unconfirmed_commit_block(self):
  p=self.call();self.assertFalse(self.commit(p,expiresAt=0)['sendingAttempted']);r=self.call('commit',raw=p['raw'],expectedHash=p['summary']['contentHash'],confirmed=False);self.assertFalse(r['sendingAttempted']);self.assertEqual(self.service.sends,[])
 def test_changed_hash_and_remote_draft_block(self):
  p=self.call(mode='draft');self.message.replace_header('Subject','Changed');self.service.raw=self.encode();self.assertFalse(self.commit(p,'draft')['sendingAttempted']);r=self.call('commit',raw=p['raw'],expectedHash='0'*64,confirmed=True);self.assertFalse(r['sendingAttempted'])
 def test_changed_cv_blocks_preparation(self):
  self.pdf.write_bytes(b'changed');self.assertFalse(self.call()['ok']);self.assertEqual(self.service.sends,[])
 def test_transport_and_missing_id_are_uncertain(self):
  for response in ({},RuntimeError('network')):
   self.service.result=response;p=self.call();r=self.commit(p);self.assertTrue(r['sendingAttempted']);self.assertTrue(r['unknown'])
 def test_disabled_after_prepare_blocks_commit(self):
  p=self.call();self.env['ENABLE_GMAIL']='false';self.assertFalse(self.commit(p)['sendingAttempted']);self.assertEqual(self.service.sends,[])
if __name__=='__main__':unittest.main()
