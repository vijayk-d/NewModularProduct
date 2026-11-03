import argparse,datetime,hashlib,json,pathlib,subprocess
HERE=pathlib.Path(__file__).resolve().parent;MANIFEST=json.loads((HERE/'manifest.json').read_text());STATE=HERE/'installation.json'
def digest(b):return hashlib.sha256(b.decode('utf-8-sig').replace('\r\n','\n').encode()).hexdigest()
def verify(root,node):
 for e in MANIFEST:
  if e['path'].endswith(('.js','.mjs')):subprocess.run([node,'--check',e['path']],cwd=root,check=True)
 subprocess.run([node,'--test',*json.loads((HERE/'focused-tests.json').read_text())],cwd=root,check=True)
def browser(root):subprocess.run(['npx.cmd' if __import__('os').name=='nt' else 'npx','--no-install','playwright','test','--config','tools/AssignmentEvidenceLibrary/playwright.config.mjs'],cwd=root,check=True)
def main():
 p=argparse.ArgumentParser();p.add_argument('--root',default='.');p.add_argument('--apply',action='store_true');p.add_argument('--verify',action='store_true');p.add_argument('--browser',action='store_true');p.add_argument('--rollback',action='store_true');p.add_argument('--node',default='node');a=p.parse_args();root=pathlib.Path(a.root).resolve()
 if a.apply and a.rollback:raise SystemExit('Choose apply OR rollback.')
 if 'production' in root.name.lower():raise SystemExit('Development-only candidate: refusing a production-named checkout.')
 if STATE.exists():
  state=json.loads(STATE.read_text());assert state['root']==str(root),'Wrong checkout root'
  for e in MANIFEST:
   f=root/e['path'];assert f.exists() and digest(f.read_bytes())==e['after'],'Scoped file changed since installation: '+e['path']
  if a.rollback:
   for e in MANIFEST:
    f=root/e['path'];backup=pathlib.Path(state['backup'])/e['path']
    if e['before'] is None:f.unlink()
    else:f.write_bytes(backup.read_bytes())
   STATE.unlink();print('Source restored. Private evidence database preserved; no runtime data deleted.');return
  if a.apply:raise SystemExit('Already installed; repeat apply refused.')
  if a.verify:verify(root,a.node)
  if a.browser:browser(root)
  print('Installed candidate verified only as requested. No commit or deployment.');return
 if a.rollback:raise SystemExit('No installation record.')
 for e in MANIFEST:
  f=root/e['path'];actual=digest(f.read_bytes()) if f.exists() else None
  if actual!=e['before']:raise SystemExit('Source mismatch; nothing written: '+e['path'])
  assert digest((HERE/'payload'/e['path']).read_bytes())==e['after'],'Corrupt payload'
 print('Preflight passed for '+str(len(MANIFEST))+' files. No runtime store opened, Git changes or provider calls.')
 if not a.apply:
  if a.browser:raise SystemExit('Install before browser verification.')
  return
 backup=HERE/'backups'/datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f');written=[]
 try:
  for e in MANIFEST:
   f=root/e['path']
   if f.exists():b=backup/e['path'];b.parent.mkdir(parents=True,exist_ok=True);b.write_bytes(f.read_bytes())
  for e in MANIFEST:
   f=root/e['path'];f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes((HERE/'payload'/e['path']).read_bytes());written.append(e)
  if a.verify:verify(root,a.node)
  if a.browser:browser(root)
  STATE.write_text(json.dumps({'root':str(root),'backup':str(backup)},indent=2))
 except BaseException:
  for e in reversed(written):
   f=root/e['path'];b=backup/e['path']
   if e['before'] is None:f.unlink()
   else:f.write_bytes(b.read_bytes())
  raise
 print('Development candidate installed. Restart development to initialise its separate evidence database. Not committed, pushed or deployed.')
if __name__=='__main__':main()
