"""Capture committed application source/tests for one consolidated next-slice bundle. No .env or user data."""
import argparse,hashlib,importlib.metadata,json,os,re,shutil,subprocess,sys
from pathlib import Path,PurePosixPath
from datetime import datetime,timezone
sys.dont_write_bytecode=True
BASE_COMMIT='1c641c44ca711cd76713fd1de9f01c132c45b3dd'
ROOT_FILES={'package.json','package-lock.json','.gitignore','.gitattributes','playwright.config.js','playwright.contacts.config.js','start-local-server.bat'}
DOCS={'docs/next-development-slices-roadmap.md','docs/slice1-evidence-preparation.md','docs/slice2-review-workspace.md','docs/cover-letter-quality-implementation-v1.md','docs/senior-cover-letter-quality-instructions-v1.md','docs/senior-cover-letter-quality-policy-v1.json'}
EXTENSIONS={'.js','.mjs','.cjs','.py','.css','.html','.json','.md','.txt','.toml','.yaml','.yml'}
SECRETS=re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AIza[0-9A-Za-z_-]{30,}|ya29\.[0-9A-Za-z_-]{30,}|1//[0-9A-Za-z_-]{30,}|(?:ghp_|github_pat_)[0-9A-Za-z_]{30,}|sk-[0-9A-Za-z_-]{32,}')

def require(ok,message):
 if not ok:raise RuntimeError(message)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def git(root,*args,input=None):
 result=subprocess.run(['git',*args],cwd=root,input=input,capture_output=True,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0','GIT_NO_LAZY_FETCH':'1'})
 require(result.returncode==0,'Git source inspection failed: '+args[0]+'. No report written.')
 return result.stdout

def permitted(name):
 p=PurePosixPath(name)
 if p.is_absolute() or '..' in p.parts or '\\' in name:return False
 if any(x in {'node_modules','.git','.venv','__pycache__','output','data','var','backups','test-results','playwright-report','blob-report','credentials','secrets'} for x in p.parts):return False
 if p.name.startswith('.env') or p.suffix.lower() not in EXTENSIONS and name not in ROOT_FILES:return False
 if name in ROOT_FILES or name in DOCS:return True
 if len(p.parts)==1:return p.suffix=='.md'
 if p.parts[0] in {'src','tests','templates','examples'}:return True
 if p.parts[0]=='python-worker':return p.suffix=='.py'
 if name.startswith('tools/deploy/'):return True
 return name in {'tools/maintenance/start-development.mjs','tools/maintenance/configure_development_env.py','scripts/run-tests-concise.mjs'}

def capture(root,expected_commit=BASE_COMMIT):
 root=root.resolve();require((root/'package.json').is_file() and not (root/'release.json').exists(),'Use the development repository, never production.')
 require(not git(root,'rev-parse','--show-prefix').strip(),'Run from the repository root.')
 head=git(root,'rev-parse','HEAD').decode().strip();require(head==expected_commit,'HEAD differs from the deployed baseline. Stop rather than overwrite or reset your work.')
 require(not git(root,'status','--porcelain','--untracked-files=no').strip(),'Tracked source/staging changed. Preserve it; do not reset or stash blindly. No report written.')
 branch=git(root,'branch','--show-current').decode('utf-8').strip();require(bool(branch),'Detached HEAD: choose the development branch first.')
 entries=[]
 for record in git(root,'ls-tree','-r','-l','-z','--full-tree',head).split(b'\0'):
  if not record:continue
  header,path=record.split(b'\t',1);mode,kind,oid,size=header.split();name=path.decode('utf-8')
  if not permitted(name):continue
  require(kind==b'blob' and mode in {b'100644',b'100755'},'Non-regular source refused: '+name)
  require(int(size)<=3*1024*1024,'Unexpectedly large source file: '+name)
  entries.append((name,oid.decode('ascii'),int(size)))
 require(entries and sum(n for _,_,n in entries)<=24*1024*1024,'Unexpected source snapshot size.')
 # Request only allowed source blobs: no archive of private/non-source files is created.
 request=('\n'.join(oid for _,oid,_ in entries)+'\n').encode('ascii')
 output=git(root,'cat-file','--batch',input=request);offset=0;files=[]
 for name,oid,size in entries:
  end=output.index(b'\n',offset);parts=output[offset:end].split();offset=end+1
  require(len(parts)==3 and parts[0].decode()==oid and parts[1]==b'blob' and int(parts[2])==size,'Git object response mismatch.')
  raw=output[offset:offset+size];offset+=size;require(output[offset:offset+1]==b'\n','Truncated Git object response.');offset+=1
  require(not SECRETS.search(raw),'Possible hard-coded credential in '+name+'. Review locally; no report written and no secret printed.')
  file=root/name;require(not file.is_symlink() and file.resolve().is_relative_to(root) and file.is_file(),'Unsafe/missing working source: '+name)
  working=file.read_bytes();require(working.replace(b'\r\n',b'\n')==raw.replace(b'\r\n',b'\n'),'Working content differs from committed source: '+name)
  text=raw.decode('utf-8-sig')
  files.append({'path':name,'gitBlob':oid,'gitBlobSha256':sha(raw),'sha256':sha(working),'normalisedSha256':sha(text.replace('\r\n','\n').encode('utf-8')),'hasUtf8Bom':raw.startswith(b'\xef\xbb\xbf'),'content':text})
 require(git(root,'rev-parse','HEAD').decode().strip()==head and not git(root,'status','--porcelain','--untracked-files=no').strip(),'Repository changed during capture; no report written.')
 for f in files:require(sha((root/f['path']).read_bytes())==f['sha256'],'Source changed during capture: '+f['path'])
 packages={}
 for name in ['python-docx','mammoth','pypdf']:
  try:packages[name]=importlib.metadata.version(name)
  except importlib.metadata.PackageNotFoundError:packages[name]=None
 office=bool(shutil.which('soffice') or shutil.which('libreoffice'))
 if not office:
  office=any((Path(os.environ[key])/'LibreOffice/program/soffice.exe').is_file() for key in ['PROGRAMFILES','PROGRAMFILES(X86)'] if os.environ.get(key))
 doc={'purpose':'Consolidated next-slice committed application source and complete available test source','createdAt':datetime.now(timezone.utc).isoformat(),'branch':branch,'head':head,'trackedWorkingTreeClean':True,'fileCount':len(files),'capabilities':{'pythonVersion':sys.version.split()[0],'optionalPythonPackages':packages,'localOfficeConverterDetected':office},'files':files,'privacy':'No .env, credential file, CV/Word/PDF document, database, contact record, private state or production file read. Hard-coded-source credential detection is best-effort; review before sharing. No package installation, application import, model call, Gmail action, Git write or deployment.'}
 folder=root/'var/maintenance/next-slice-source';require(not folder.is_symlink() and folder.resolve().is_relative_to(root),'Unsafe report directory.')
 folder.mkdir(parents=True,exist_ok=True);stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');path=folder/('next-slice-source-'+stamp+'.json')
 with path.open('x',encoding='utf-8',newline='\n') as stream:json.dump(doc,stream,ensure_ascii=False,indent=2)
 print('SOURCE REPORT: '+str(path));print('Committed source/test files captured: '+str(len(files)));print('Baseline commit: '+head);print('Local Office converter detected: '+str(office));print('No application/configuration/staging/production changes. No document contents or credentials collected.')
 return path

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());args=p.parse_args();capture(args.root)
if __name__=='__main__':
 if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(errors='replace')
 try:main()
 except Exception as error:print('ERROR: '+str(error),file=sys.stderr);sys.exit(1)
