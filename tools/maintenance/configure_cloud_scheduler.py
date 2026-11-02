"""Explicit one-time scheduler authorisation/setup. Existing Gmail credentials and flags remain untouched."""
import argparse,base64,hashlib,hmac,http.server,importlib.util,json,os,re,secrets,shutil,subprocess,sys,tempfile,time,urllib.parse,urllib.request,webbrowser
from pathlib import Path
from datetime import datetime,timezone
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
SCOPES=('https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/userinfo.email')
AUTH_URL='https://accounts.google.com/o/oauth2/v2/auth'
TOKEN_URL='https://oauth2.googleapis.com/token'
USERINFO_URL='https://www.googleapis.com/oauth2/v2/userinfo'
EDITABLE={'CLOUD_SCHEDULER_OAUTH_CLIENT_ID','CLOUD_SCHEDULER_OAUTH_CLIENT_SECRET','CLOUD_SCHEDULER_OAUTH_REFRESH_TOKEN','CLOUD_SCHEDULER_SPREADSHEET_ID','CLOUD_SCHEDULER_NAMESPACE','CLOUD_SCHEDULER_PAIRING_KEY'}
KEEP=set('PATH PATHEXT SYSTEMROOT SYSTEMDRIVE WINDIR COMSPEC TEMP TMP USERPROFILE HOME APPDATA LOCALAPPDATA PROGRAMFILES PROGRAMFILES(X86) PROCESSOR_ARCHITECTURE SSL_CERT_FILE SSL_CERT_DIR REQUESTS_CA_BUNDLE NODE_EXTRA_CA_CERTS HTTP_PROXY HTTPS_PROXY NO_PROXY'.split())

def require(ok,message):
 if not ok:raise RuntimeError(message)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def clean_env():return {k:v for k,v in os.environ.items() if k.upper() in KEEP}
def load_config(file):
 node=shutil.which('node');require(bool(node),'Existing Node runtime required to parse configuration.')
 code="import {readFileSync} from 'node:fs';import {parseEnv} from 'node:util';process.stdout.write(JSON.stringify(parseEnv(readFileSync(process.argv[1],'utf8').replace(/^\\uFEFF/,''))));"
 result=subprocess.run([node,'--input-type=module','-e',code,str(file)],env=clean_env(),capture_output=True,text=True,encoding='utf-8',timeout=15)
 require(result.returncode==0,'Configuration could not be parsed. Its contents were not logged.')
 value=json.loads(result.stdout);require(isinstance(value,dict),'Invalid configuration.');return value

def load_desktop_client(file,existing):
 value=json.loads(file.read_text(encoding='utf-8-sig'));client=value.get('installed')
 require(isinstance(client,dict),'Use downloaded Desktop-app OAuth credentials from a dedicated scheduler project, not a Web-client file.')
 require(isinstance(client.get('client_id'),str) and client['client_id'].endswith('.apps.googleusercontent.com') and len(client['client_id'])<512,'Invalid Desktop client ID.')
 require(client['client_id']!=existing.get('GMAIL_OAUTH_CLIENT_ID'),'Do not reuse the production Gmail OAuth client.')
 require(isinstance(client.get('project_id'),str) and re.fullmatch(r'[A-Za-z0-9._-]{1,120}',client['project_id']),'Client project identity missing.')
 require(client.get('auth_uri',AUTH_URL) in {AUTH_URL,'https://accounts.google.com/o/oauth2/auth'} and client.get('token_uri',TOKEN_URL) in {TOKEN_URL,'https://accounts.google.com/o/oauth2/token'},'Only Google OAuth endpoints are supported.')
 require(isinstance(client.get('client_secret',''),str) and not re.search(r'[\x00-\x1f\x7f]',client.get('client_secret','')),'Invalid local client configuration.')
 return client

def pkce():
 verifier=secrets.token_urlsafe(48);challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode('ascii')).digest()).decode('ascii').rstrip('=')
 return verifier,challenge

def authorization_url(client,account,redirect,state,challenge):
 return AUTH_URL+'?'+urllib.parse.urlencode({'client_id':client['client_id'],'redirect_uri':redirect,'response_type':'code','scope':' '.join(SCOPES),'state':state,'code_challenge':challenge,'code_challenge_method':'S256','access_type':'offline','prompt':'consent','login_hint':account})

