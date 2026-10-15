import importlib.util
import sys
import unittest
from pathlib import Path

worker_dir=Path(__file__).resolve().parents[2]/'python-worker'
sys.path.insert(0,str(worker_dir))
spec=importlib.util.spec_from_file_location('gmail_mailbox_check',worker_dir/'gmail_mailbox_check.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
env={'ENABLE_GMAIL_MAILBOX_CHECK':'true','GMAIL_FROM_ADDRESS':'sender@example.test','GMAIL_OAUTH_CLIENT_ID':'PRIVATE_ID','GMAIL_OAUTH_CLIENT_SECRET':'PRIVATE_SECRET','GMAIL_OAUTH_REFRESH_TOKEN':'PRIVATE_TOKEN'}
request={'action':'check_mailbox','expectedAddress':'sender@example.test'}
class Service:
    def __init__(self,mailbox):self.mailbox=mailbox;self.reads=0
    def users(self):return self
    def getProfile(self,**kwargs):self.reads+=1;return self
    def execute(self):return {'emailAddress':self.mailbox,'messagesTotal':123,'historyId':'PRIVATE_HISTORY'}
    def drafts(self):raise AssertionError('must not touch drafts')
    def messages(self):raise AssertionError('must not touch messages')
class Tests(unittest.TestCase):
    def test_profile_match_is_read_only(self):
        service=Service('sender@example.test');result=worker.check_mailbox(request,lambda:service,env)
        self.assertTrue(result['ok']);self.assertEqual(service.reads,1);self.assertFalse(result['sent']);self.assertFalse(result['draftCreated']);self.assertNotIn('historyId',result)
    def test_profile_mismatch_is_not_success(self):
        result=worker.check_mailbox(request,lambda:Service('other@example.test'),env)
        self.assertFalse(result['ok']);self.assertTrue(result['authenticated']);self.assertEqual(result['code'],'GMAIL_MAILBOX_MISMATCH')
    def test_disabled_or_missing_configuration_does_not_authenticate(self):
        factory=lambda:self.fail('must not authenticate')
        self.assertEqual(worker.check_mailbox(request,factory,{**env,'ENABLE_GMAIL_MAILBOX_CHECK':'false'})['code'],'GMAIL_CHECK_DISABLED')
        self.assertEqual(worker.check_mailbox(request,factory,{**env,'GMAIL_OAUTH_REFRESH_TOKEN':''})['code'],'GMAIL_CHECK_CONFIGURATION')
    def test_changed_expected_target_does_not_authenticate(self):
        result=worker.check_mailbox({**request,'expectedAddress':'other@example.test'},lambda:self.fail('must not authenticate'),env)
        self.assertEqual(result['code'],'GMAIL_CHECK_CONFIGURATION')
    def test_revoked_error_is_sanitized(self):
        def factory():raise RuntimeError('invalid_grant PRIVATE_TOKEN')
        result=worker.check_mailbox(request,factory,env)
        self.assertEqual(result['code'],'GMAIL_OAUTH_REVOKED');self.assertNotIn('PRIVATE',str(result))
if __name__=='__main__':unittest.main()
