"""Local release delivery. Only the checkpoint command stages/commits; nothing pushes or sends mail."""
import argparse,contextlib,hashlib,importlib.metadata,io,json,os,re,shutil,signal,socket,sqlite3,subprocess,sys,tarfile,tempfile,time,uuid,venv
from pathlib import Path,PurePosixPath
from datetime import datetime,timezone
ROOT=Path(os.getenv('NMP_SOURCE_ROOT') or Path(__file__).resolve().parents[2]).resolve()
FLAGS=['ENABLE_GMAIL','ENABLE_GMAIL_SENDING','ENABLE_GMAIL_DRAFT_CREATION','ENABLE_GMAIL_MAILBOX_CHECK','ENABLE_GMAIL_SIGNATURE','ENABLE_PERPLEXITY_RESEARCH','ENABLE_COVER_LETTER_REFINEMENT']
STORES=['outreach.db','application-reviews-v1.db','job-imports-v1.db','imported-recruiter-contacts.json']
def fail(s):raise RuntimeError(s)
def stamp():return datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
def sha(b):return hashlib.sha256(b).hexdigest()
def hashed(p):return sha(p.read_bytes())
def read(p,default=None):return json.loads(p.read_text(encoding='utf-8-sig')) if p.is_file() else default
def atomic(p,value):
 p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_name(p.name+'.'+uuid.uuid4().hex+'.tmp');tmp.write_text(json.dumps(value,indent=2),encoding='utf-8');os.replace(tmp,p)
def run(args,cwd=None,env=None,log=None):
 if log:print('[verify] '+' '.join(str(x) for x in args[:3]),flush=True)
 r=subprocess.run([str(x) for x in args],cwd=cwd or ROOT,env=env,capture_output=True)
 if log:
  with log.open('ab') as f:f.write(('COMMAND: '+' '.join(map(str,args))+'\n').encode()+r.stdout+r.stderr+b'\n')
 if r.returncode:fail('Command failed. '+('See '+str(log) if log else r.stderr.decode('utf-8','replace')[-1200:]))
 return r.stdout.decode('utf-8','replace').strip()
