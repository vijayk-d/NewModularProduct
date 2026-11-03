"""Read-only source collector for the review/polishing/Gmail presentation batch."""
import argparse,datetime,hashlib,json,pathlib,subprocess
EXTENSIONS={'.js','.mjs','.cjs','.py','.css','.html','.json','.md','.txt','.ts'}
EXCLUDED={'node_modules','.git','__pycache__','.venv','venv','backups','.patch-backups','test-results','playwright-report','output','dist','build','fixtures'}
def main():
 p=argparse.ArgumentParser();p.add_argument('--root',default='.');args=p.parse_args();root=pathlib.Path(args.root).resolve()
 if not (root/'src/interfaces/http/create-local-server.js').is_file():raise SystemExit('Run from the NewModularProduct repository root.')
 paths=set()
 for folder in ['src','tests','python-worker','tools/deploy']:
  directory=root/folder
  if directory.is_symlink():continue
  for f in directory.rglob('*'):
   rel=f.relative_to(root)
   if f.is_symlink() or not f.is_file() or any(x in EXCLUDED or 'backup' in x.lower() for x in rel.parts):continue
   if f.suffix.lower() not in EXTENSIONS or f.name.startswith('.env'):continue
   paths.add(rel)
 for name in ['package.json','playwright.config.js','playwright.contacts.config.js','docs/next-development-slices-roadmap.md','docs/NewModularProduct-Overall-Plan-Status.md','docs/NewModularProduct-continuation-checkpoint-2026-10-21.md']:
  f=root/name
  if f.is_file() and not f.is_symlink():paths.add(pathlib.Path(name))
 files=[];skipped=[]
 for rel in sorted(paths,key=str):
  f=root/rel
  try:
   if not f.resolve().is_relative_to(root):skipped.append({'path':rel.as_posix(),'reason':'outside repository'});continue
   if f.stat().st_size>1024*1024:skipped.append({'path':rel.as_posix(),'reason':'over 1 MiB'});continue
   raw=f.read_bytes();text=raw.decode('utf-8-sig')
   if '\x00' in text:skipped.append({'path':rel.as_posix(),'reason':'binary'});continue
   files.append({'path':rel.as_posix(),'sha256':hashlib.sha256(raw).hexdigest(),'content':text})
  except (OSError,UnicodeError):skipped.append({'path':rel.as_posix(),'reason':'unreadable or not UTF-8'})
 def git(*args):
  try:
   r=subprocess.run(['git',*args],cwd=root,capture_output=True,text=True,timeout=15)
   return r.stdout.strip() if r.returncode==0 else 'Unavailable'
  except (OSError,subprocess.TimeoutExpired):return 'Unavailable'
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 destination=root/'docs'/('workflow-stabilisation-source-'+stamp+'.json');destination.parent.mkdir(exist_ok=True)
 data={'purpose':'Source capture only; no code executed, files changed except this report, Git writes, database access or provider calls. Fixtures and runtime data excluded. Source may contain hard-coded private information: review before sharing.','createdAt':stamp,'branch':git('branch','--show-current'),'head':git('rev-parse','HEAD'),'status':git('status','--short','--branch'),'files':files,'skipped':skipped}
 destination.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
 print('Created:',destination);print('Captured files:',len(files));print('Skipped files:',len(skipped));print('Review the report for hard-coded private information before uploading. No credentials or runtime stores were deliberately collected.')
if __name__=='__main__':main()
