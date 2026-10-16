"""Repair SQLite connection ownership in the local-production-v1 package.
Package/source guards remain enabled. No Git, live database or production actions.
"""
import argparse,ast,hashlib,json,re,sys
from pathlib import Path
from datetime import datetime,timezone
TARGETS=('tools/deploy/local_delivery.py','tools/deploy/test_local_delivery.py')
HELPER='\n@contextlib.contextmanager\ndef _managed_sqlite_connection(*args, **kwargs):\n    connection = sqlite3.connect(*args, **kwargs)\n    try:\n        with connection:\n            yield connection\n    finally:\n        connection.close()\n\n'
REGRESSIONS="\nclass SqliteConnectionOwnershipTests(unittest.TestCase):\n def test_retained_connection_is_closed_and_success_is_committed(self):\n  with tempfile.TemporaryDirectory() as folder:\n   path=Path(folder)/'owned.db'\n   with _managed_sqlite_connection(path) as connection:\n    connection.execute('CREATE TABLE evidence(value TEXT)')\n    connection.execute('INSERT INTO evidence VALUES(?)',('committed',))\n   with self.assertRaises(sqlite3.ProgrammingError):connection.execute('SELECT 1')\n   with _managed_sqlite_connection(path) as check:\n    self.assertEqual(check.execute('SELECT value FROM evidence').fetchone()[0],'committed')\n   path.unlink()\n   self.assertFalse(path.exists())\n def test_exception_rolls_back_and_still_closes(self):\n  with tempfile.TemporaryDirectory() as folder:\n   path=Path(folder)/'owned.db'\n   with _managed_sqlite_connection(path) as setup:setup.execute('CREATE TABLE evidence(value TEXT)')\n   with self.assertRaisesRegex(RuntimeError,'synthetic'):\n    with _managed_sqlite_connection(path) as connection:\n     connection.execute('INSERT INTO evidence VALUES(?)',('must roll back',))\n     raise RuntimeError('synthetic')\n   with self.assertRaises(sqlite3.ProgrammingError):connection.execute('SELECT 1')\n   with _managed_sqlite_connection(path) as check:self.assertEqual(check.execute('SELECT COUNT(*) FROM evidence').fetchone()[0],0)\n   path.unlink()\n def test_snapshot_and_schema_connections_close_without_garbage_collection(self):\n  opened=[]\n  real_connect=sqlite3.connect\n  class TrackedConnection(sqlite3.Connection):\n   explicitly_closed=False\n   def close(self):\n    self.explicitly_closed=True\n    return super().close()\n  def tracked_connect(*args,**kwargs):\n   kwargs['factory']=TrackedConnection\n   connection=real_connect(*args,**kwargs);opened.append(connection);return connection\n  with tempfile.TemporaryDirectory() as folder:\n   source=Path(folder)/'source';source.mkdir();target=Path(folder)/'backup'\n   with _managed_sqlite_connection(source/'outreach.db') as setup:setup.execute('CREATE TABLE evidence(value TEXT)')\n   with patch.object(sqlite3,'connect',side_effect=tracked_connect):d.snapshot(source,target);d.schemas(target)\n   self.assertGreaterEqual(len(opened),3)\n   self.assertTrue(all(connection.explicitly_closed for connection in opened))\n   (source/'outreach.db').unlink();(target/'outreach.db').unlink()\n\n"
def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(b):return b.decode('utf-8-sig').replace('\r\n','\n')
def fingerprint(b):return sha(canonical(b).encode())
def main_guard(node):
 return isinstance(node,ast.If) and isinstance(node.test,ast.Compare) and isinstance(node.test.left,ast.Name) and node.test.left.id=='__name__' and any(isinstance(c,ast.Constant) and c.value=='__main__' for c in node.test.comparators)
