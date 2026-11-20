import base64,hashlib,importlib.util,json,sys,tempfile,unittest,urllib.parse
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('scheduler_setup',ROOT/'configure_cloud_scheduler.py');setup=importlib.util.module_from_spec(spec);spec.loader.exec_module(setup)
spec=importlib.util.spec_from_file_location('setup_support',ROOT/'scheduler_setup_support.py');support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
class Result:
 def __init__(self,value):self.value=value
 def execute(self,**kwargs):
  assert kwargs.get('num_retries')==0
  if isinstance(self.value,Exception):raise self.value
  return self.value
class Sheets:
 def __init__(self):self.creates=0;self.updates=0;self.updated_result={'updatedRows':4};self.owner='sender@example.test';self.extra_permissions=[];self.create_result={'spreadsheetId':'private-sheet-fixture'}
 def permissions(self):return self
 def list(self,**kwargs):return Result({'permissions':[{'type':'user','role':'owner','emailAddress':self.owner}]+self.extra_permissions})
 def spreadsheets(self):return self
 def values(self):return self
 def create(self,**kwargs):self.creates+=1;self.created_body=kwargs['body'];return Result(self.create_result)
 def update(self,**kwargs):self.updates+=1;return Result(self.updated_result)
 def get(self,**kwargs):return Result({'values':[['schema',support.SCHEMA],['owner',self.owner],['namespace','11111111-1111-1111-1111-111111111111'],['environment','production']]})
class SetupTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
 def client(self,**kwargs):
  v={'installed':{'client_id':'scheduler.apps.googleusercontent.com','client_secret':'private-client-secret','project_id':'dedicated-scheduler','auth_uri':'https://accounts.google.com/o/oauth2/auth','token_uri':setup.TOKEN_URL}};v['installed'].update(kwargs);p=self.root/'client.json';p.write_text(json.dumps(v),encoding='utf-8');return p
 def test_pkce_challenge_matches_sha256(self):
  verifier,challenge=setup.pkce();self.assertTrue(43<=len(verifier)<=128);self.assertEqual(challenge,base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('='))
 def test_desktop_client_standard_google_auth_uri_is_accepted(self):
  self.assertEqual(setup.load_desktop_client(self.client(),{})['project_id'],'dedicated-scheduler')
 def test_google_errors_name_the_stage_and_reason_without_tokens(self):
  import io,urllib.error
  body=json.dumps({'error':'invalid_grant','error_description':'Bad Request','access_token':'ya29.secret-token'}).encode()
  fail=urllib.error.HTTPError(setup.TOKEN_URL,400,'Bad Request',{},io.BytesIO(body))
  with patch.object(setup.urllib.request,'urlopen',side_effect=fail):
   with self.assertRaises(RuntimeError) as caught:setup.google_json(setup.TOKEN_URL,body={'code':'x'},stage='Token exchange')
  message=str(caught.exception)
  self.assertIn('Token exchange request failed (HTTP 400, invalid_grant: Bad Request)',message)
  self.assertNotIn('ya29',message)
  with patch.object(setup.urllib.request,'urlopen',side_effect=OSError('offline')):
   with self.assertRaises(RuntimeError) as caught:setup.google_json(setup.USERINFO_URL,access_token='t',stage='Account identity')
  self.assertIn('Account identity request could not reach Google (OSError)',str(caught.exception))
 def test_existing_production_gmail_client_cannot_be_reused(self):
  with self.assertRaises(RuntimeError):setup.load_desktop_client(self.client(),{'GMAIL_OAUTH_CLIENT_ID':'scheduler.apps.googleusercontent.com'})
 def test_web_client_file_cannot_accidentally_enter_desktop_flow(self):
  p=self.root/'web.json';p.write_text('{"web":{}}',encoding='utf-8')
  with self.assertRaises(RuntimeError):setup.load_desktop_client(p,{})
 def test_non_google_oauth_endpoints_are_refused(self):
  with self.assertRaises(RuntimeError):setup.load_desktop_client(self.client(auth_uri='https://example.test/auth'),{})
 def test_auth_url_has_pkce_state_and_no_client_secret(self):
  client=setup.load_desktop_client(self.client(),{});url=setup.authorization_url(client,'sender@example.test','http://127.0.0.1:9999/','random-state','challenge');q=urllib.parse.parse_qs(urllib.parse.urlsplit(url).query);self.assertEqual(q['code_challenge_method'],['S256']);self.assertEqual(q['state'],['random-state']);self.assertNotIn('private-client-secret',url);self.assertNotIn('include_granted_scopes',q)
 def test_missing_granted_scope_blocks_storage(self):
  with self.assertRaises(RuntimeError):setup.validate_tokens({'scope':setup.SCOPES[0],'refresh_token':'private-refresh'},'sender@example.test',{'email':'sender@example.test','verified_email':True})
 def test_wrong_google_account_blocks_storage(self):
  with self.assertRaises(RuntimeError):setup.validate_tokens({'scope':' '.join(setup.SCOPES),'refresh_token':'private-refresh'},'sender@example.test',{'email':'other@example.test','verified_email':True})
 def test_unverified_account_blocks_storage(self):
  with self.assertRaises(RuntimeError):setup.validate_tokens({'scope':' '.join(setup.SCOPES),'refresh_token':'private-refresh'},'sender@example.test',{'email':'sender@example.test','verified_email':False})
 def test_valid_identity_returns_only_refresh_for_private_local_storage(self):
  self.assertEqual(setup.validate_tokens({'scope':' '.join(setup.SCOPES),'refresh_token':'private-refresh'},'sender@example.test',{'email':'sender@example.test','verified_email':True}),'private-refresh')
 def test_config_updates_preserve_gmail_flags_comments_and_windows_paths(self):
  p=self.root/'.env';raw=b"\xef\xbb\xbf# retained comment\r\nGMAIL_OAUTH_REFRESH_TOKEN='existing-gmail'\r\nENABLE_GMAIL_SENDING=false\r\nCV_FOLDER='D:\\OneDrive Folder\\CV'\r\n";p.write_bytes(raw)
  setup.update_config(p,{'CLOUD_SCHEDULER_OAUTH_REFRESH_TOKEN':'new-scheduler'},raw,self.root/'backup')
  after=p.read_bytes();self.assertTrue(after.startswith(b'\xef\xbb\xbf'));self.assertIn(b'\r\n',after);self.assertIn(b"GMAIL_OAUTH_REFRESH_TOKEN='existing-gmail'",after);self.assertIn(b'ENABLE_GMAIL_SENDING=false',after);self.assertIn(b'D:\\OneDrive Folder\\CV',after);self.assertEqual((self.root/'backup/config.before').read_bytes(),raw)
 def test_google_credentials_and_flags_are_not_writable_targets(self):
  p=self.root/'.env';p.write_bytes(b'original')
  for key in ['GMAIL_OAUTH_REFRESH_TOKEN','ENABLE_GMAIL_SENDING','ENABLE_CLOUD_SCHEDULING']:
   with self.assertRaises(RuntimeError):setup.update_config(p,{key:'true'},b'original',self.root/'backup')
  self.assertEqual(p.read_bytes(),b'original')
 def test_concurrent_configuration_change_is_not_overwritten(self):
  p=self.root/'.env';p.write_bytes(b'changed')
  with self.assertRaises(RuntimeError):setup.update_config(p,{'CLOUD_SCHEDULER_NAMESPACE':'value'},b'old',self.root/'backup')
  self.assertEqual(p.read_bytes(),b'changed')
 def test_duplicate_scheduler_keys_are_not_silently_resolved(self):
  p=self.root/'.env';raw=b'CLOUD_SCHEDULER_NAMESPACE=first\nCLOUD_SCHEDULER_NAMESPACE=second\n';p.write_bytes(raw)
  with self.assertRaises(RuntimeError):setup.update_config(p,{'CLOUD_SCHEDULER_NAMESPACE':'value'},raw,self.root/'backup')
 def test_env_parser_preserves_quoted_punctuation_and_bom(self):
  p=self.root/'.env';p.write_text('\ufeffCV_FOLDER="D:\\OneDrive Folder\\CV"\nVALUE="A & B ! 100% # value"\n',encoding='utf-8');env=setup.load_config(p);self.assertEqual(env['CV_FOLDER'],'D:\\OneDrive Folder\\CV');self.assertEqual(env['VALUE'],'A & B ! 100% # value')
 def test_ambiguous_creation_receipt_blocks_another_creation(self):
  with patch.object(setup,'ROOT',self.root):
   folder=self.root/'var/maintenance/scheduler-setup/operations';folder.mkdir(parents=True);p=folder/'op.json';setup.save_operation(p,{'configTarget':str(self.root/'.env'),'status':'UNKNOWN'});self.assertEqual(len(setup.pending_creations(self.root/'.env')),1);setup.save_operation(p,{'configTarget':str(self.root/'.env'),'status':'CONFIGURED'});self.assertEqual(setup.pending_creations(self.root/'.env'),[])
