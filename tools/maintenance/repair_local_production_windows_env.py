"""Correct Windows environment filtering and add dependency-startup preflight.
Repairs existing package only. No application data, Git or production actions.
"""
import argparse,ast,hashlib,json,re,sys
from pathlib import Path
from datetime import datetime,timezone
TARGETS=('tools/deploy/local_delivery.py','tools/deploy/test_local_delivery.py')
BASE_FUNCTION="def base_env():\n    keep = {'PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC',\n            'TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA',\n            'PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432',\n            'COMMONPROGRAMFILES','COMMONPROGRAMFILES(X86)','COMMONPROGRAMW6432',\n            'USERNAME','USERDOMAIN','OS','PROCESSOR_ARCHITECTURE','PROCESSOR_IDENTIFIER',\n            'NUMBER_OF_PROCESSORS','HTTP_PROXY','HTTPS_PROXY','NO_PROXY',\n            'SSL_CERT_FILE','SSL_CERT_DIR','REQUESTS_CA_BUNDLE','NODE_EXTRA_CA_CERTS',\n            'PIP_CERT','NPM_CONFIG_CAFILE','PLAYWRIGHT_BROWSERS_PATH'}\n    return {key:value for key,value in os.environ.items() if key.upper() in keep}\n"
PREFLIGHT='\ndef preflight():\n    executable = node()\n    env = base_env()\n    if os.name == \'nt\':\n        missing = [key for key in (\'SYSTEMROOT\',\'SYSTEMDRIVE\')\n                   if not any(name.upper()==key and value for name,value in env.items())]\n        if missing:\n            fail(\'Required Windows OS environment variables missing: \'+\', \'.join(missing))\n    run([executable,\'-e\',"require(\'node:crypto\').randomBytes(32); console.log(\'NODE_CRYPTO_PREFLIGHT_PASSED\')"],env=env)\n    run([executable,npm_cli(executable),\'--version\'],env=env)\n    run([sys.executable,\'-c\',"import ssl,secrets; secrets.token_bytes(32); print(\'PYTHON_CRYPTO_PREFLIGHT_PASSED\')"],env=env)\n    print(\'PREFLIGHT PASSED: Node crypto, npm startup and Python crypto under the filtered OS environment.\',flush=True)\n\n'
REGRESSIONS="\nclass WindowsEnvironmentPolicyTests(unittest.TestCase):\n def test_uppercase_windows_os_keys_are_preserved_without_provider_tokens(self):\n  values={'SYSTEMROOT':r'C:\\Windows','SYSTEMDRIVE':'C:','PATH':'synthetic-path','COMSPEC':r'C:\\Windows\\System32\\cmd.exe','GMAIL_OAUTH_REFRESH_TOKEN':'synthetic-private','PERPLEXITY_API_KEY':'synthetic-private','NODE_OPTIONS':'--require untrusted.js','NMP_ENV':'development'}\n  with patch.object(d.os,'environ',values):result=d.base_env()\n  for key in ['SYSTEMROOT','SYSTEMDRIVE','PATH','COMSPEC']:self.assertEqual(result[key],values[key])\n  for key in ['GMAIL_OAUTH_REFRESH_TOKEN','PERPLEXITY_API_KEY','NODE_OPTIONS','NMP_ENV']:self.assertNotIn(key,result)\n def test_mixed_case_os_names_are_preserved_case_insensitively(self):\n  values={'SystemRoot':r'C:\\Windows','SystemDrive':'C:','Path':'synthetic-path','ComSpec':r'C:\\Windows\\System32\\cmd.exe','ProgramFiles':r'C:\\Program Files','http_proxy':'http://proxy.invalid','gmail_oauth_refresh_token':'synthetic-private'}\n  with patch.object(d.os,'environ',values):result=d.base_env()\n  for key in ['SystemRoot','SystemDrive','Path','ComSpec','ProgramFiles','http_proxy']:self.assertEqual(result[key],values[key])\n  self.assertNotIn('gmail_oauth_refresh_token',result)\n def test_preflight_exercises_crypto_and_npm_with_filtered_environment_only(self):\n  import contextlib,io\n  values={'SYSTEMROOT':r'C:\\Windows','SYSTEMDRIVE':'C:','PATH':'synthetic-path','GMAIL_OAUTH_REFRESH_TOKEN':'synthetic-private'}\n  with patch.object(d.os,'environ',values),patch.object(d,'node',return_value='synthetic-node'),patch.object(d,'npm_cli',return_value='synthetic-npm-cli.js'),patch.object(d,'run',return_value='probe-ok') as run,contextlib.redirect_stdout(io.StringIO()):d.preflight()\n  self.assertEqual(run.call_count,3)\n  self.assertIn('randomBytes',' '.join(map(str,run.call_args_list[0].args[0])))\n  self.assertIn('--version',run.call_args_list[1].args[0])\n  self.assertIn('secrets',' '.join(map(str,run.call_args_list[2].args[0])))\n  for call in run.call_args_list:\n   env=call.kwargs['env'];self.assertIn('SYSTEMROOT',env);self.assertIn('SYSTEMDRIVE',env);self.assertNotIn('GMAIL_OAUTH_REFRESH_TOKEN',env)\n\n"
def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(b):return b.decode('utf-8-sig').replace('\r\n','\n')
def fingerprint(b):return sha(canonical(b).encode())
def guard(node):return isinstance(node,ast.If) and isinstance(node.test,ast.Compare) and isinstance(node.test.left,ast.Name) and node.test.left.id=='__name__' and any(isinstance(v,ast.Constant) and v.value=='__main__' for v in node.test.comparators)
def replace_function(source,name,replacement):
 tree=ast.parse(source);functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name]
 if len(functions)!=1:raise RuntimeError('Expected one '+name+' function.')
 old=ast.get_source_segment(source,functions[0])
 if source.count(old)!=1:raise RuntimeError('Ambiguous source function.')
 return source.replace(old,replacement.strip('\n'),1)
