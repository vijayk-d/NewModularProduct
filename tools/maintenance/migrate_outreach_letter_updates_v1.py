"""Reviewed additive migration for the unsent-letter update ledger. No mail/API calls, row rewrites, or deployment."""
import argparse,datetime,hashlib,json,pathlib,socket,sqlite3,sys
TABLE="CREATE TABLE outreach_letter_updates(id TEXT PRIMARY KEY,application_key TEXT NOT NULL,recipient_key TEXT NOT NULL,queue_id TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL)"
INDEX="CREATE UNIQUE INDEX outreach_letter_update_lock ON outreach_letter_updates(application_key,recipient_key) WHERE status IN ('reserved','unknown')"
OBJECTS={('table','outreach_letter_updates'),('index','outreach_letter_update_lock')}
def fail(s):raise ValueError(s)
def read(p):return json.loads(p.read_text(encoding='utf-8-sig')) if p.is_file() else None
def connect(p,write=False):
 if not p.is_file() or p.is_symlink():fail('Existing non-symlink database required.')
 return sqlite3.connect(p.resolve().as_uri()+('?mode=rw' if write else '?mode=ro'),uri=True,timeout=3)
def schema(db):return [list(r) for r in db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name')]
def sha(v):return hashlib.sha256(json.dumps(v,ensure_ascii=True,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def schema_map(rows):return {(r[0],r[1]):r for r in rows}
def fingerprint(db,tables=None):
 if tables is None:tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
 result={}
 for name in tables:
  quoted='"'+name.replace('"','""')+'"';values=[]
  for row in db.execute('SELECT * FROM '+quoted):
   values.append(sha([{'blob':v.hex()} if isinstance(v,bytes) else v for v in row]))
  result[name]={'rows':len(values),'sha256':sha(sorted(values))}
 return result
def expected_objects():
 db=sqlite3.connect(':memory:')
 try:db.execute(TABLE);db.execute(INDEX);return schema_map(schema(db))
 finally:db.close()
def add(db):
 current=schema_map(schema(db));expected=expected_objects();present=set(current)&OBJECTS
 if present:
  if present==OBJECTS and all(current[k]==expected[k] for k in OBJECTS):return False
  fail('Ledger objects already exist with partial/unexpected definitions; nothing guessed or overwritten.')
 db.execute(TABLE);db.execute(INDEX);return True
def copy_db(source,target):
 if target.exists():fail('Backup destination exists; not overwritten.')
 target.parent.mkdir(parents=True,exist_ok=True);src=connect(source)
 try:
  dst=sqlite3.connect(target)
  try:src.backup(dst);check=dst.execute('PRAGMA quick_check').fetchone()[0]
  finally:dst.close()
  if check!='ok':fail('Backup integrity check failed.')
 finally:src.close()
def preview(source,probe):
 db=connect(source)
 try:before=schema(db);data=fingerprint(db)
 finally:db.close()
 expected=expected_objects();original=schema_map(before)
 if set(original)&OBJECTS:fail('Ledger already exists. Do not repeat the migration; inspect state before release.')
 db=connect(probe)
 try:observed=schema_map(schema(db))
 finally:db.close()
 delta=set(observed)^set(original)
 if delta!=OBJECTS or any(observed[k]!=v for k,v in original.items()) or any(observed[k]!=expected[k] for k in OBJECTS):fail('Candidate schema differs from exactly the reviewed table/index addition. Stop.')
 with tempfile_directory() as temp:
  target=temp/'preview.db';copy_db(source,target);db=connect(target,True)
  try:
   db.execute('BEGIN IMMEDIATE')
   if schema(db)!=before or fingerprint(db)!=data:fail('Source changed during preview; retry when quiet.')
   add(db)
   if fingerprint(db,list(data))!=data:fail('Existing records changed in preview.')
   after=schema(db)
   if schema_map(after)!=observed:fail('Preview does not match candidate schema.')
   if db.execute('PRAGMA quick_check').fetchone()[0]!='ok':fail('Preview integrity failed.')
   db.commit()
  except BaseException:db.rollback();raise
  finally:db.close()
 return {'beforeSchema':before,'beforeSchemaHash':sha(before),'afterSchemaHash':sha(after),'existingRecordHashes':data,'migrationObjects':sorted([list(k) for k in OBJECTS])}
class tempfile_directory:
 def __enter__(self):
  import tempfile
  self.temp=tempfile.TemporaryDirectory(prefix='outreach-migration-preview-');return pathlib.Path(self.temp.name)
 def __exit__(self,*args):self.temp.cleanup()
def active_commit(root):
 active=read(root/'active.json')
 if not active or not isinstance(active.get('commit'),str):fail('Active production release metadata missing.')
 return active['commit']
def require_stopped(root):
 if (root/'supervisor.lock').exists():fail('Production supervisor lock exists. Stop production gracefully; never delete the lock to bypass this check.')
 sock=socket.socket();sock.settimeout(1)
 try:
  if sock.connect_ex(('127.0.0.1',3100))==0:fail('Production port 3100 is still listening. Stop the supervisor gracefully.')
 finally:sock.close()
 status=read(root/'supervisor-status.json') or {}
 if status.get('mode') not in ('stopped',None):fail('Supervisor status is not stopped; inspect before migration.')
def apply_database(source,plan,backup):
 copy_db(source,backup)
 db=connect(source,True)
 try:
  db.execute('BEGIN IMMEDIATE')
  if sha(schema(db))!=plan['beforeSchemaHash'] or fingerprint(db)!=plan['existingRecordHashes']:fail('Production data/schema changed since preview. No migration performed; generate a new check after stopping writers.')
  add(db)
  if sha(schema(db))!=plan['afterSchemaHash']:fail('Unexpected post-migration schema.')
  if fingerprint(db,list(plan['existingRecordHashes']))!=plan['existingRecordHashes']:fail('Existing record preservation failed.')
  if db.execute('SELECT COUNT(*) FROM outreach_letter_updates').fetchone()[0]!=0:fail('New ledger unexpectedly contains records.')
  if db.execute('PRAGMA quick_check').fetchone()[0]!='ok':fail('Post-migration integrity failed.')
  db.commit()
 except BaseException:db.rollback();raise
 finally:db.close()
def main():
 p=argparse.ArgumentParser();p.add_argument('--production-root',default='D:/NewModularProduct-Production');p.add_argument('--candidate',required=True);group=p.add_mutually_exclusive_group(required=True);group.add_argument('--check',action='store_true');group.add_argument('--apply',action='store_true');p.add_argument('--confirm-additive-migration',action='store_true');a=p.parse_args()
 import re
 if not re.fullmatch('[0-9a-f]{40,64}',a.candidate):fail('Full reviewed candidate commit required.')
 root=pathlib.Path(a.production_root).resolve();source=root/'shared/data/outreach.db';probe=root/'releases'/a.candidate/'var/verification/production-copy/outreach.db';planfile=root/'shared/migrations/outreach-letter-updates-v1-plan.json';receipt=root/'shared/migrations/outreach-letter-updates-v1-applied.json'
 if receipt.exists():fail('Applied receipt already exists. Do not repeat migration; keep the receipt and inspect status.')
 if a.check:
  plan=preview(source,probe);plan.update(version=1,candidate=a.candidate,productionRoot=str(root),activeCommit=active_commit(root));planfile.parent.mkdir(parents=True,exist_ok=True);planfile.write_text(json.dumps(plan,indent=2),encoding='utf-8');print('CHECK PASSED: exactly one new table and partial unique index; existing records preserved on a temporary COPY.');print('No live schema/data changed. Private plan saved locally:',planfile);print('Stop production gracefully before --apply. Application records changing after this preview will require a fresh --check.');return
 if not a.confirm_additive_migration:fail('Explicit --confirm-additive-migration required for live additive schema change.')
 plan=read(planfile)
 if not plan or plan.get('version')!=1 or plan.get('candidate')!=a.candidate or plan.get('productionRoot')!=str(root):fail('Matching checked migration plan required.')
 if active_commit(root)!=plan['activeCommit']:fail('Active release changed since check.')
 require_stopped(root)
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');backup=root/'shared/backups'/('outreach-letter-updates-v1-'+stamp)/'outreach.db'
 apply_database(source,plan,backup)
 receipt.write_text(json.dumps({'candidate':a.candidate,'previousActiveCommit':plan['activeCommit'],'backup':str(backup),'afterSchemaHash':plan['afterSchemaHash'],'appliedAt':stamp,'existingRecordsPreserved':True},indent=2),encoding='utf-8')
 print('ADDITIVE MIGRATION APPLIED: new empty ledger and unique lock index only. Existing records preserved. Backup:',backup);print('No release promoted, credentials changed or mail sent. Restart the previous production supervisor and verify health. Do not drop this ledger or restore an old mail database as routine rollback.')
if __name__=='__main__':
 try:main()
 except (ValueError,OSError,sqlite3.Error,json.JSONDecodeError) as e:print('STOP:',str(e),file=sys.stderr);sys.exit(1)