class PrivateSheetCreationTests(unittest.TestCase):
 def setUp(self):self.api=Sheets();self.env={'GMAIL_FROM_ADDRESS':'sender@example.test','CLOUD_SCHEDULER_SPREADSHEET_ID':'private-sheet-fixture','CLOUD_SCHEDULER_NAMESPACE':'11111111-1111-1111-1111-111111111111'};self.identity='sender@example.test';self.auth_calls=0
 def auth(self,env):self.auth_calls+=1;return {'email':self.identity,'sheets':self.api,'drive':self.api}
 def call(self,payload):return support.process_request(payload,self.env,self.auth)
 def create(self,confirmed=True):return self.call({'action':'create','confirmed':confirmed,'title':'Dedicated scheduler','namespace':self.env['CLOUD_SCHEDULER_NAMESPACE']})
 def test_no_creation_without_explicit_confirmation(self):
  self.assertFalse(self.create(False)['ok']);self.assertEqual(self.auth_calls,0);self.assertEqual(self.api.creates,0)
 def test_wrong_authenticated_account_never_creates(self):
  self.identity='other@example.test';self.assertFalse(self.create()['ok']);self.assertEqual(self.api.creates,0)
 def test_private_sheet_created_with_only_expected_tabs_and_metadata(self):
  r=self.create();self.assertTrue(r['created']);self.assertTrue(r['setupComplete']);self.assertEqual([x['properties']['title'] for x in self.api.created_body['sheets']],['Requests','Jobs','Events','Settings']);self.assertFalse(r['sent'])
 def test_failed_initialisation_keeps_created_file_id(self):
  self.api.updated_result=RuntimeError('private provider detail');r=self.create();self.assertFalse(r['ok']);self.assertTrue(r['created']);self.assertEqual(r['spreadsheetId'],'private-sheet-fixture');self.assertNotIn('private provider detail',json.dumps(r))
 def test_missing_creation_receipt_is_uncertain(self):
  self.api.create_result={};r=self.create();self.assertTrue(r['unknown']);self.assertTrue(r['operationAttempted'])
 def test_read_only_inspection_does_not_create_anything(self):
  r=self.call({'action':'inspect'});self.assertTrue(r['ok']);self.assertEqual(self.api.creates,0);self.assertEqual(self.api.updates,0)
 def test_wrong_sheet_identity_is_refused(self):
  self.api.owner='other@example.test';self.assertFalse(self.call({'action':'inspect'})['ok']);self.assertEqual(self.api.creates,0)

 def test_public_or_shared_file_is_not_claimed_ready(self):
  self.api.extra_permissions=[{'type':'anyone','role':'reader'}];r=self.create();self.assertFalse(r['ok']);self.assertTrue(r['created']);self.assertEqual(self.api.updates,0)
 def test_inspection_refuses_a_file_shared_to_another_person(self):
  self.api.extra_permissions=[{'type':'user','role':'writer','emailAddress':'other@example.test'}];r=self.call({'action':'inspect'});self.assertFalse(r['ok']);self.assertEqual(self.api.updates,0)

class CallbackSecurityTests(unittest.TestCase):
 def exercise(self,query):
  import http.server,threading,urllib.request,urllib.error
  box={};server=http.server.HTTPServer(('127.0.0.1',0),setup.make_handler('expected-state',box));thread=threading.Thread(target=server.handle_request,daemon=True);thread.start()
  try:
   opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
   try:
    with opener.open('http://127.0.0.1:'+str(server.server_port)+'/?'+query,timeout=5) as response:status=response.status;body=response.read().decode()
   except urllib.error.HTTPError as error:status=error.code;body=error.read().decode()
  finally:thread.join(timeout=5);server.server_close()
  return status,body,box
 def test_bad_state_is_rejected_without_accepting_auth_code(self):
  status,body,box=self.exercise('state=wrong&code=private-code');self.assertEqual(status,400);self.assertEqual(box,{});self.assertNotIn('private-code',body)
 def test_duplicate_state_values_are_rejected(self):
  status,body,box=self.exercise('state=expected-state&state=other&code=private-code');self.assertEqual(status,400);self.assertEqual(box,{})
 def test_correct_state_accepts_code_but_never_echoes_it(self):
  status,body,box=self.exercise('state=expected-state&code=private-code');self.assertEqual(status,200);self.assertEqual(box['code'],'private-code');self.assertNotIn('private-code',body)
 def test_google_decline_is_not_a_successful_authorisation(self):
  status,body,box=self.exercise('state=expected-state&error=access_denied');self.assertEqual(status,200);self.assertIn('error',box);self.assertNotIn('code',box)

if __name__=='__main__':unittest.main()