def transform_controller(source):
 if "if parts[0]=='python-worker'" not in source or '_managed_sqlite_connection' not in source:raise RuntimeError('Existing worker-source and SQLite repairs must be retained first.')
 old=source;source=replace_function(source,'base_env',BASE_FUNCTION)
 tree=ast.parse(source)
 if not any(isinstance(n,ast.FunctionDef) and n.name=='preflight' for n in tree.body):
  guards=[n for n in tree.body if guard(n)]
  if len(guards)!=1:raise RuntimeError('Expected one main entry guard.')
  lines=source.splitlines(keepends=True);pos=sum(len(x) for x in lines[:guards[0].lineno-1]);source=source[:pos]+PREFLIGHT+source[pos:]
  expected="sub.add_parser('health');a=p.parse_args()"
  if source.count(expected)!=1:raise RuntimeError('CLI registration differs from expected package.')
  source=source.replace(expected,"sub.add_parser('health');sub.add_parser('preflight');a=p.parse_args()",1)
  expected=" if a.command=='prepare':prepare()"
  if source.count(expected)!=1:raise RuntimeError('CLI dispatch differs from expected package.')
  source=source.replace(expected," if a.command=='preflight':preflight()\n elif a.command=='prepare':prepare()",1)
 else:
  source=replace_function(source,'preflight',PREFLIGHT)
 # Preflight before dependency installation, without changing verification gates.
 tree=ast.parse(source);functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='verify_candidate']
 if len(functions)!=1:raise RuntimeError('Expected one candidate verification function.')
 f=functions[0]
 if not any(isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='preflight' for n in f.body):
  lines=source.splitlines(keepends=True);index=f.body[0].lineno-1;indent=lines[index][:len(lines[index])-len(lines[index].lstrip())];lines.insert(index,indent+'preflight()\n');source=''.join(lines)
 ast.parse(source);return source,source!=old
def transform_tests(source):
 tree=ast.parse(source)
 if any(isinstance(n,ast.ClassDef) and n.name=='WindowsEnvironmentPolicyTests' for n in tree.body):return source,False
 if 'class SqliteConnectionOwnershipTests' not in source or 'class PythonWorkerReleasePolicyTests' not in source:raise RuntimeError('Prior regression tests must be retained.')
 guards=[n for n in tree.body if guard(n)]
 if len(guards)!=1:raise RuntimeError('Expected one test entry guard.')
 lines=source.splitlines(keepends=True);pos=sum(len(x) for x in lines[:guards[0].lineno-1]);new=source[:pos]+REGRESSIONS+source[pos:];ast.parse(new);return new,True
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--apply',action='store_true');a=p.parse_args();root=a.root.resolve();package=root/'tools/patches/local-production-v1';payloadPath=package/'payload.json';installerPath=package/'install.py';oldPayload=payloadPath.read_bytes();oldInstaller=installerPath.read_bytes();installer=canonical(oldInstaller)
 match=re.search(r"^PAYLOAD_HASH = (['\"])([a-f0-9]{64})\1$",installer,re.M)
 if not match or match[2]!=sha(oldPayload):raise RuntimeError('Package checksum mismatch. Nothing changed.')
 data=json.loads(oldPayload);entries={e['path']:e for e in data['files']};changed=[]
 for name in TARGETS:
  if name not in entries:raise RuntimeError('Package target missing: '+name)
  e=entries[name];old=e['content'];new,updated=transform_controller(old) if name.endswith('/local_delivery.py') else transform_tests(old)
  if not updated:continue
  actual=root/name
  if actual.is_symlink():raise RuntimeError('Symlink tool file refused.')
  if actual.is_file():
   b=actual.read_bytes()
   if canonical(b)==canonical(old.encode()):e['before']=fingerprint(b)
   elif canonical(b)!=canonical(new.encode()):raise RuntimeError('Installed tool differs from package baseline: '+name)
  e['content']=new;changed.append(name)
 if not changed:print('WINDOWS ENVIRONMENT REPAIR ALREADY PRESENT. Nothing changed.');return
 for name in changed:print('Validated environment/preflight correction: '+name)
 if not a.apply:print('REPAIR DRY RUN PASSED. Nothing changed.');return
 newPayload=json.dumps(data,ensure_ascii=False,indent=2).encode();newInstaller=installer[:match.start(2)]+sha(newPayload)+installer[match.end(2):];ast.parse(newInstaller)
 backup=package/'repair-backups'/('windows-environment-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(parents=True,exist_ok=False);(backup/'payload.json').write_bytes(oldPayload);(backup/'install.py').write_bytes(oldInstaller)
 if payloadPath.read_bytes()!=oldPayload or installerPath.read_bytes()!=oldInstaller:raise RuntimeError('Package changed during repair.')
 try:payloadPath.write_bytes(newPayload);installerPath.write_text(newInstaller,encoding='utf-8',newline='\n')
 except BaseException:payloadPath.write_bytes(oldPayload);installerPath.write_bytes(oldInstaller);raise
 print('PACKAGE REPAIR PASSED. OS variable names matched case-insensitively; OS runtime variables preserved; provider credentials still excluded from inheritance.')
 print('Three regression tests and the preflight command added. Prior repairs retained. Backup: '+str(backup))
 print('Run normal install --apply, --check, then local_delivery.py preflight and plan. No Git or runtime data changed by this repair.')
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)
