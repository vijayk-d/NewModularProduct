"""Build a guarded quality v1.2 prompt-contract upgrade; do not modify installed source."""
import argparse,ast,copy,hashlib,json,os,re,shutil,subprocess,sys,tempfile
from pathlib import Path,PurePosixPath
sys.dont_write_bytecode=True
PROMPT='src/application/senior-cover-letter-instructions.js'
DOCUMENT='docs/cover-letter-quality-implementation-v1.md'
EXPECTED_PROMPT_HASH='f2762210e8457988fcb41e9950a9456a6c17ebb6de344a59640bd4f8dfb9abea'
CONTRACTS=[
 ('Missing SMART details stay missing','Missing SMART details stay missing: never invent measurements, methods, causation, dates or targets.'),
 ('Never assign a summary-level claim','Never assign a summary-level claim to a named employer unless the supplied source explicitly associates that claim with that employer.'),
 ('Keep metrics with their source role or project','Keep metrics with their source role or project. Never move a LexisNexis achievement to Jasper Digital or another employer.'),
 ('Do not guess which engagement is current','Overlapping dates are not proof of an error. Do not guess which engagement is current or reorder employment to resolve ambiguity. Omit uncertain attribution and report the specific evidence gap.'),
 ('Write every response field in English','Write every response field in English, including warnings, suggested research explanations and all commentary. Preserve valid currency symbols and names.')
]
KEEP_ENV=set('PATH PATHEXT SYSTEMROOT SYSTEMDRIVE WINDIR COMSPEC TEMP TMP USERPROFILE HOME APPDATA LOCALAPPDATA PROGRAMFILES PROGRAMFILES(X86) PROGRAMW6432 COMMONPROGRAMFILES COMMONPROGRAMFILES(X86) COMMONPROGRAMW6432 USERNAME USERDOMAIN OS PROCESSOR_ARCHITECTURE PROCESSOR_IDENTIFIER NUMBER_OF_PROCESSORS HTTP_PROXY HTTPS_PROXY NO_PROXY SSL_CERT_FILE SSL_CERT_DIR REQUESTS_CA_BUNDLE NODE_EXTRA_CA_CERTS PIP_CERT NPM_CONFIG_CAFILE PLAYWRIGHT_BROWSERS_PATH'.split())

def require(ok,message):
 if not ok:raise RuntimeError(message)