def make_handler(expected_state,box):
 class Callback(http.server.BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def do_GET(self):
   parsed=urllib.parse.urlsplit(self.path);query=urllib.parse.parse_qs(parsed.query)
   state=query.get('state',[''])[0]
   if parsed.path!='/' or len(query.get('state',[]))!=1 or not isinstance(state,str) or not hmac.compare_digest(state,expected_state):
    self.send_response(400);self.end_headers();self.wfile.write(b'Invalid authorisation response. Return to the setup tool.');return
   if 'error' in query:box['error']='Google authorisation was declined or blocked.'
   elif len(query.get('code',[]))==1 and query['code'][0]:box['code']=query['code'][0]
   else:box['error']='Google returned no valid authorisation code.'
   self.send_response(200);self.send_header('Content-Type','text/plain; charset=utf-8');self.end_headers();self.wfile.write(b'Authorisation response received. Close this tab and return to the setup tool. No email was sent.')
 return Callback

def google_json(url,body=None,access_token=None):
 data=urllib.parse.urlencode(body).encode('ascii') if body is not None else None
 headers={'Accept':'application/json'}
 if data is not None:headers['Content-Type']='application/x-www-form-urlencoded'
 if access_token:headers['Authorization']='Bearer '+access_token
 try:
  with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=headers),timeout=30) as response:
   raw=response.read(1024*1024+1);require(len(raw)<=1024*1024,'Google response exceeded limit.');return json.loads(raw.decode('utf-8'))
 except Exception:raise RuntimeError('Google authorisation/identity request failed. No token or provider response was logged.') from None

def validate_tokens(tokens,expected,identity):
 granted=set(str(tokens.get('scope','')).split())
 if 'email' in granted:granted.add('https://www.googleapis.com/auth/userinfo.email')
 require(set(SCOPES)<=granted,'Not all scheduler scopes were granted. Scheduler remains disabled.')
 require(isinstance(tokens.get('refresh_token'),str) and tokens['refresh_token'],'No scheduler refresh token returned. Existing credentials remain unchanged.')
 require(identity.get('verified_email') is True and str(identity.get('email','')).lower()==expected.lower(),'Authorised Google account differs from the configured sender. Nothing saved.')
 return tokens['refresh_token']

def authorise(client,account):
 verifier,challenge=pkce();state=secrets.token_urlsafe(32);box={}
 with http.server.HTTPServer(('127.0.0.1',0),make_handler(state,box)) as server:
  server.timeout=1;redirect='http://127.0.0.1:'+str(server.server_port)+'/'
  url=authorization_url(client,account,redirect,state,challenge)
  require(webbrowser.open(url,new=1),'Could not open the system browser. No credentials saved.')
  deadline=time.monotonic()+300
  while not box and time.monotonic()<deadline:server.handle_request()
 require(bool(box),'Authorisation timed out. Existing configuration retained.')
 require(not box.get('error'),box.get('error','Authorisation failed.'))
 body={'grant_type':'authorization_code','code':box['code'],'code_verifier':verifier,'client_id':client['client_id'],'redirect_uri':redirect}
 if client.get('client_secret'):body['client_secret']=client['client_secret']
 tokens=google_json(TOKEN_URL,body=body);require(isinstance(tokens.get('access_token'),str) and tokens['access_token'],'Google returned no access token.')
 identity=google_json(USERINFO_URL,access_token=tokens['access_token'])
 return validate_tokens(tokens,account,identity)

