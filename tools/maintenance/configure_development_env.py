"""Configure development's explicit integration opt-in without changing production or Slice 1 source."""
import argparse,importlib.util,json,os,re,shutil,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone
sys.dont_write_bytecode=True
MAIL=['ENABLE_GMAIL','ENABLE_GMAIL_SENDING','ENABLE_GMAIL_DRAFT_CREATION','ENABLE_GMAIL_MAILBOX_CHECK','ENABLE_GMAIL_SIGNATURE']
FLAGS=MAIL+['ENABLE_PERPLEXITY_RESEARCH','ENABLE_COVER_LETTER_REFINEMENT']
OAUTH=['GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_REFRESH_TOKEN']
MODES={'drafts':{'ENABLE_GMAIL':'false','ENABLE_GMAIL_SENDING':'false','ENABLE_GMAIL_DRAFT_CREATION':'true','ENABLE_GMAIL_MAILBOX_CHECK':'true'},'send':{'ENABLE_GMAIL':'true','ENABLE_GMAIL_SENDING':'true','ENABLE_GMAIL_DRAFT_CREATION':'true','ENABLE_GMAIL_MAILBOX_CHECK':'true'},'stored':{}}
def require(ok,message):
 if not ok:raise RuntimeError(message)
def patch(raw,values):
 text=raw.decode('utf-8-sig');eol='\r\n' if '\r\n' in text else '\n';text=text.replace('\r\n','\n')
 for key,value in values.items():
  pattern=r'(?m)^[ \t]*(?:export[ \t]+)?'+re.escape(key)+r'[ \t]*=[^\n]*$';matches=list(re.finditer(pattern,text))
  require(len(matches)<=1,'Duplicate configuration setting requires review: '+key)
  if matches:
   old=matches[0].group().split('=',1)[1].strip()
   require(not old.startswith(('"',"'")) or old.count(old[0])>=2,'Multiline feature flag refused: '+key)
   text=re.sub(pattern,lambda _:key+'='+value,text,count=1)
  else:text=text.rstrip('\n')+'\n'+key+'='+value+'\n'
 return (b'\xef\xbb\xbf' if raw.startswith(b'\xef\xbb\xbf') else b'')+text.replace('\n',eol).encode()
