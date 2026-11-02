"""Read-only schema comparison of retained backup and candidate-probe copies. Never opens shared/data."""
import argparse,json,pathlib,re,sqlite3,sys
STORES=('outreach.db','application-reviews-v1.db','job-imports-v1.db')
def read(p):return json.loads(p.read_text(encoding='utf-8-sig')) if p.is_file() else None
def schema(p):
 if not p.is_file():return {}
 if p.is_symlink():raise ValueError('Symlink database refused.')
 db=sqlite3.connect(p.resolve().as_uri()+'?mode=ro',uri=True)
 try:
  db.execute('PRAGMA query_only=ON')
  return {(r[0],r[1]):{'type':r[0],'name':r[1],'table':r[2],'sql':r[3]} for r in db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name')}
 finally:db.close()
def compare(before,after):
 result=[]
 for name in STORES:
  a=schema(before/name);b=schema(after/name);changes=[]
  for key in sorted(set(a)|set(b)):
   if a.get(key)!=b.get(key):changes.append({'change':'ADDED' if key not in a else 'REMOVED' if key not in b else 'CHANGED','type':key[0],'name':key[1],'before':a.get(key),'after':b.get(key)})
  result.append({'database':name,'beforeExists':(before/name).is_file(),'afterExists':(after/name).is_file(),'differences':changes})
 return result
def main():
 p=argparse.ArgumentParser();p.add_argument('--production-root',default='D:/NewModularProduct-Production');p.add_argument('--candidate',required=True);p.add_argument('--backup');a=p.parse_args()
 if not re.fullmatch('[0-9a-f]{40,64}',a.candidate):raise ValueError('Full candidate commit required.')
 root=pathlib.Path(a.production_root).resolve();probe=root/'releases'/a.candidate/'var/verification/production-copy';snapshot=read(probe/'snapshot.json')
 if not snapshot or probe.is_symlink():raise ValueError('Retained probe missing; do not recreate it or rerun deliver.')
 backup_root=root/'shared/backups'
 if a.backup:
  if pathlib.Path(a.backup).name!=a.backup or not a.backup.startswith('before-'+a.candidate[:12]+'-'):raise ValueError('Matching backup folder name required.')
  matches=[backup_root/a.backup]
 else:matches=sorted(p for p in backup_root.glob('before-'+a.candidate[:12]+'-*') if p.is_dir() and not p.is_symlink())
 if len(matches)!=1:
  print('Matching backups:',*[p.name for p in matches],sep='\n');raise ValueError('Select exactly one with --backup; do not delete backups.')
 before=matches[0]
 if before.is_symlink():raise ValueError('Symlink backup refused.')
 manifest=read(before/'snapshot.json')
 if not manifest or manifest.get('schema')!=snapshot.get('schema'):raise ValueError('Backup/probe baseline schemas differ; stop.')
 active=read(root/'active.json') or {};supervisor=read(root/'supervisor-status.json') or {}
 print(json.dumps({'candidate':a.candidate,'recordedActiveCommit':active.get('commit'),'recordedSupervisorMode':supervisor.get('mode'),'backupFolder':before.name,'scope':'sqlite_master schema definitions only in backup/probe copies; no application rows, live shared/data, credentials, network calls or mutations','databases':compare(before,probe)},indent=2))
if __name__=='__main__':
 try:main()
 except (ValueError,OSError,sqlite3.Error,json.JSONDecodeError) as e:print('STOP:',str(e),file=sys.stderr);sys.exit(1)