def update_config(file,updates,expected_raw,backup_root):
 require(set(updates)<=EDITABLE,'Only scheduler-specific configuration keys may be written.')
 require(file.read_bytes()==expected_raw,'Configuration changed during setup. Nothing overwritten.')
 text=expected_raw.decode('utf-8-sig').replace('\r\n','\n');lines=text.splitlines();positions={}
 for i,line in enumerate(lines):
  m=re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=',line)
  if m and m[1] in updates:
   require(m[1] not in positions,'Duplicate scheduler key. Resolve duplicates locally before setup.');positions[m[1]]=i
 for key,value in updates.items():
  require(isinstance(value,str) and len(value)<=4096 and not re.search(r'[\r\n\x00]',value) and "'" not in value,'Scheduler value requires safe manual quoting.')
  line=key+"='"+value+"'"
  if key in positions:lines[positions[key]]=line
  else:lines.append(line)
 raw=('\n'.join(lines)+'\n').encode('utf-8')
 if b'\r\n' in expected_raw:raw=raw.replace(b'\n',b'\r\n')
 if expected_raw.startswith(b'\xef\xbb\xbf'):raw=b'\xef\xbb\xbf'+raw
 backup_root.mkdir(parents=True,exist_ok=False)
 fd=os.open(backup_root/'config.before',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as out:out.write(expected_raw)
 fd,name=tempfile.mkstemp(prefix='.scheduler-config-',suffix='.tmp',dir=file.parent)
 try:
  with os.fdopen(fd,'wb') as out:out.write(raw);out.flush();os.fsync(out.fileno())
  require(file.read_bytes()==expected_raw,'Configuration changed concurrently. Replacement refused.')
  os.replace(name,file)
 finally:
  if os.path.exists(name):os.unlink(name)
 return raw

def sheet_worker():
 file=ROOT/'tools/maintenance/scheduler_setup_support.py';spec=importlib.util.spec_from_file_location('private_sheet_setup_worker',file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def stamp():return datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
def confirm(text,word):
 require(input(text+'\nType '+word+' to continue: ').strip()==word,'Cancelled. No requested change performed.')

def pending_creations(config_file):
 folder=ROOT/'var/maintenance/scheduler-setup/operations'
 results=[]
 if folder.is_dir():
  for p in folder.glob('*.json'):
   try:
    value=json.loads(p.read_text(encoding='utf-8'))
    if value.get('configTarget')==str(config_file) and value.get('status')!='CONFIGURED':results.append((p,value))
   except Exception:raise RuntimeError('An earlier setup receipt could not be read. Inspect it; no new Sheet created.')
 return results

def save_operation(path,value):
 raw=(json.dumps(value,indent=2)+'\n').encode('utf-8')
 fd,name=tempfile.mkstemp(prefix='.operation-',dir=path.parent)
 try:
  with os.fdopen(fd,'wb') as out:out.write(raw);out.flush();os.fsync(out.fileno())
  os.replace(name,path)
 finally:
  if os.path.exists(name):os.unlink(name)

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',type=Path,default=ROOT/'.env');parser.add_argument('--client-file',type=Path);parser.add_argument('--production-config',action='store_true');parser.add_argument('action',choices=['authorise','create-sheet','inspect','worker-setup-file']);args=parser.parse_args()
 require((ROOT/'package.json').is_file() and not (ROOT/'release.json').exists(),'Run the setup tool from development, not a production release.')
 file=args.config;require(file.is_file() and not file.is_symlink(),'Select an existing, non-linked configuration file.');file=file.resolve()
 if file!=ROOT/'.env':
  require(args.production_config and file.name=='production.env' and (file.parents[2]/'start-production.bat').is_file(),'Non-development configuration requires explicit --production-config and an existing production installation.')
 raw=file.read_bytes();env=load_config(file);account=str(env.get('GMAIL_FROM_ADDRESS','')).strip().lower()
 require(re.fullmatch(r'[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+',account),'Configure the intended sender locally before scheduler setup.')
 backups=ROOT/'var/maintenance/scheduler-setup'/stamp()
 if args.action=='authorise':
  require(args.client_file and args.client_file.is_file(),'Provide the locally downloaded Desktop-client JSON using --client-file. Do not upload it.')
  require(not args.client_file.resolve().is_relative_to(ROOT),'Keep the downloaded OAuth client JSON outside the repository. Nothing read or saved.')
  client=load_desktop_client(args.client_file,env)
  require(not env.get('CLOUD_SCHEDULER_OAUTH_CLIENT_ID') or env['CLOUD_SCHEDULER_OAUTH_CLIENT_ID']==client['client_id'],'A different scheduler client is already configured. Reauthorise the same client or review migration; do not rotate blindly.')
  confirm('This must be a dedicated scheduler OAuth project, separate from production Gmail.\nScheduler project: '+client['project_id']+'\nAccount: '+account+'\nConfiguration target: '+str(file)+'\nRequested access: per-file Drive access and account email. Existing Gmail keys/flags will not be replaced. Confirm the project separation in Google Console first.','AUTHORISE')
  token=authorise(client,account)
  values={'CLOUD_SCHEDULER_OAUTH_CLIENT_ID':client['client_id'],'CLOUD_SCHEDULER_OAUTH_CLIENT_SECRET':client.get('client_secret',''),'CLOUD_SCHEDULER_OAUTH_REFRESH_TOKEN':token}
  update_config(file,values,raw,backups);print('Scheduler credentials saved locally. Existing Gmail credentials and integration flags retained. No Sheet created and no mail scheduled.');return
 worker=sheet_worker()
 if args.action=='inspect':
  result=worker.process_request({'action':'inspect'},env=env);require(result.get('ok') is True,'Scheduler account/file inspection failed. No setup changes made.');print(json.dumps({'configured':True,'account':result['account'],'namespace':result['namespace'],'spreadsheetId':result['spreadsheetId'],'localEnableFlag':str(env.get('ENABLE_CLOUD_SCHEDULING','')).lower()=='true'},indent=2));return
 if args.action=='create-sheet':
  require(not env.get('CLOUD_SCHEDULER_SPREADSHEET_ID'),'A scheduler file is already configured. Inspect/reconcile it; do not create another blindly.')
  earlier=pending_creations(file);require(not earlier,'An earlier Sheet creation/setup is unconfirmed. Inspect the saved operation receipt; do not create another.')
  require(not env.get('CLOUD_SCHEDULER_PAIRING_KEY') or re.fullmatch(r'[a-f0-9]{64}',env['CLOUD_SCHEDULER_PAIRING_KEY']),'Existing pairing-key configuration is invalid. No Sheet created.')
  try:auth=worker.google_services(env)
  except Exception:raise RuntimeError('Scheduler authentication or Google API startup failed. Check the dedicated client, scopes and enabled APIs. Provider details were not logged.') from None
  require(auth['email']==account,'Authorised scheduler account mismatch. No Sheet created.')
  title='NewModularProduct - Scheduled Mail';namespace=secrets.token_hex(16);namespace=namespace[:8]+'-'+namespace[8:12]+'-'+namespace[12:16]+'-'+namespace[16:20]+'-'+namespace[20:]
  confirm('Create one private scheduler Sheet?\nAccount: '+account+'\nTitle: '+title+'\nNamespace: '+namespace+'\nConfiguration target: '+str(file)+'\nNo sharing permission, application mail or CV upload will be created.','CREATE')
  operations=ROOT/'var/maintenance/scheduler-setup/operations';operations.mkdir(parents=True,exist_ok=True)
  receipt=operations/(stamp()+'.json');operation={'configTarget':str(file),'account':account,'title':title,'namespace':namespace,'status':'PENDING','createdAt':datetime.now(timezone.utc).isoformat()};save_operation(receipt,operation)
  result=worker.process_request({'action':'create','confirmed':True,'title':title,'namespace':namespace},env=env,service_factory=lambda unused:auth)
  operation.update(status='CREATED_UNCONFIGURED' if result.get('ok') else 'UNKNOWN',spreadsheetId=result.get('spreadsheetId'));save_operation(receipt,operation)
  print('Creation/setup receipt: '+str(receipt))
  if not result.get('ok'):
   if result.get('spreadsheetId'):print('Unconfirmed setup, retain the returned Sheet ID locally: '+result['spreadsheetId'])
   print('Safe error category: '+str(result.get('errorCategory','unknown'))+'; HTTP status: '+str(result.get('httpStatus','unknown')))
   raise RuntimeError('Sheet setup not confirmed. Do not repeat creation blindly. Existing local configuration retained.')
  values={'CLOUD_SCHEDULER_SPREADSHEET_ID':result['spreadsheetId'],'CLOUD_SCHEDULER_NAMESPACE':namespace,'CLOUD_SCHEDULER_PAIRING_KEY':env.get('CLOUD_SCHEDULER_PAIRING_KEY') or secrets.token_hex(32)}
  update_config(file,values,raw,backups);operation['status']='CONFIGURED';save_operation(receipt,operation);print('Private scheduler Sheet configured. This setup installed no sending worker and did not change any enable flag.');print('Sheet ID: '+result['spreadsheetId']);return
 require(args.action=='worker-setup-file','Unsupported action.')
 for key in ('CLOUD_SCHEDULER_SPREADSHEET_ID','CLOUD_SCHEDULER_NAMESPACE','CLOUD_SCHEDULER_PAIRING_KEY'):require(bool(env.get(key)),'Complete private Sheet setup first.')
 confirm('Write a PRIVATE local setup file containing the dedicated pairing key? It is for copying into this scheduler project only. Never upload it or paste it into chat.','WRITE')
 backups.mkdir(parents=True,exist_ok=False);target=backups/'worker-setup.private.txt'
 content='PRIVATE - NEVER UPLOAD\nSCHEDULER_SHEET_ID='+env['CLOUD_SCHEDULER_SPREADSHEET_ID']+'\nPAIRING_KEY='+env['CLOUD_SCHEDULER_PAIRING_KEY']+'\nENABLE_SCHEDULED_SENDING=false\n\nRetain this file for the final scheduler-worker installation. This setup bundle installs no clock or sending worker. Review separate Gmail-draft authorisation when the final bundle is supplied.\n'
 fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w',encoding='utf-8') as out:out.write(content)
 print('Private worker setup file created locally. Do not upload this file. Location: '+str(target))

if __name__=='__main__':
 try:main()
 except KeyboardInterrupt:print('Setup cancelled. Inspect local configuration if Google consent already completed.',file=sys.stderr);sys.exit(1)
 except RuntimeError as error:print('ERROR: '+str(error),file=sys.stderr);sys.exit(1)
 except Exception:print('ERROR: Setup failed. Inspect the local configuration and any operation receipt. No provider response or credential was logged.',file=sys.stderr);sys.exit(1)