def transform(source,is_test=False):
 tree=ast.parse(source)
 if any(isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name=='_managed_sqlite_connection' for n in ast.walk(tree)):
  if HELPER.strip() not in source or (is_test and 'class SqliteConnectionOwnershipTests' not in source):raise RuntimeError('Partial/unrecognised SQLite repair; refusing to guess.')
  if source.count('sqlite3.connect(')!=1:raise RuntimeError('Unmanaged connection calls remain; refusing partial repair.')
  return source,0
 imports={a.name for n in tree.body if isinstance(n,ast.Import) for a in n.names}
 if not {'sqlite3','contextlib'}<=imports:raise RuntimeError('Expected sqlite3/contextlib imports are absent.')
 calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and isinstance(n.func.value,ast.Name) and n.func.value.id=='sqlite3' and n.func.attr=='connect']
 contexts={id(item.context_expr) for n in ast.walk(tree) if isinstance(n,ast.With) for item in n.items}
 if not calls or any(id(n) not in contexts for n in calls):raise RuntimeError('Unexpected SQLite connection shape; no package changes.')
 if source.count('sqlite3.connect(')!=len(calls):raise RuntimeError('Connection syntax differs from the reviewed package.')
 guards=[n for n in tree.body if main_guard(n)]
 if len(guards)!=1:raise RuntimeError('Expected one main entry guard.')
 lines=source.splitlines(keepends=True);insert=sum(len(x) for x in lines[:guards[0].lineno-1])
 # Insert helper after transforming original calls, so its real connect call is not recursive.
 before=source[:insert].replace('sqlite3.connect(','_managed_sqlite_connection(')
 after=source[insert:].replace('sqlite3.connect(','_managed_sqlite_connection(')
 result=before+HELPER+(REGRESSIONS if is_test else '')+after
 ast.parse(result)
 return result,len(calls)
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--apply',action='store_true');a=p.parse_args();root=a.root.resolve();package=root/'tools/patches/local-production-v1';payload_path=package/'payload.json';installer_path=package/'install.py'
 old_payload=payload_path.read_bytes();old_installer=installer_path.read_bytes();installer=canonical(old_installer)
 match=re.search(r"^PAYLOAD_HASH = (['\"])([0-9a-f]{64})\1$",installer,re.M)
 if not match or match[2]!=sha(old_payload):raise RuntimeError('Existing package checksum mismatch. No changes.')
 data=json.loads(old_payload);entries={e['path']:e for e in data['files']};changes=[]
 for name in TARGETS:
  if name not in entries:raise RuntimeError('Expected package target missing: '+name)
  e=entries[name];old=e['content'];new,count=transform(old,name.endswith('test_local_delivery.py'))
  if not count:continue
  actual=root/name
  if actual.is_symlink():raise RuntimeError('Refusing a symlink tool file.')
  if actual.is_file():
   b=actual.read_bytes()
   if canonical(b)==canonical(old.encode()):e['before']=fingerprint(b)
   elif canonical(b)!=canonical(new.encode()):raise RuntimeError('Installed tool differs from package baseline: '+name)
  e['content']=new;changes.append((name,count))
 if not changes:print('SQLITE OWNERSHIP REPAIR ALREADY PRESENT. No changes.');return
 for name,count in changes:print('Verified managed-connection correction: '+name+' ('+str(count)+' call sites)')
 if not a.apply:print('REPAIR DRY RUN PASSED. Nothing changed.');return
 new_payload=json.dumps(data,ensure_ascii=False,indent=2).encode();new_installer=installer[:match.start(2)]+sha(new_payload)+installer[match.end(2):];ast.parse(new_installer)
 backup=package/'repair-backups'/('sqlite-ownership-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(parents=True,exist_ok=False);(backup/'payload.json').write_bytes(old_payload);(backup/'install.py').write_bytes(old_installer)
 if payload_path.read_bytes()!=old_payload or installer_path.read_bytes()!=old_installer:raise RuntimeError('Package changed during repair.')
 try:
  payload_path.write_bytes(new_payload);installer_path.write_text(new_installer,encoding='utf-8',newline='\n')
 except BaseException:
  payload_path.write_bytes(old_payload);installer_path.write_bytes(old_installer);raise
 print('PACKAGE REPAIR PASSED. Transaction handling preserved; explicit close added. Three ownership regression tests added.')
 print('Package backup: '+str(backup))
 print('Application source has not been changed by this repair. Run the normal installer --apply and --check next.')
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)
