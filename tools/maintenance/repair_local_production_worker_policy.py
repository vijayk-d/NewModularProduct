"""Correct Python-worker source selection in the existing local-production package.
No Git staging/commit, application worker execution, credential or database access.
"""
import argparse,ast,hashlib,json,re,sys
from pathlib import Path
from datetime import datetime,timezone
TARGETS=('tools/deploy/local_delivery.py','tools/deploy/test_local_delivery.py')
POLICY="if parts[0]=='python-worker':return p.suffix.lower()=='.py'"
REGRESSIONS="\nclass PythonWorkerReleasePolicyTests(unittest.TestCase):\n def test_python_worker_modules_are_release_source(self):\n  for name in ['python-worker/gmail_draft_worker.py','python-worker/gmail_confirmed_draft_worker.py','python-worker/gmail_send_worker.py','python-worker/gmail_mailbox_check.py','python-worker/gmail_signature_reader.py','python-worker/gmail_signature_diagnostics.py']:\n   self.assertTrue(d.safe_source(name),name)\n def test_python_worker_private_and_generated_files_stay_excluded(self):\n  for name in ['python-worker/.env','python-worker/credentials.json','python-worker/token.db','python-worker/__pycache__/worker.pyc','python-worker/worker.py.bak','python-worker/worker.pyc','python-worker/CV.pdf']:\n   self.assertFalse(d.safe_source(name),name)\n def test_snapshot_selection_and_git_archive_include_workers(self):\n  import subprocess\n  with tempfile.TemporaryDirectory() as folder:\n   root=Path(folder)/'repo';root.mkdir()\n   subprocess.run(['git','init','-q',str(root)],check=True)\n   for key,value in [('user.email','fixture@example.test'),('user.name','Fixture'),('commit.gpgsign','false'),('core.hooksPath',str(root/'empty-fixture-hooks'))]:\n    subprocess.run(['git','-C',str(root),'config',key,value],check=True)\n   (root/'python-worker').mkdir();worker=root/'python-worker/gmail_draft_worker.py';worker.write_text('value = 1\\n',encoding='utf-8')\n   subprocess.run(['git','-C',str(root),'add','python-worker/gmail_draft_worker.py'],check=True)\n   subprocess.run(['git','-C',str(root),'commit','-qm','Synthetic worker fixture'],check=True)\n   with patch.object(d,'ROOT',root):\n    self.assertIn('python-worker/gmail_draft_worker.py',d.source_files())\n    target=root/'artifact';target.mkdir();d.extract(d.git('rev-parse','HEAD'),target)\n    self.assertEqual((target/'python-worker/gmail_draft_worker.py').read_bytes(),worker.read_bytes())\n\n"
def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(b):return b.decode('utf-8-sig').replace('\r\n','\n')
def fingerprint(b):return sha(canonical(b).encode())
def guard(node):return isinstance(node,ast.If) and isinstance(node.test,ast.Compare) and isinstance(node.test.left,ast.Name) and node.test.left.id=='__name__' and any(isinstance(v,ast.Constant) and v.value=='__main__' for v in node.test.comparators)
def transform_controller(source):
 tree=ast.parse(source);functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='safe_source']
 if len(functions)!=1:raise RuntimeError('Expected exactly one shared safe_source policy.')
 f=functions[0];segment=ast.get_source_segment(source,f)
 if POLICY in segment:return source,False
 candidates=[]
 for node in f.body:
  if not isinstance(node,ast.If):continue
  t=node.test
  if isinstance(t,ast.Compare) and isinstance(t.left,ast.Subscript) and isinstance(t.left.value,ast.Name) and t.left.value.id=='parts' and isinstance(t.left.slice,ast.Constant) and t.left.slice.value==0 and any(isinstance(c,(ast.List,ast.Tuple)) and {'src','tests'}.issubset({v.value for v in c.elts if isinstance(v,ast.Constant)}) for c in t.comparators):candidates.append(node)
 if len(candidates)!=1:raise RuntimeError('Source policy shape differs from the reviewed package; no change.')
 lines=source.splitlines(keepends=True);line=candidates[0].lineno-1;indent=lines[line][:len(lines[line])-len(lines[line].lstrip())]
 lines.insert(line,indent+POLICY+'\n');result=''.join(lines);ast.parse(result)
 namespace={'PurePosixPath':__import__('pathlib').PurePosixPath}
 ast_function=next(n for n in ast.parse(result).body if isinstance(n,ast.FunctionDef) and n.name=='safe_source')
 exec(compile(ast.Module(body=[ast_function],type_ignores=[]),'<policy-only>','exec'),namespace)
 fn=namespace['safe_source']
 for name in ['python-worker/gmail_draft_worker.py','python-worker/gmail_signature_reader.py']:
  if not fn(name):raise RuntimeError('Worker source policy validation failed.')
 for name in ['python-worker/.env','python-worker/credentials.json','python-worker/outreach.db','python-worker/__pycache__/x.pyc']:
  if fn(name):raise RuntimeError('Private-file exclusion validation failed.')
 return result,True
