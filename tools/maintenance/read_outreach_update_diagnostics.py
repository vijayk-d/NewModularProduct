"""Read-only, consent-gated diagnostics for the consolidated outreach-update package."""
import argparse,hashlib,json,os,subprocess,sys
from pathlib import Path

def safe(root,name):
 p=root/name
 if not p.resolve().is_relative_to(root) or p.is_symlink():raise RuntimeError('Unsafe diagnostic path: '+name)
 return p

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--source',action='store_true');p.add_argument('--gmail',action='store_true');p.add_argument('--confirm-read-only-gmail',action='store_true');a=p.parse_args();root=a.root.resolve();out=[]
 names=['templates/standard-cover-letter.md','python-worker/gmail_draft_worker.py','python-worker/gmail_confirmed_draft_worker.py','python-worker/gmail_send_worker.py','src/infrastructure/applications/sqlite-job-import-store.js']
 if a.source:
  for name in names:
   f=safe(root,name)
   if not f.is_file():out.append({'path':name,'exists':False});continue
   b=f.read_bytes()
   if len(b)>100000:raise RuntimeError('Source too large for diagnostics: '+name)
   out.append({'path':name,'exists':True,'sha256':hashlib.sha256(b).hexdigest(),'text':b.decode('utf-8-sig')})
 if a.gmail:
  if not a.confirm_read_only_gmail:raise RuntimeError('Gmail check requires explicit read-only consent flag. No request made.')
  if not (root/'tools/maintenance/check_gmail_signature.mjs').is_file():raise RuntimeError('Read-only Gmail signature diagnostic missing.')
  envfile=root/'.env'
  if not envfile.is_file():raise RuntimeError('Existing .env not found; do not paste secrets into chat.')
  r=subprocess.run([shutil.which('node') or 'node','--env-file='+str(envfile),str(root/'tools/maintenance/check_gmail_signature.mjs'),'--confirmed'],cwd=root,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=60)
  try:receipt=json.loads(r.stdout.strip())
  except:receipt={'ok':False,'code':'INVALID_SAFE_DIAGNOSTIC_RECEIPT'}
  out.append({'readOnlyGmailSignatureCheck':receipt})
 print(json.dumps({'mode':'READ_ONLY','results':out,'notes':['No source, queue, database, ledger, .env or Gmail draft was changed.','Gmail diagnostic authenticates and reads sender/signature metadata only when explicitly enabled.','Private letter/attachment/signature content is not output.']},indent=2,ensure_ascii=False))
if __name__=='__main__':
 import shutil
 try:main()
 except Exception as e:raise SystemExit('ERROR: '+str(e))
