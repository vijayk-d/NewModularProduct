import base64,hashlib,unittest
from email.message import EmailMessage
from cv_docx import write_word,MIME
from gmail_update_draft_worker import process_update,SEP,MARK
ACCOUNT='sender@example.test';TO='ada@example.test';PLAIN='Dear Ada,\n\nI led delivery.\n\nWarm regards,\nTest Candidate';HTML='<p>Dear Ada,</p><p>I led delivery.</p><p>Warm regards,<br>Test Candidate</p>';NEW=PLAIN.replace('led delivery','led strategic delivery');NEWHTML=HTML.replace('led delivery','led <strong>strategic delivery</strong>');ENV={'ENABLE_GMAIL':'true','ENABLE_GMAIL_DRAFT_UPDATES':'true','GMAIL_FROM_ADDRESS':ACCOUNT}
h=lambda s:hashlib.sha256(s.encode()).hexdigest()
def raw(signature=False):
 m=EmailMessage();m['To']=TO;m['From']=ACCOUNT;m['Subject']='Reviewed subject';m.set_content(PLAIN+(SEP+'Existing signature' if signature else ''));m.add_alternative(HTML+('<br><br>'+MARK+'<div>Existing signature</div>' if signature else ''),subtype='html');m.add_attachment(write_word('Synthetic CV evidence'),maintype='application',subtype=MIME.split('/',1)[1],filename='Test_CV.docx');return base64.urlsafe_b64encode(m.as_bytes()).decode()
class Execution:
 def __init__(self,fn):self.fn=fn
 def execute(self,**kw):return self.fn()
class Gmail:
 def __init__(self,signature=False):self.raw=raw(signature);self.updates=[];self.mailbox=ACCOUNT;self.labels=['DRAFT'];self.fail_after_write=False;self.wrong_id=False
 def users(self):return self
 def getProfile(self,**kw):return Execution(lambda:{'emailAddress':self.mailbox})
 def drafts(self):return self
 def get(self,**kw):return Execution(lambda:{'id':'draft-1','message':{'id':'message-1','threadId':'thread-1','labelIds':self.labels,'raw':self.raw}})
 def update(self,**kw):
  def action():
   self.updates.append(kw);self.raw=kw['body']['message']['raw']
   if self.fail_after_write:raise TimeoutError('Synthetic uncertainty')
   return {'id':'other' if self.wrong_id else 'draft-1'}
  return Execution(action)
 def create(self,**kw):raise AssertionError('No duplicate drafts')
 def send(self,**kw):raise AssertionError('No sending')
 def messages(self):raise AssertionError('No sending')
def prepare(g,**extra):
 r={'action':'prepare_update','expectedAddress':ACCOUNT,'recipient':TO,'draftId':'draft-1','firstName':'Ada','candidateName':'Test Candidate','bodyPlainText':NEW,'bodyHtml':NEWHTML,'expectedLetterHash':h(PLAIN),'expectedHtmlHash':h(HTML),'expectedSubject':'Reviewed subject'};r.update(extra);return process_update(r,service_factory=lambda:g,env=ENV,clock=lambda:1000)
def commit(g,p,**extra):
 r={'action':'commit_update','expectedAddress':ACCOUNT,'recipient':TO,'draftId':'draft-1','confirmed':True,'expiresAt':100000,'beforeHash':p['beforeHash'],'raw':p['raw'],'contentHash':p['contentHash']};r.update(extra);return process_update(r,service_factory=lambda:g,env=ENV,clock=lambda:1000)
class Tests(unittest.TestCase):
 def test_disabled_default(self):self.assertEqual(process_update({'action':'prepare_update'},service_factory=lambda:self.fail('No authentication'),env={})['error'],'DRAFT_UPDATE_DISABLED')
 def test_read_only_preview(self):
  g=Gmail();p=prepare(g);self.assertTrue(p['ok']);self.assertFalse(p['updateAttempted']);self.assertEqual(g.updates,[])
 def test_same_draft_once_cv_unchanged(self):
  g=Gmail();p=prepare(g);r=commit(g,p);self.assertTrue(r['updated']);self.assertFalse(r['sent']);self.assertEqual(len(g.updates),1);self.assertEqual(g.updates[0]['id'],'draft-1');self.assertEqual(p['before']['attachment'],p['proposed']['attachment'])
 def test_signature_once(self):
  g=Gmail(True);p=prepare(g);self.assertTrue(p['ok']);self.assertEqual(p['proposed']['bodyHtml'].count(MARK),1);self.assertEqual(p['proposed']['bodyPlainText'].count(SEP),1);self.assertTrue(commit(g,p)['updated'])
 def test_text_conflict(self):self.assertEqual(prepare(Gmail(),expectedLetterHash=h('different'))['error'],'GMAIL_DRAFT_DIFFERS_FROM_LOCAL_SNAPSHOT')
 def test_format_conflict(self):self.assertEqual(prepare(Gmail(),expectedHtmlHash=h('different'))['error'],'GMAIL_DRAFT_DIFFERS_FROM_LOCAL_SNAPSHOT')
 def test_change_after_approval(self):
  g=Gmail();p=prepare(g);g.raw=raw(True);self.assertEqual(commit(g,p)['error'],'GMAIL_DRAFT_CHANGED_AFTER_APPROVAL');self.assertEqual(g.updates,[])
 def test_confirmation_expiry(self):
  for extra in [{'confirmed':False},{'expiresAt':999}]:
   g=Gmail();p=prepare(g);self.assertFalse(commit(g,p,**extra)['updateAttempted']);self.assertEqual(g.updates,[])
 def test_sent_rejected(self):
  g=Gmail();g.labels=['SENT'];self.assertFalse(prepare(g)['ok']);self.assertEqual(g.updates,[])
 def test_wrong_mailbox_recipient(self):
  g=Gmail();g.mailbox='other@example.test';self.assertEqual(prepare(g)['error'],'MAILBOX_MISMATCH');self.assertFalse(prepare(Gmail(),recipient='other@example.test')['ok'])
 def test_signature_duplicate_rejected(self):self.assertFalse(prepare(Gmail(),bodyHtml=NEWHTML+MARK)['ok'])
 def test_uncertain_not_retried(self):
  g=Gmail();p=prepare(g);g.fail_after_write=True;r=commit(g,p);self.assertTrue(r['unknown']);self.assertFalse(r['updated']);self.assertEqual(len(g.updates),1)
 def test_provider_identity_mismatch(self):
  g=Gmail();p=prepare(g);g.wrong_id=True;self.assertTrue(commit(g,p)['unknown'])
 def test_replay(self):
  g=Gmail();p=prepare(g);self.assertTrue(commit(g,p)['updated']);self.assertFalse(commit(g,p)['updated']);self.assertEqual(len(g.updates),1)
 def test_subject_opt_in(self):
  g=Gmail();self.assertEqual(prepare(g)['proposed']['subject'],'Reviewed subject');self.assertEqual(prepare(g,updateSubject=True,subject='New subject')['proposed']['subject'],'New subject')
if __name__=='__main__':unittest.main()