def sha(data):return hashlib.sha256(data).hexdigest()
def normal(raw):return raw.decode('utf-8-sig').replace('\r\n','\n')
def read_json(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def json_bytes(value):return (json.dumps(value,ensure_ascii=True,indent=2)+'\n').encode('utf-8')
def safe_file(root,name):
 p=PurePosixPath(name)
 require(not p.is_absolute() and '..' not in p.parts and '\\' not in name,'Unsafe package source path.')
 target=root/name
 require(target.resolve().is_relative_to(root),'Outside-root path refused.')
 current=root
 for part in p.parts:
  current=current/part;require(not current.is_symlink(),'Symlink path refused: '+name)
 return target

def runtime_text(node,path):
 code='const m=await import('+json.dumps(path.resolve().as_uri())+');if(typeof m.SENIOR_COVER_LETTER_INSTRUCTIONS!=="string")process.exit(2);process.stdout.write(JSON.stringify(m.SENIOR_COVER_LETTER_INSTRUCTIONS));'
 env={k:v for k,v in os.environ.items() if k.upper() in KEEP_ENV}
 r=subprocess.run([node,'--input-type=module','-e',code],env=env,capture_output=True,text=True,encoding='utf-8',errors='strict',timeout=20)
 require(r.returncode==0,'Instruction-module import failed. No installed source was changed.')
 value=json.loads(r.stdout);require(isinstance(value,str),'Instruction module did not export a string.');return value

def restore_contract(source,original):
 additions=[sentence for marker,sentence in CONTRACTS if marker not in original]
 require(bool(additions),'All compatibility rules already exist. Inspect provider wiring instead; no blind rewrite.')
 joins=list(re.finditer(r"\.join\(\s*(['\"]) \1\s*\)",source))
 require(len(joins)==1,'Unrecognised instruction module structure. No installed source changed.')
 match=joins[0]
 updated=source[:match.start()]+'.concat('+json.dumps(additions,ensure_ascii=True)+").join(' ')"+source[match.end():]
 return updated,additions

def build(root,expected_prompt_hash=EXPECTED_PROMPT_HASH):
 root=root.resolve();require((root/'package.json').is_file() and not (root/'release.json').exists(),'Use the development repository, never production.')
 old=root/'tools/patches/cover-letter-quality-v1-1';new=root/'tools/patches/cover-letter-quality-v1-2'
 require(not new.exists(),'v1.2 package already exists. Keep it; do not overwrite or rebuild blindly.')
 require(old.resolve().is_relative_to(root) and not old.is_symlink(),'Unsafe original package directory.')
 for name in ['manifest.json','installation-plan.json','install.py']:
  require((old/name).is_file() and not (old/name).is_symlink(),'Original v1.1 package/cache file missing or linked: '+name)
 raw_manifest=(old/'manifest.json').read_bytes();manifest=read_json(old/'manifest.json');cached=read_json(old/'installation-plan.json')
 require(cached.get('packageHash')==sha(raw_manifest) and cached.get('sourceRoot')==str(root),'Original package/cache identity mismatch. Do not bypass it.')
 fixed={f['path']:f for f in manifest['files']};installed={f['path']:f for f in cached['files']}
 require(len(fixed)==len(manifest['files']) and len(installed)==len(cached['files']),'Duplicate package records.')
 require(set(installed)==set(fixed)|{'tests/config/runtime-config.test.js'},'Unexpected cached installation scope.')
 for name,f in fixed.items():
  require(sha(f['content'].encode('utf-8'))==f['after'],'Original manifest source hash failed: '+name)
  require(installed[name]['after']==f['after'] and installed[name]['content']==f['content'],'Manifest/cache source differs: '+name)
 for name,f in installed.items():
  require(sha(f['content'].encode('utf-8'))==f['after'],'Cached source hash failed: '+name)
  path=safe_file(root,name)
  require(path.is_file() and sha(normal(path.read_bytes()).encode('utf-8'))==f['after'],'Installed source differs from verified v1.1: '+name)
 prompt_path=safe_file(root,PROMPT)
 require(sha(prompt_path.read_bytes())==expected_prompt_hash,'Prompt differs from the reviewed v1.1 fingerprint. Stop; do not loosen the guard.')
 require(PROMPT in fixed and DOCUMENT in fixed,'Prompt/document records missing.')
 node=shutil.which('node');require(bool(node),'Existing Node.js runtime required.')
 original=runtime_text(node,prompt_path)
 source=normal(prompt_path.read_bytes());updated,additions=restore_contract(source,original)
 with tempfile.TemporaryDirectory(prefix='quality-prompt-probe-') as tmp:
  probe=Path(tmp)/'instructions.mjs';probe.write_text(updated,encoding='utf-8')
  actual=runtime_text(node,probe)
  require(actual==original+' '+' '.join(additions),'Original writing rules were altered instead of preserved.')
  require(all(marker in actual for marker,_ in CONTRACTS),'Restored runtime contract check failed.')
 new_manifest=copy.deepcopy(manifest);new_manifest.update(package='cover-letter-quality-v1-2',packageRevision='1.2')
 note='\n\n## v1.2 release-gate prompt compatibility\n\nRestores explicit summary-level employer attribution, source-role/project metric attribution, English-only warnings, current-engagement uncertainty and missing-SMART-detail contracts in the actual provider system-instruction module. Existing writing-quality rules remain unchanged. No test is weakened. The verifier now runs all discovered Node test files in batches of 30 before browser checks. The first full checkpoint batch previously reported 288 passes, one attribution-contract failure and one skip; later batches had not run. A fresh reviewed checkpoint plan is required after this upgrade.\n'
 changes={PROMPT:updated,DOCUMENT:fixed[DOCUMENT]['content'].rstrip()+note}
 for f in new_manifest['files']:
  if f['path'] in changes:
   f['before']=fixed[f['path']]['after'];f['content']=changes[f['path']];f['after']=sha(f['content'].encode('utf-8'));f.pop('acceptedBefore',None)
 tests=[]
 for file in sorted((root/'tests').rglob('*.test.js')):
  name=file.relative_to(root).as_posix();safe_file(root,name);require(file.is_file(),'Missing test source.');tests.append(name)
 require('tests/application/letter-presentation-quality.test.js' in tests,'Attribution regression test not found.')
 new_manifest['unitTests']=tests
 install=normal((old/'install.py').read_bytes())
 storage='var/maintenance/cover-letter-quality-v1-1'
 require(install.count(storage)==1,'Original verifier maintenance-path structure differs; no guessed replacement.')
 install=install.replace(storage,'var/maintenance/cover-letter-quality-v1-2',1)
 pattern=r"commands\.append\(\[node,\s*(['\"])--test\1,\s*\*tests\]\)"
 require(len(list(re.finditer(pattern,install)))==1,'Original verifier test-command structure differs.')
 install=re.sub(pattern,"commands.extend([[node,'--test',*tests[start:start+30]] for start in range(0,len(tests),30)])",install,count=1)
 report_marker='report.mkdir(parents=True,exist_ok=False)'
 require(install.count(report_marker)==1,'Original verification-report structure differs.')
 install=install.replace(report_marker,report_marker+";env.update(NMP_STATE_DIRECTORY=str(report/'node-state'),DATA_DIRECTORY=str(report/'node-state'))",1)
 ast.parse(install)
 new_raw=json_bytes(new_manifest)
 new_cache=copy.deepcopy(cached);new_cache.update(package='cover-letter-quality-v1-2',packageRevision='1.2',packageHash=sha(new_raw),unitTests=tests)
 replacements={f['path']:f for f in new_manifest['files']}
 new_cache['files']=[copy.deepcopy(replacements.get(f['path'],f)) for f in cached['files']]
 for f in new_cache['files']:require(sha(f['content'].encode('utf-8'))==f['after'],'Generated package checksum failed.')
 readme='Quality v1.2 is a prompt-contract compatibility upgrade. Installed source remains unchanged until --apply.\n\nStop development on 3000; leave production running.\n\npython tools/patches/cover-letter-quality-v1-2/install.py --root .\npython tools/patches/cover-letter-quality-v1-2/install.py --root . --apply --verify\npython tools/patches/cover-letter-quality-v1-2/install.py --root . --browser\n\nCheck each exit code before continuing. Expect two source files pending when upgrading an unchanged v1.1 installation. All Node tests run in batches of 30; tests and feature flags are not edited. Do not reuse the old checkpoint plan after source changes.\n\nRollback, with development stopped:\npython tools/patches/cover-letter-quality-v1-2/install.py --root . --rollback\n\nNo .env, launcher, data, production, Git staging or deployment actions are performed by this builder. The existing verifier uses isolated disabled-integration test environments. Real output quality still requires review.\n'
 staging=Path(tempfile.mkdtemp(prefix='.quality-v1-2-building-',dir=old.parent))
 try:
  (staging/'install.py').write_text(install,encoding='utf-8',newline='\n')
  (staging/'manifest.json').write_bytes(new_raw)
  (staging/'installation-plan.json').write_bytes(json_bytes(new_cache))
  (staging/'README.md').write_text(readme,encoding='utf-8')
  (staging/'compatibility-report.json').write_bytes(json_bytes({'expectedV1_1PromptHash':expected_prompt_hash,'originalManifestHash':sha(raw_manifest),'newManifestHash':sha(new_raw),'restoredRules':additions,'allNodeTestFiles':len(tests),'sourceFilesChangedByBuilder':0,'testsWeakened':False}))
  require(not new.exists(),'Destination appeared concurrently; original retained.')
  staging.rename(new)
 finally:
  if staging.exists():shutil.rmtree(staging)
 print('Original v1.1 package/cache and installed source hashes verified.')
 print('Actual exported system-instruction string checked; existing rules preserved.')
 print('Restored compatibility rules: '+str(len(additions)))
 print('All Node test files selected for batched verification: '+str(len(tests)))
 print('V1.2 PACKAGE BUILT: '+str(new))
 print('Installed source, original packages, tests, .env, data and production were not modified.')
 return new

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());a=p.parse_args();build(a.root)
if __name__=='__main__':
 if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(errors='replace')
 try:main()
 except Exception as error:print('ERROR: '+str(error),file=sys.stderr);sys.exit(1)
