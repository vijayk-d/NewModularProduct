import argparse,hashlib,json,pathlib,datetime,subprocess,sys
HERE=pathlib.Path(__file__).resolve().parent;ENTRIES=json.loads((HERE/'manifest.json').read_text());STATE=HERE/'installation.json'
def digest(b):return hashlib.sha256(b.decode('utf-8-sig').replace('\r\n','\n').encode()).hexdigest()
def check(root):
 for e in ENTRIES:
  p=root/e['path'];actual=digest(p.read_bytes()) if p.exists() else None
  if actual!=e['before']:raise SystemExit('Source mismatch; no files changed: '+e['path'])
def verify(root,node):
 for e in ENTRIES:subprocess.run([node,'--check',str(root/e['path'])],check=True)
 tests=json.loads((HERE/'focused-tests.json').read_text());subprocess.run([node,'--test',*tests],cwd=root,check=True)
def main():
 p=argparse.ArgumentParser();p.add_argument('--root',default='.');p.add_argument('--apply',action='store_true');p.add_argument('--verify',action='store_true');p.add_argument('--rollback',action='store_true');p.add_argument('--node',default='node');a=p.parse_args();root=pathlib.Path(a.root).resolve()
 if a.apply and a.rollback:raise SystemExit('Choose apply OR rollback.')
 if a.rollback:
  state=json.loads(STATE.read_text());assert state['root']==str(root),'Wrong checkout'
  for e in ENTRIES:
   f=root/e['path'];assert f.exists() and digest(f.read_bytes())==e['after'],'Source changed since install: '+e['path']
  for e in ENTRIES:
   f=root/e['path'];b=pathlib.Path(state['backup'])/e['path']
   if b.exists():f.write_bytes(b.read_bytes())
   else:f.unlink()
  STATE.unlink();print('Source rollback complete. Data and production were not changed.');return
 check(root);print('All source guards match. No production, database, credentials, Git or provider actions.')
 if not a.apply:return
 backup=HERE/'backups'/datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f');written=[]
 for e in ENTRIES:assert digest((HERE/'payload'/e['path']).read_bytes())==e['after'],'Corrupt payload'
 try:
  for e in ENTRIES:
   f=root/e['path'];f.parent.mkdir(parents=True,exist_ok=True)
   if f.exists():b=backup/e['path'];b.parent.mkdir(parents=True,exist_ok=True);b.write_bytes(f.read_bytes())
   f.write_bytes((HERE/'payload'/e['path']).read_bytes());written.append(e)
  if a.verify:verify(root,a.node)
  STATE.write_text(json.dumps({'root':str(root),'backup':str(backup)},indent=2))
 except BaseException:
  for e in reversed(written):
   f=root/e['path'];b=backup/e['path']
   if b.exists():f.write_bytes(b.read_bytes())
   else:f.unlink()
  raise
 print('Development candidate installed. NOT committed, pushed, deployed or production-verified.')
if __name__=='__main__':main()