def git(*args):return run(['git',*args],env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'})
def staged_source_bytes(name):
 r=subprocess.run(['git','show',':'+name],cwd=ROOT,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'},capture_output=True)
 if r.returncode:fail('Cannot read staged source: '+name)
 return r.stdout

def source_bytes_for_comparison(raw):
 # Git text attributes may change CRLF to LF; preserve every other byte.
 return raw.replace(b'\r\n',b'\n')

def staged_source_matches(name):
 return source_bytes_for_comparison(staged_source_bytes(name))==source_bytes_for_comparison((ROOT/name).read_bytes())

def split(s):return [x for x in s.split('\0') if x]
def base_env():
    keep = {'PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC',
            'TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA',
            'PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432',
            'COMMONPROGRAMFILES','COMMONPROGRAMFILES(X86)','COMMONPROGRAMW6432',
            'USERNAME','USERDOMAIN','OS','PROCESSOR_ARCHITECTURE','PROCESSOR_IDENTIFIER',
            'NUMBER_OF_PROCESSORS','HTTP_PROXY','HTTPS_PROXY','NO_PROXY',
            'SSL_CERT_FILE','SSL_CERT_DIR','REQUESTS_CA_BUNDLE','NODE_EXTRA_CA_CERTS',
            'PIP_CERT','NPM_CONFIG_CAFILE','PLAYWRIGHT_BROWSERS_PATH'}
    return {key:value for key,value in os.environ.items() if key.upper() in keep}
def node():
 p=shutil.which('node')
 if not p:fail('Node required.')
 v=run([p,'-p',"process.version+' '+Boolean(require('node:sqlite').DatabaseSync)"])
 if int(v.split('.')[0][1:])<24 or not v.endswith('true'):fail('Node 24+ with SQLite support is required.')
 return str(Path(p).resolve())
def npm_cli(n):
 p=shutil.which('npm.cmd') or shutil.which('npm');choices=[Path(n).parent/'node_modules/npm/bin/npm-cli.js']
 if p:choices.extend([Path(p).parent/'node_modules/npm/bin/npm-cli.js',Path(p).resolve()])
 for f in choices:
  if f.is_file() and f.suffix=='.js':return f
 fail('Cannot find npm-cli.js for the installed Node/npm.')
def safe_source(name):
 p=PurePosixPath(name);parts=p.parts;low=name.lower()
 if 'scenario-source-text' in [x.lower() for x in parts]:return False
 if re.search(r'(^|/)[^/]*-source-[0-9]{8}t[0-9]{6}z\.json$',low):return False
 if p.is_absolute() or '..' in parts or '\\' in name:return False
 if any(x.lower() in ['node_modules','__pycache__','.git','output','data','var','.venv','backups','test-results','playwright-report','blob-report'] for x in parts):return False
 if any(x in low for x in ['.before-','.bak','.backup','-source.json','local-production-audit-','payload.json','recipient-package-before-']):return False
 if p.name.startswith('.env') or p.suffix.lower() in ['.db','.sqlite','.sqlite3','.pdf','.docx','.pyc','.zip','.pem','.key','.pfx']:return False
 if name=='config/cv-library.json':return True
 if name in ['package.json','package-lock.json','.gitignore','.gitattributes','playwright.config.js','playwright.contacts.config.js','start-local-server.bat']:return True
 if parts and parts[0]=='apps-script':return p.suffix.lower() in ['.gs','.js','.mjs','.md','.html'] or p.name in ['appsscript.json','appsscript.scheduler.json']
 if len(parts)==1:return p.suffix=='.md'
 if parts[0]=='python-worker':return p.suffix.lower()=='.py'
 if parts[0] in ['src','tests','templates','examples','docs','tampermonkey','scripts']:return p.suffix.lower() in ['.js','.mjs','.cjs','.py','.css','.html','.json','.md','.toml','.txt','.yml','.yaml']
 if len(parts)>2 and parts[:2] in [('tools','deploy'),('tools','maintenance')]:return p.suffix.lower() in ['.py','.ps1','.bat','.cmd','.mjs','.js','.md','.txt','.json'] and (parts[1]=='deploy' or p.suffix.lower()!='.json')
 return len(parts)==2 and parts[0]=='tools' and p.suffix=='.py'
def scan(name,b):
 patterns=[rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',rb'AIza[0-9A-Za-z_-]{30,}',rb'ya29\.[0-9A-Za-z_-]{30,}',rb'1//[0-9A-Za-z_-]{30,}',rb'(?:ghp_|github_pat_)[0-9A-Za-z_]{30,}',rb'sk-[0-9A-Za-z_-]{32,}']
 if any(re.search(p,b) for p in patterns):fail('Possible secret in '+name+'. Review locally; contents not logged.')
def source_files():return sorted(set(n for n in split(git('ls-files','--cached','--others','--exclude-standard','-z')) if safe_source(n) and (ROOT/n).is_file() and not (ROOT/n).is_symlink()))
def fingerprints():return {n:hashed(ROOT/n) for n in source_files()}
def write_env(p,values):
 lines=[]
 for k,v in sorted(values.items()):
  if not re.fullmatch('[A-Za-z_][A-Za-z0-9_]*',k):fail('Invalid environment key.')
  v=str(v);q="'" if "'" not in v else '"'
  if '\r' in v or '\n' in v or q in v:fail('Environment value requires manual quoting: '+k)
  lines.append(k+'='+q+v+q)
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text('\n'.join(lines)+'\n',encoding='utf-8')
def dev_env():
 p=ROOT/'.env'
 if not p.is_file():fail('Local .env required for initial local config import.')
 keys=re.findall(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=',p.read_text(encoding='utf-8-sig'),re.M)
 js='console.log(JSON.stringify(Object.fromEntries('+json.dumps(keys)+'.map(k=>[k,process.env[k]||""]))))'
 return json.loads(run([node(),'--env-file='+str(p),'-e',js],env=base_env()))
def prepare():
 if git('rev-parse','--show-prefix'):fail('Run from the application repository root.')
 target=ROOT/'tools/deploy/assets/standard-cover-letter.md';source=ROOT/'templates/standard-cover-letter.md'
 if not source.is_file():fail('Local default template missing.')
 b=source.read_bytes();scan(str(source),b)
 if not b.strip() or len(b)>100000:fail('Default template empty or too large.')
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
 lock=ROOT/'tools/deploy/requirements.lock.txt'
 if not lock.exists():
  try:from pip._vendor.packaging.requirements import Requirement
  except ImportError:fail('pip is required to pin installed worker dependencies.')
  pending=[('google-api-python-client',set()),('google-auth',set())];seen=set();versions={}
  while pending:
   name,extras=pending.pop();key=(name.lower().replace('_','-'),tuple(sorted(extras)))
   if key in seen:continue
   seen.add(key)
   try:d=importlib.metadata.distribution(name)
   except importlib.metadata.PackageNotFoundError:fail('Working Python dependency missing from this interpreter: '+name)
   versions[d.metadata['Name']]=d.version
   for item in d.requires or []:
    r=Requirement(item)
    if r.marker is None or any(r.marker.evaluate({'extra':x}) for x in ['']+list(extras)):pending.append((r.name,set(r.extras)))
  lock.write_text('# Pinned installed Google-worker dependency closure\n'+''.join(n+'=='+v+'\n' for n,v in sorted(versions.items())),encoding='utf-8')
 print('Prepared versioned template asset and Python lock. No Git staging.')
def prod_root(args):
 p=Path(args.production_root).resolve();repo=Path(git('rev-parse','--show-toplevel')).resolve()
 if p==repo or p.is_relative_to(repo) or repo.is_relative_to(p):fail('Production must be outside the repository.')
 if p.is_symlink():fail('Symlink production root refused.')
 return p
@contextlib.contextmanager
def delivery_lock(prod):
 prod.mkdir(parents=True,exist_ok=True);p=prod/'delivery.lock'
 try:fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
 except FileExistsError:fail('Delivery lock exists; inspect the previous operation rather than deleting it blindly.')
 os.write(fd,str(os.getpid()).encode());os.close(fd)
 try:yield
 finally:p.unlink(missing_ok=True)
def busy(port):
 with socket.socket() as s:s.settimeout(.3);return s.connect_ex(('127.0.0.1',port))==0
def schemas(folder):
 result={}
 for n in STORES:
  p=folder/n
  if p.suffix=='.db' and p.is_file():
   with _managed_sqlite_connection(p.as_uri()+'?mode=ro',uri=True) as db:rows=db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name').fetchall()
   result[n]=sha(json.dumps(rows).encode())
 return result
def snapshot(source,target):
 if target.exists():fail('Snapshot target already exists; not overwritten.')
 target.mkdir(parents=True)
 for n in STORES:
  p=source/n
  if not p.is_file():continue
  if p.is_symlink():fail('Symlink runtime store refused.')
  if p.suffix=='.db':
   with _managed_sqlite_connection(p.as_uri()+'?mode=ro',uri=True) as src,_managed_sqlite_connection(target/n) as dst:
    src.backup(dst)
    if dst.execute('PRAGMA quick_check').fetchone()[0]!='ok':fail('Database backup integrity failed: '+n)
  else:b=p.read_bytes();json.loads(b.decode('utf-8-sig'));(target/n).write_bytes(b)
 atomic(target/'snapshot.json',{'schema':schemas(target),'createdAt':stamp(),'files':{n:hashed(target/n) for n in STORES if (target/n).is_file()}})
def initialise(args):
 prod=prod_root(args)
 with delivery_lock(prod):
  marker=read(prod/'bootstrap-manifest.json')
  if not marker or marker.get('sourceProject')!=str(ROOT):fail('Matching bootstrap ownership marker required.')
  config=prod/'shared/config/production.env'
  if config.exists():print('Existing production configuration retained.');return
  env=dev_env()
  if args.seed and busy(int(env.get('PORT') or 3000)):fail('Stop development before coordinated initial data seeding.')
  inv=Path(env.get('CV_INVENTORY_PATH',''));inv=inv if inv.is_absolute() else ROOT/inv
  if not inv.is_file():fail('Configured CV inventory missing.')
  inventory=inv.read_bytes();json.loads(inventory.decode('utf-8-sig'))
  for n in ['releases','verification','control','shared/config','shared/data','shared/reference','shared/logs','shared/backups']:(prod/n).mkdir(parents=True,exist_ok=True)
  if args.seed:
   data=prod/'shared/data'
   if any(data.iterdir()):fail('Initial seeding requires empty production data; no overwrite.')
   staging=prod/'shared'/('seed-'+uuid.uuid4().hex);snapshot(ROOT/'output',staging);data.rmdir();os.replace(staging,data)
  reference=prod/'shared/reference/cv-inventory.json'
  if reference.exists() and reference.read_bytes()!=inventory:fail('Existing production inventory differs; not overwritten.')
  reference.write_bytes(inventory)
  env={k:v for k,v in env.items() if k.startswith(('GMAIL_OAUTH_','PERPLEXITY_','CANDIDATE_','COVER_LETTER_')) or k in ['GMAIL_FROM_ADDRESS','CV_FOLDER']}
  if env.get('CV_FOLDER') and not Path(env['CV_FOLDER']).is_absolute():env['CV_FOLDER']=str((ROOT/env['CV_FOLDER']).resolve())
  env.update({k:'false' for k in FLAGS});env.update(NMP_ENV='production',HOST='127.0.0.1',PORT='3100',NMP_STATE_DIRECTORY=str(prod/'shared/data'),DATA_DIRECTORY=str(prod/'shared/data'),CV_INVENTORY_PATH=str(reference),LOCAL_DEBUG='false',LOCAL_DEBUG_LOGGING='false')
  control=prod/'control/local_delivery.py'
  if not control.exists():shutil.copyfile(Path(__file__),control)
  launcher='@echo off\r\nsetlocal\r\nset "NMP_SOURCE_ROOT='+str(ROOT)+'"\r\ncd /d "'+str(prod)+'"\r\n"'+sys.executable+'" "'+str(control)+'" --production-root "'+str(prod)+'" serve\r\npause\r\n'
  (prod/'start-production.bat').write_text(launcher,encoding='utf-8',newline='')
  atomic(prod/'settings.json',{'sourceRepository':str(ROOT),'port':3100,'seeded':args.seed});write_env(config,env)
  print('Production config ready: '+str(config));print('Integrations OFF; source .env unchanged. '+('Initial state copied.' if args.seed else 'Empty production stores.'))
def python_at(candidate):return candidate/('.venv/Scripts/python.exe' if os.name=='nt' else '.venv/bin/python')
def verify_env(candidate,state,port):
 env=base_env();env.update({k:'false' for k in FLAGS});env.update(NMP_ENV='verification',NMP_STATE_DIRECTORY=str(state),HOST='127.0.0.1',PORT=str(port),PERPLEXITY_API_KEY='',CI='true',LOCAL_DEBUG='false',LOCAL_DEBUG_LOGGING='false',CANDIDATE_DISPLAY_NAME='Test Candidate')
 p=candidate/'var/verification';(p/'cv').mkdir(parents=True,exist_ok=True);inv=p/'inventory.json';inv.write_text(json.dumps({'cv_inventory':{'cvs':[{'role_code':'RTE','role_name':'Release Train Engineer','local_path':'RTE/cv.pdf','tags':['safe','scrum'],'use_cases':['Synthetic delivery evidence.'],'priority':'high'},{'role_code':'PM','role_name':'Project Manager','local_path':'PM/cv.pdf','tags':['delivery'],'use_cases':['Synthetic project evidence.'],'priority':'medium'}]}}))
 env.update(CV_FOLDER=str(p/'cv'),CV_INVENTORY_PATH=str(inv),TEMPLATE_DIRECTORY=str(candidate/'tools/deploy/assets'),PYTHON=str(python_at(candidate)))
 write_env(candidate/'.env',{k:v for k,v in env.items() if k not in base_env()});return env
def verify_candidate(candidate,log):
 preflight()
 if busy(3000):fail('Stop development during release verification; legacy UI tests may reference port 3000. Production stays separate.')
 n=node();env=verify_env(candidate,candidate/'var/verification/state',3200)
 asset=candidate/'tools/deploy/assets/standard-cover-letter.md';template=candidate/'templates/standard-cover-letter.md';lock=candidate/'tools/deploy/requirements.lock.txt'
 if not asset.is_file() or not lock.is_file():fail('Versioned template asset/Python lock missing; run prepare and checkpoint.')
 template.parent.mkdir(parents=True,exist_ok=True)
 if template.exists() and template.read_bytes()!=asset.read_bytes():fail('Tracked template differs from versioned asset.')
 template.write_bytes(asset.read_bytes())
 venv.EnvBuilder(with_pip=True).create(candidate/'.venv');py=python_at(candidate)
 run([n,npm_cli(n),'ci','--no-audit','--no-fund'],candidate,env,log)
 run([py,'-m','pip','install','--disable-pip-version-check','-r',lock],candidate,env,log);run([py,'-m','pip','check'],candidate,env,log)
 tests=sorted(p.relative_to(candidate).as_posix() for p in (candidate/'tests').rglob('*.test.js'))
 if not tests:fail('No Node tests discovered.')
 for start in range(0,len(tests),30):run([n,'--test',*tests[start:start+30]],candidate,env,log)
 if (candidate/'tests/worker').is_dir():run([py,'-B','-m','unittest','discover','-s','tests/worker','-p','test_*.py'],candidate,env,log)
 run([py,'-B','tools/deploy/test_local_delivery.py'],candidate,env,log)
 run([n,candidate/'node_modules/playwright/cli.js','install','chromium'],candidate,env,log)
 run([n,candidate/'node_modules/playwright/cli.js','test','--config=tools/deploy/playwright.release.config.mjs'],candidate,env,log)
 if template.read_bytes()!=asset.read_bytes():fail('Verification altered the template.')
 return {'node':n,'nodeHash':hashed(Path(n)),'nodeVersion':run([n,'--version']),'pythonVersion':run([py,'--version']),'contract':read(candidate/'tools/deploy/storage-contract.json')['version']}
def plan():
 prepare()
 if git('diff','--cached','--name-only'):fail('Index not empty; review existing staging first.')
 modified=set(split(git('diff','--no-renames','--name-only','-z')));untracked=set(split(git('ls-files','--others','--exclude-standard','-z')))
 untrack=sorted(n for n in split(git('ls-files','-z')) if '__pycache__' in PurePosixPath(n).parts or n.endswith('.pyc'))
 selected=sorted(n for n in modified|untracked if (safe_source(n) or not (ROOT/n).exists()) and n not in untrack)
 excluded=sorted(modified-set(selected)-set(untrack))
 if excluded:fail('Tracked modifications require scope review: '+', '.join(excluded))
 if not selected:fail('No source changes to checkpoint.')
 for n in source_files():scan(n,(ROOT/n).read_bytes())
 doc={'head':git('rev-parse','HEAD'),'branch':git('branch','--show-current'),'message':'Baseline: tested local production and continuous delivery','paths':selected,'untrack':untrack,'files':fingerprints(),'excludedUntracked':sorted(untracked-set(selected))}
 if not doc['branch']:fail('Detached HEAD; choose a branch first.')
 p=ROOT/'var/maintenance/delivery'/('checkpoint-plan-'+sha(json.dumps(doc,sort_keys=True).encode())[:16]+'.json');atomic(p,doc)
 review=p.with_suffix('.md');review.write_text('# Review baseline scope\n\nBranch: '+doc['branch']+'\nParent: '+doc['head']+'\nMessage: '+doc['message']+'\n\n## Explicit paths\n'+''.join('- '+x+'\n' for x in selected)+'\n## Generated files removed from tracking ONLY; local copies kept\n'+''.join('- '+x+'\n' for x in untrack)+'\n## Excluded untracked files\n'+''.join('- '+x+'\n' for x in doc['excludedUntracked'])+'\nInspect new files and git diff locally. No remote push. Secret scanning is not a privacy guarantee. Existing unusual tracked artifacts are not silently deleted.\n',encoding='utf-8')
 print('PLAN: '+str(p));print('REVIEW: '+str(review));print('Nothing staged or committed. Approval is the checkpoint --plan command for this exact plan.')
def checkpoint(args):
 doc=read(Path(args.plan));
 if not doc:fail('Reviewed plan required.')
 if git('rev-parse','HEAD')!=doc['head'] or git('branch','--show-current')!=doc['branch'] or git('diff','--cached','--name-only'):fail('HEAD, branch or index changed since plan.')
 if fingerprints()!=doc['files']:fail('Source changed since plan. Generate/review a new plan.')
 if set(split(git('diff','--no-renames','--name-only','-z')))-set(doc['paths'])-set(doc['untrack']):fail('New tracked changes appeared after plan.')
 candidate=Path(tempfile.mkdtemp(prefix='nmp-baseline-'));log=ROOT/'var/maintenance/delivery'/('baseline-'+stamp()+'.log');log.parent.mkdir(parents=True,exist_ok=True)
 try:
  for name,h in doc['files'].items():p=candidate/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/name).read_bytes())
  runtime=verify_candidate(candidate,log)
  if fingerprints()!=doc['files'] or any(not (candidate/n).is_file() or hashed(candidate/n)!=h for n,h in doc['files'].items()):fail('Source changed during verification; no staging.')
  if git('rev-parse','HEAD')!=doc['head'] or git('diff','--cached','--name-only'):fail('Git changed during verification.')
  for start in range(0,len(doc['paths']),30):git('add','-A','--',*doc['paths'][start:start+30])
  for name in doc['untrack']:git('rm','--cached','--',name)
  expected=set(doc['paths']+doc['untrack'])
  if set(split(git('diff','--cached','--no-renames','--name-only','-z')))!=expected:fail('Staged scope differs. No commit; inspect index.')
  for name in doc['paths']:
   if name in doc['files']:
    if not staged_source_matches(name):fail('Staged content changed: '+name)
  git('commit','-m',doc['message']);commit=git('rev-parse','HEAD')
  if set(split(git('diff-tree','--no-commit-id','--no-renames','--name-only','-r','-z','HEAD')))!=expected or fingerprints()!=doc['files']:fail('Commit created but hooks/concurrent edits changed scope. No tested tag. Inspect '+commit)
  tag='baseline-localprod-'+stamp();git('tag','-a',tag,'-m','Tested baseline '+commit);atomic(ROOT/'var/maintenance/delivery'/('checkpoint-'+commit+'.json'),{'commit':commit,'tag':tag,'testsPassed':True,'report':str(log),'runtime':runtime})
  print('BASELINE COMMITTED: '+commit);print('TAG: '+tag);print('No remote push. Test report: '+str(log))
 finally:shutil.rmtree(candidate,ignore_errors=True)
def extract(commit,target):
 r=subprocess.run(['git','archive','--format=tar',commit],cwd=ROOT,capture_output=True)
 if r.returncode:fail('git archive failed.')
 with tarfile.open(fileobj=io.BytesIO(r.stdout)) as tar:
  for m in tar.getmembers():
   if not m.isfile() or not safe_source(m.name):continue
   b=tar.extractfile(m).read();scan(m.name,b);p=target/m.name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
def health(port,commit,timeout=40,child=None):
 import urllib.request
 deadline=time.time()+timeout;opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 while time.time()<deadline:
  if child and child.poll() is not None:fail('Candidate exited before health verification.')
  try:
   with opener.open('http://127.0.0.1:'+str(port)+'/healthz',timeout=2) as r:v=json.load(r)
   if v.get('ok') and v.get('service')=='NewModularProduct' and v.get('release')==commit:return
  except Exception:pass
  time.sleep(.3)
 fail('Health did not verify expected commit: '+commit)
def stop(child):
 if child is None or child.poll() is not None:return
 child.send_signal(signal.CTRL_BREAK_EVENT if os.name=='nt' else signal.SIGTERM)
 try:child.wait(timeout=90)
 except subprocess.TimeoutExpired:fail('Graceful shutdown timed out. Process NOT killed; inspect active requests/mail operations.')
def smoke(release,state,commit,log):
 if busy(3201):fail('Verification port 3201 occupied; existing process not reused.')
 env=verify_env(release,state,3201);env['NMP_RELEASE_COMMIT']=commit
 with log.open('ab') as f:
  child=subprocess.Popen([node(),'src/interfaces/http/run-local-server.js'],cwd=release,env=env,stdout=f,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name=='nt' else 0)
  try:health(3201,commit,child=child)
  finally:stop(child)
def pause(prod):
 s=read(prod/'supervisor-status.json',{})
 if time.time()-s.get('heartbeat',0)<5 and s.get('session'):
  session=s['session'];atomic(prod/'supervisor-control.json',{'session':session,'paused':True});deadline=time.time()+105
  while time.time()<deadline:
   current=read(prod/'supervisor-status.json',{})
   if current.get('session')==session and current.get('mode')=='paused':return session
   time.sleep(.3)
  fail('Supervisor did not acknowledge graceful pause; no promotion.')
 if busy(3100):fail('Unverified process owns port 3100; it will not be killed.')
 return None
def resume(prod,session):
 if session:atomic(prod/'supervisor-control.json',{'session':session,'paused':False})
def checked_release(release):
 m=read(release/'release.json')
 if not m:fail('Verified release manifest missing.')
 for n,h in m['files'].items():
  if not (release/n).is_file() or hashed(release/n)!=h:fail('Release source changed: '+n)
 if hashed(Path(m['runtime']['node']))!=m['runtime']['nodeHash']:fail('Node runtime changed; reverify release.')
 if run([python_at(release),'--version'])!=m['runtime']['pythonVersion']:fail('Python runtime changed; reverify release.')
 return m
def deliver(args):
 prod=prod_root(args)
 with delivery_lock(prod):
  if not (prod/'shared/config/production.env').is_file():fail('Run init first.')
  commit=git('rev-parse','--verify',args.ref+'^{commit}')
  if not re.fullmatch('[0-9a-f]{40,64}',commit):fail('Invalid commit.')
  active=read(prod/'active.json')
  if active and active['commit']==commit:print('Commit already active.');return
  release=prod/'releases'/commit
  if release.exists():fail('Release path already exists. Inspect it or use rollback; never overwrite it.')
  release.mkdir(parents=True);log=prod/'shared/logs'/('release-'+commit[:12]+'-'+stamp()+'.log');log.parent.mkdir(parents=True,exist_ok=True)
  atomic(release/'candidate.json',{'commit':commit,'createdAt':stamp()});session=None;promoted=False
  try:
   extract(commit,release);sourceHashes={p.relative_to(release).as_posix():hashed(p) for p in release.rglob('*') if p.is_file() and safe_source(p.relative_to(release).as_posix())};runtime=verify_candidate(release,log)
   if any(not (release/n).is_file() or hashed(release/n)!=h for n,h in sourceHashes.items()):fail('Verification changed committed source; no promotion.')
   if active and checked_release(prod/'releases'/active['commit'])['runtime']['contract']!=runtime['contract']:fail('Storage contract differs; reviewed migration required.')
   smoke(release,release/'var/verification/empty-state',commit,log);session=pause(prod)
   backup=prod/'shared/backups'/('before-'+commit[:12]+'-'+stamp());snapshot(prod/'shared/data',backup)
   probe=release/'var/verification/production-copy';snapshot(backup,probe);before=schemas(probe);smoke(release,probe,commit,log);after=schemas(probe)
   if any(after.get(n)!=h for n,h in before.items()):fail('Candidate changes an existing production schema. Migration review required; no promotion.')
   template=release/'templates/standard-cover-letter.md'
   if template.is_file():sourceHashes['templates/standard-cover-letter.md']=hashed(template)
   for name in ['.env','var','output','data','test-results','playwright-report','blob-report']:
    p=release/name
    if p.is_symlink() or p.is_file():p.unlink()
    elif p.is_dir():shutil.rmtree(p)
   atomic(release/'release.json',{'commit':commit,'files':sourceHashes,'runtime':runtime,'verifiedAt':stamp(),'testReport':str(log),'backup':str(backup)})
   atomic(prod/'active.json',{'commit':commit,'previous':active['commit'] if active else None,'promotedAt':stamp()});promoted=True;resume(prod,session)
   if session:health(3100,commit)
   print('RELEASE PROMOTED: '+commit);print('Launch/keep open: '+str(prod/'start-production.bat'));print('Production: http://127.0.0.1:3100');print('Report: '+str(log))
  except BaseException:
   if promoted:
    pause(prod)
    if schemas(prod/'shared/data')!=read(backup/'snapshot.json')['schema']:fail('Schema changed after promotion; automatic recovery blocked. Data/history NOT restored. Production left paused.')
    if active:atomic(prod/'active.json',active);resume(prod,session)
   else:resume(prod,session)
   raise
  # Failed candidate is retained for diagnostics, never overwritten automatically.
def production_env(prod,release,commit):
 env=base_env();env.update(NMP_ENV='production',NMP_RELEASE_COMMIT=commit,NMP_STATE_DIRECTORY=str(prod/'shared/data'),DATA_DIRECTORY=str(prod/'shared/data'),HOST='127.0.0.1',PORT='3100',CV_INVENTORY_PATH=str(prod/'shared/reference/cv-inventory.json'),TEMPLATE_DIRECTORY=str(release/'tools/deploy/assets'),PYTHON=str(python_at(release)),NMP_ALLOW_DEVELOPMENT_INTEGRATIONS='false');return env

def serve(args):
 prod=prod_root(args);lock=prod/'supervisor.lock'
 try:fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
 except FileExistsError:fail('Supervisor lock exists; inspect the current production window/status first.')
 os.write(fd,str(os.getpid()).encode());os.close(fd);session=uuid.uuid4().hex;child=None;running=None;log=None;closed=False
 atomic(prod/'supervisor-control.json',{'session':session,'paused':False})
 print('Production supervisor on 127.0.0.1:3100. Ctrl+C requests graceful shutdown.',flush=True)
 try:
  while True:
   control=read(prod/'supervisor-control.json',{});paused=control.get('session')==session and control.get('paused') is True;active=read(prod/'active.json',{});wanted=active.get('commit')
   if child and (paused or wanted!=running):stop(child);child=None;running=None
   if paused:mode='paused'
   elif child is None and wanted:
    if busy(3100):fail('Port 3100 occupied; no existing process will be killed or reused.')
    release=prod/'releases'/wanted;m=checked_release(release)
    if log:log.close()
    log=(prod/'shared/logs'/('production-'+stamp()+'.log')).open('ab')
    child=subprocess.Popen([m['runtime']['node'],'--env-file='+str(prod/'shared/config/production.env'),'src/interfaces/http/run-local-server.js'],cwd=release,env=production_env(prod,release,wanted),stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name=='nt' else 0);running=wanted;mode='starting';print('Starting production commit '+wanted,flush=True)
   elif child:
    if child.poll() is not None:fail('Production exited; inspect shared/logs. No automatic crash/retry loop.')
    mode='running'
   else:mode='waiting-for-release'
   atomic(prod/'supervisor-status.json',{'session':session,'heartbeat':time.time(),'mode':mode,'commit':running,'nodePid':child.pid if child else None,'supervisorPid':os.getpid()});time.sleep(.4)
 except KeyboardInterrupt:pass
 finally:
  try:stop(child);closed=True
  finally:
   if log:log.close()
   if closed:atomic(prod/'supervisor-status.json',{'session':session,'heartbeat':time.time(),'mode':'stopped'});lock.unlink(missing_ok=True)
def rollback(args):
 prod=prod_root(args)
 with delivery_lock(prod):
  active=read(prod/'active.json',{});previous=active.get('previous')
  if not previous:fail('No previous verified release recorded.')
  old=prod/'releases'/previous;new=prod/'releases'/active['commit']
  if checked_release(old)['runtime']['contract']!=checked_release(new)['runtime']['contract']:fail('Storage contracts differ; migration review required.')
  session=pause(prod);initial=schemas(prod/'shared/data');switched=False;copy=None
  try:
   backup=prod/'shared/backups'/('before-code-rollback-'+stamp());snapshot(prod/'shared/data',backup)
   copy=prod/'verification'/('rollback-'+uuid.uuid4().hex);shutil.copytree(old,copy);probe=copy/'var/verification/state';snapshot(backup,probe);before=schemas(probe);log=prod/'shared/logs'/('rollback-'+stamp()+'.log');smoke(copy,probe,previous,log)
   if schemas(probe)!=before:fail('Previous release changes the current schema; rollback blocked.')
   atomic(prod/'active.json',{'commit':previous,'previous':active['commit'],'promotedAt':stamp()});switched=True;resume(prod,session)
   if session:health(3100,previous)
   print('CODE ROLLBACK COMPLETE. Production data/mail history NOT rewound.')
  except BaseException:
   if switched:
    pause(prod)
    if schemas(prod/'shared/data')!=initial:fail('Rollback health failed with schema change; left paused. Data/history NOT restored.')
    atomic(prod/'active.json',active)
   resume(prod,session);raise
  finally:
   if copy:shutil.rmtree(copy,ignore_errors=True)
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--production-root',default='D:/NewModularProduct-Production');sub=p.add_subparsers(dest='command',required=True)
 sub.add_parser('prepare');sub.add_parser('plan');c=sub.add_parser('checkpoint');c.add_argument('--plan',required=True);i=sub.add_parser('init');i.add_argument('--seed',action='store_true');d=sub.add_parser('deliver');d.add_argument('--ref',default='HEAD');sub.add_parser('serve');sub.add_parser('rollback');sub.add_parser('status');sub.add_parser('health');sub.add_parser('preflight');a=p.parse_args()
 if a.command=='preflight':preflight()
 elif a.command=='prepare':prepare()
 elif a.command=='plan':plan()
 elif a.command=='checkpoint':checkpoint(a)
 elif a.command=='init':initialise(a)
 elif a.command=='deliver':deliver(a)
 elif a.command=='serve':serve(a)
 elif a.command=='rollback':rollback(a)
 elif a.command=='health':
  prod=prod_root(a);active=read(prod/'active.json')
  if not active:fail('No promoted release.')
  health(3100,active['commit']);print('HEALTH PASSED: production is serving '+active['commit'])
 else:prod=prod_root(a);print(json.dumps({'active':read(prod/'active.json'),'supervisor':read(prod/'supervisor-status.json')},indent=2))

@contextlib.contextmanager
def _managed_sqlite_connection(*args, **kwargs):
    connection = sqlite3.connect(*args, **kwargs)
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def preflight():
    executable = node()
    env = base_env()
    if os.name == 'nt':
        missing = [key for key in ('SYSTEMROOT','SYSTEMDRIVE')
                   if not any(name.upper()==key and value for name,value in env.items())]
        if missing:
            fail('Required Windows OS environment variables missing: '+', '.join(missing))
    run([executable,'-e',"require('node:crypto').randomBytes(32); console.log('NODE_CRYPTO_PREFLIGHT_PASSED')"],env=env)
    run([executable,npm_cli(executable),'--version'],env=env)
    run([sys.executable,'-c',"import ssl,secrets; secrets.token_bytes(32); print('PYTHON_CRYPTO_PREFLIGHT_PASSED')"],env=env)
    print('PREFLIGHT PASSED: Node crypto, npm startup and Python crypto under the filtered OS environment.',flush=True)

if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)