def python_with_gmail(root,configured,base_env):
 candidates=[configured,str(root/('.venv/Scripts/python.exe' if os.name=='nt' else '.venv/bin/python')),sys.executable]
 seen=set()
 for value in candidates:
  if not value:continue
  p=Path(value);candidate=str(p.resolve()) if p.is_file() else shutil.which(value)
  if not candidate or candidate in seen:continue
  seen.add(candidate)
  try:
   r=subprocess.run([candidate,'-c','import ssl; import googleapiclient.discovery; import google.oauth2.credentials; import cryptography'],cwd=root,env=base_env,capture_output=True,timeout=15)
   if r.returncode==0:return candidate
  except (OSError,subprocess.TimeoutExpired):pass
 return None

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--apply',action='store_true');p.add_argument('--start',action='store_true');a=p.parse_args();root=a.root.resolve();config=root/'.env'
 require((root/'package.json').is_file() and not (root/'release.json').exists(),'Run from the development project root, not production.')
 require(config.is_file() and not config.is_symlink(),'Development .env is missing or is a symlink.')
 spec=importlib.util.spec_from_file_location('development_env_support',root/'tools/deploy/local_delivery.py');d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d);d.ROOT=root
 require(not d.busy(3000),'Stop development on port 3000 before configuring. Production may stay running.')
 node=d.node();base=d.base_env();base['NODE_OPTIONS']='';raw=config.read_bytes();text=raw.decode('utf-8-sig');keys=re.findall(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=',text,re.M)
 def read_values(path):
  js='console.log(JSON.stringify(Object.fromEntries('+json.dumps(list(dict.fromkeys(keys+['NMP_ENV','NMP_ALLOW_DEVELOPMENT_INTEGRATIONS',*FLAGS,'PYTHON'])))+'.map(k=>[k,process.env[k]||""]))))'
  r=subprocess.run([node,'--env-file='+str(path),'-e',js],cwd=root,env=base,capture_output=True,text=True,encoding='utf-8')
  require(r.returncode==0,'Configuration parse failed; raw output withheld to protect credentials.')
  return json.loads(r.stdout)
 def effective(path):
  js='const {deploymentRuntime}=await import('+json.dumps((root/'src/config/deployment-runtime.js').as_uri())+'); const env={...process.env};deploymentRuntime({env,projectRoot:'+json.dumps(str(root))+'});console.log(JSON.stringify({flags:Object.fromEntries('+json.dumps(FLAGS)+'.map(k=>[k,env[k]||"false"])),oauthPresent:'+json.dumps(OAUTH)+'.every(k=>Boolean(String(env[k]||"").trim()))}));'
  r=subprocess.run([node,'--env-file='+str(path),'--input-type=module','-e',js],cwd=root,env=base,capture_output=True,text=True,encoding='utf-8')
  require(r.returncode==0,'Runtime policy probe failed; output withheld.');return json.loads(r.stdout)
 values=read_values(config);report=effective(config)
 print('Development file: '+str(config));print('Stored .env flags (credential values are never displayed):')
 for k in FLAGS:print('  '+k+'='+(values.get(k) or '(unset)'))
 print('OAuth values present in .env: '+str(all(values.get(k,'').strip() for k in OAUTH)))
 print('OAuth values available after current policy: '+str(report['oauthPresent']))
 print('The integration opt-in does not enable features by itself; each explicit flag still controls its feature.')
 print('\nChoose development behaviour:\n  K = honour all currently stored feature flags\n  D = mailbox checking + Gmail drafts only; sending OFF\n  S = mailbox checking + drafts + explicit-confirmation sending\n  C = cancel\nPerplexity and signature settings will not be changed.')
 if not a.apply:print('READ-ONLY CHECK COMPLETE. Use --apply to choose and save development settings.');return
 choice=input('Choose K, D, S or C: ').strip().upper()
 if choice=='C':print('Cancelled. No changes.');return
 require(choice in ['K','D','S'],'Invalid choice. No changes.')
 mode={'K':'stored','D':'drafts','S':'send'}[choice]
 updates={'NMP_ENV':'development','NMP_ALLOW_DEVELOPMENT_INTEGRATIONS':'true',**MODES[mode]}
 resulting={**values,**updates}
 mail_active=any(resulting.get(k,'').strip().lower() in ['true','1','yes'] for k in MAIL)
 if mail_active:
  missing=[k for k in [*OAUTH,'GMAIL_FROM_ADDRESS','CV_FOLDER'] if not resulting.get(k,'').strip()]
  require(not missing,'Required stored settings missing: '+', '.join(missing)+'. No configuration changed. Do not share secrets in chat.')
  py=python_with_gmail(root,values.get('PYTHON',''),base)
  require(py,'No development Python with Gmail libraries was found. No configuration changed; dependency setup is a separate step. Production Python was not reused.')
  require('"' not in py and '\n' not in py and '\r' not in py,'Unexpected Python path quoting. No changes.')
  updates['PYTHON']='"'+py+'"'
  resulting['PYTHON']=py
 sending=all(resulting.get(k,'').strip().lower() in ['true','1','yes'] for k in ['ENABLE_GMAIL','ENABLE_GMAIL_SENDING'])
 print('\nWill save development opt-in=true and the following effective feature choices:')
 for k in FLAGS:print('  '+k+'='+(resulting.get(k) or 'false'))
 if updates.get('PYTHON'):print('  PYTHON=<validated local interpreter; path not displayed>')
 if sending:require(input('This enables REAL sending controls in DEVELOPMENT. Type ENABLE SENDING: ').strip()=='ENABLE SENDING','Sending enablement cancelled. No changes.')
 require(input('Type APPLY to save development configuration only: ').strip()=='APPLY','Cancelled. No changes.')
 updated=patch(raw,updates)
 require(config.read_bytes()==raw,'Development .env changed concurrently. No writes.')
 backup=root/'var/maintenance/development-env-backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');require(backup.resolve().is_relative_to(root),'Unsafe backup directory.');backup.mkdir(parents=True,exist_ok=False);b=backup/'development.env.before';b.write_bytes(raw);os.chmod(b,0o600)
 config.write_bytes(updated)
 try:
  after=read_values(config);state=effective(config)
  for key,value in values.items():
   if key not in updates:require(after.get(key,'')==value,'Unrelated configuration value changed; restoring backup.')
  require(after.get('NMP_ALLOW_DEVELOPMENT_INTEGRATIONS')=='true','Development opt-in did not load.')
  for key in FLAGS:
   expected=resulting.get(key,'').strip().lower() or 'false';actual=state['flags'][key].strip().lower()
   require(actual==expected,'Runtime still overrides '+key+'. Configuration will be restored.')
  require(not mail_active or state['oauthPresent'],'Runtime still clears configured OAuth values.')
 except BaseException:
  if config.read_bytes()==updated:config.write_bytes(raw)
  raise
 print('DEVELOPMENT CONFIGURATION VERIFIED. Existing credentials and Perplexity settings preserved.')
 print('Production, application source, databases and Slice 1 package were not changed. No API request, draft or email was made.')
 print('Private backup (contains secrets; do not upload): '+str(b))
 if not mail_active:print('Gmail is explicitly OFF in the file. Missing OAuth values after policy are expected while all Gmail flags are off.')
 print('GMAIL_CREDENTIALS_PATH and GOOGLE_APPLICATION_CREDENTIALS are not required for this refresh-token setup.')
 shadows=[k for k in ['NMP_ENV','NMP_ALLOW_DEVELOPMENT_INTEGRATIONS',*FLAGS,*OAUTH,'PERPLEXITY_API_KEY','PYTHON'] if k in os.environ and os.environ[k]!=after.get(k,'')]
 if shadows:print('Parent-shell overrides detected for names only: '+', '.join(shadows)+'. --start below uses the validated clean environment.')
 if a.start:
  print('Starting development from the validated .env. Ctrl+C stops it.',flush=True)
  child=subprocess.Popen([node,'--env-file='+str(config),'src/interfaces/http/run-local-server.js'],cwd=root,env=base)
  try:code=child.wait()
  except KeyboardInterrupt:
   try:child.wait(timeout=15)
   except subprocess.TimeoutExpired:print('Server still stopping; inspect its process. No forced kill performed.');raise
   return
  require(code==0,'Development server exited with an error; inspect its output.')
 else:print('Restart development with start-local-server.bat. If shell overrides were reported, use this utility with --apply --start to launch in the validated environment.')
if __name__=='__main__':
 if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(errors='replace')
 try:main()
 except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)
