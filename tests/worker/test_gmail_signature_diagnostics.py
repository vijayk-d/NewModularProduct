import importlib.util,pathlib,unittest
p=pathlib.Path(__file__).resolve().parents[2]/'python-worker/gmail_signature_diagnostics.py'
spec=importlib.util.spec_from_file_location('signature_diag',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Fake:
    def __init__(self,mail='sender@fixture.test'):self.mail=mail;self.mode='';self.requested=None
    def users(self):return self
    def getProfile(self,**kwargs):self.mode='profile';return self
    def settings(self):return self
    def sendAs(self):return self
    def get(self,**kwargs):self.mode='signature';self.requested=kwargs;return self
    def execute(self):return {'emailAddress':self.mail} if self.mode=='profile' else {'signature':'<b>Private signature</b>'}
class Tests(unittest.TestCase):
    def test_metadata_only(self):
        f=Fake();r=m.inspect_signature(f,'sender@fixture.test');self.assertTrue(r['signaturePresent']);self.assertNotIn('signature',r);self.assertFalse(r['sent']);self.assertFalse(r['settingsChanged']);self.assertEqual(f.requested['sendAsEmail'],'sender@fixture.test')
    def test_sender_mismatch(self):
        f=Fake('other@fixture.test');r=m.inspect_signature(f,'sender@fixture.test');self.assertEqual(r['code'],'SIGNATURE_MAILBOX_MISMATCH');self.assertIsNone(f.requested)
if __name__=='__main__':unittest.main()