def transform_tests(source):
 tree=ast.parse(source)
 if any(isinstance(n,ast.ClassDef) and n.name=='PythonWorkerReleasePolicyTests' for n in tree.body):return source,False
 entries=[n for n in tree.body if guard(n)]
 if len(entries)!=1:raise RuntimeError('Expected one test main guard.')
 lines=source.splitlines(keepends=True);pos=sum(len(x) for x in lines[:entries[0].lineno-1]);result=source[:pos]+REGRESSIONS+source[pos:];ast.parse(result);return result,True
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--apply',action='store_true');a=p.parse_args();root=a.root.resolve();package=root/'tools/patches/local-production-v1';payloadPath=package/'payload.json';installerPath=package/'install.py';oldPayload=payloadPath.read_bytes();oldInstaller=installerPath.read_bytes();installer=canonical(oldInstaller)
 match=re.search(r"^PAYLOAD_HASH = (['\"])([a-f0-9]{64})\1$",installer,re.M)
 if not match or match[2]!=sha(oldPayload):raise RuntimeError('Package checksum mismatch. No changes.')
 data=json.loads(oldPayload);entries={e['path']:e for e in data['files']};changed=[]
 for name in TARGETS:
  if name not in entries:raise RuntimeError('Required package target missing: '+name)
  entry=entries[name];old=entry['content']
  if '_managed_sqlite_connection' not in old:raise RuntimeError('SQLite-ownership repair must be retained/applied first.')
  new,updated=(transform_controller(old) if name.endswith('/local_delivery.py') else transform_tests(old))
  if not updated:continue
  actual=root/name
  if actual.is_symlink():raise RuntimeError('Installed tool is a symlink; refusing change.')
  if actual.is_file():
   b=actual.read_bytes()
   if canonical(b)==canonical(old.encode()):entry['before']=fingerprint(b)
   elif canonical(b)!=canonical(new.encode()):raise RuntimeError('Installed tool differs from package baseline: '+name)
  entry['content']=new;changed.append(name)
 if not changed:print('WORKER SOURCE POLICY REPAIR ALREADY PRESENT. No changes.');return
 for name in changed:print('Validated correction: '+name)
 if not a.apply:print('REPAIR DRY RUN PASSED. Nothing changed.');return
 newPayload=json.dumps(data,ensure_ascii=False,indent=2).encode();newInstaller=installer[:match.start(2)]+sha(newPayload)+installer[match.end(2):];ast.parse(newInstaller)
 backup=package/'repair-backups'/('worker-source-policy-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(parents=True,exist_ok=False);(backup/'payload.json').write_bytes(oldPayload);(backup/'install.py').write_bytes(oldInstaller)
 if payloadPath.read_bytes()!=oldPayload or installerPath.read_bytes()!=oldInstaller:raise RuntimeError('Package changed while repairing.')
 try:payloadPath.write_bytes(newPayload);installerPath.write_text(newInstaller,encoding='utf-8',newline='\n')
 except BaseException:payloadPath.write_bytes(oldPayload);installerPath.write_bytes(oldInstaller);raise
 print('PACKAGE REPAIR PASSED. Python worker source is eligible for planning, snapshots and release extraction; private/generated exclusions remain.')
 print('Three regression tests added. SQLite ownership fix retained. Package backup: '+str(backup))
 print('Run normal install.py --apply, --check, then local_delivery.py plan. No source, Git index or runtime data changed by this package repair.')
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)
