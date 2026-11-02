"""Build quality v1.1 from the installed v1 package, restoring its tested SMART prompt contract.
Does not edit application source, .env, data, tests or the original package.
"""
import argparse,ast,hashlib,json,os,shutil,subprocess,sys,tempfile
from pathlib import Path,PurePosixPath
sys.dont_write_bytecode=True
OLD='cover-letter-quality-v1'
NEW='cover-letter-quality-v1-1'
PROMPT='src/application/senior-cover-letter-instructions.js'
DOC='docs/cover-letter-quality-implementation-v1.md'
CONFIG_TEST='tests/config/runtime-config.test.js'
CONTRACT='Missing SMART details stay missing'
RULE='Use SMART details only where documented:'
PREFIX='export const SENIOR_COVER_LETTER_INSTRUCTIONS='
SUFFIX=".join(' ');\n"

def require(ok,message):
 if not ok:raise RuntimeError(message)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def encode(doc):return (json.dumps(doc,ensure_ascii=True,indent=2)+'\n').encode('utf-8')
def safe_name(name):
 p=PurePosixPath(name)
 return not p.is_absolute() and '..' not in p.parts and '\\' not in name and bool(p.parts) and p.parts[0] in ['src','tests','docs']
def load(path):return json.loads(path.read_text(encoding='utf-8-sig'))

def build(root,apply=False):
 root=root.resolve();require((root/'package.json').is_file() and not (root/'release.json').exists(),'Use the development root, not production.')
 old=root/'tools/patches'/OLD;new=root/'tools/patches'/NEW
 require(old.is_dir() and not old.is_symlink() and old.resolve().is_relative_to(root),'Original development package missing or unsafe.')
 require(not new.exists(),'The v1.1 folder already exists. Do not overwrite it; use its installer or inspect it.')
 for name in ['manifest.json','installation-plan.json','install.py','README.md']:
  p=old/name;require(p.is_file() and not p.is_symlink(),'Missing/unsafe original package file: '+name)
 raw=(old/'manifest.json').read_bytes();manifest=json.loads(raw.decode('utf-8-sig'));plan=load(old/'installation-plan.json')
 require(manifest.get('package')==OLD and manifest.get('version')==1,'Unexpected original package identity.')
 require(plan.get('packageHash')==sha(raw),'Original cached plan/package checksum mismatch. Stop; no output written.')
 require(plan.get('sourceRoot')==str(root),'Original cached plan belongs to another source root.')
 originals=manifest.get('files',[]);cached=plan.get('files',[])
 require(len(originals)==20 and len(cached)==21,'Unexpected original package scope.')
 indexed={f['path']:f for f in originals};cache={f['path']:f for f in cached}
 require(len(indexed)==20 and len(cache)==21 and set(cache)==set(indexed)|{CONFIG_TEST},'Duplicate or unexpected original targets.')
 require(PROMPT in indexed and DOC in indexed,'Prompt/document record missing.')
 for f in [*originals,*cached]:
  require(safe_name(f['path']),'Unsafe package target.')
  require(sha(f['content'].encode('utf-8'))==f['after'],'Original content checksum failed: '+f['path'])
 for name,f in indexed.items():
  require(all(cache[name].get(k)==f.get(k) for k in ['before','after','content']),'Original plan differs from manifest: '+name)
 # Reconstruct and verify the original dynamic config-test edit, not merely its resulting hash.
 config=cache[CONFIG_TEST];before=config['content']
 for oldtext,newtext in [("'119', '451', 'not-a-number'","'119', '501', 'not-a-number'"),('120 to 450.','120 to 500.')]:
  require(before.count(newtext)==1 and before.count(oldtext)==0,'Unexpected cached config-test transformation.')
  before=before.replace(newtext,oldtext,1)
 require(sha(before.encode('utf-8'))==config['before'],'Original config-test provenance mismatch.')
 module=indexed[PROMPT]['content']
 require(module.startswith(PREFIX) and module.endswith(SUFFIX),'Unexpected prompt-module structure.')
 rules=json.loads(module[len(PREFIX):-len(SUFFIX)])
 require(isinstance(rules,list) and all(isinstance(x,str) for x in rules),'Unexpected instruction array.')
 require(sum(RULE in x for x in rules)==1 and not any(CONTRACT in x for x in rules),'Unexpected SMART instruction structure; no output written.')
 rules=[x.replace(RULE,CONTRACT+'. '+RULE,1) if RULE in x else x for x in rules]
 updated=PREFIX+json.dumps(rules,ensure_ascii=False,indent=2)+SUFFIX
 require(CONTRACT in ' '.join(rules),'SMART prompt contract was not restored.')
 # Preserve source guards while permitting precisely the known v1 prompt/document versions.
 newmanifest=json.loads(json.dumps(manifest));newmanifest['package']='cover-letter-quality-v1.1'
 for f in newmanifest['files']:
  oldhash=f['after']
  if f['path']==PROMPT:f['content']=updated
  elif f['path']==DOC:
   f['content']=f['content'].replace('tools/patches/'+OLD+'/','tools/patches/'+NEW+'/').replace('var/maintenance/'+OLD,'var/maintenance/'+NEW)
   f['content']+='\n## v1.1 prompt-contract correction\n\nRestores the exact tested rule Missing SMART details stay missing. The existing Slice 1 regression assertion is unchanged. The reported v1 local run passed 183 of 184 tests; the full v1.1 suite must be rerun locally.\n'
  if f['path'] in [PROMPT,DOC]:
   f['after']=sha(f['content'].encode('utf-8'));f['acceptedBefore']=[oldhash]
 manifestbytes=encode(newmanifest)
 newplan={**newmanifest,'sourceRoot':str(root),'packageHash':sha(manifestbytes),'files':[*newmanifest['files'],config]}
 script=(old/'install.py').read_text(encoding='utf-8-sig').replace('\r\n','\n')
 needle="sha(norm(raw).encode('utf-8'))==f['before']"
 replacement="sha(norm(raw).encode('utf-8')) in [f['before'],*f.get('acceptedBefore',[])]"
 require(script.count(needle)==1 and 'acceptedBefore' not in script,'Unexpected original installer baseline guard.')
 script=script.replace(needle,replacement,1)
 oldbase="base=root/'var/maintenance/"+OLD+"'"
 newbase="base=root/'var/maintenance/"+NEW+"'"
 require(script.count(oldbase)==1,'Unexpected original backup-directory structure.')
 script=script.replace(oldbase,newbase,1);ast.parse(script)
 readme=(old/'README.md').read_text(encoding='utf-8-sig').replace(OLD,NEW)
 readme+='\n\nV1.1 correction: restores the stable Missing SMART details stay missing prompt contract, without changing or skipping the existing achievement regression test. The original v1 package and backups are retained. This package accepts either the original captured baseline or the exact known v1 prompt/document hashes; it does not accept arbitrary source drift. Run dry run, apply/Node verification, then browser verification.\n'
 report={'package':'cover-letter-quality-v1.1','correction':'Restore existing exact SMART instruction contract','previousLocalResult':{'passed':183,'failed':1},'fullV11LocalVerification':'pending','testRemovedOrWeakened':False,'originalPackageModified':False,'applicationSourceModifiedByBuilder':False}
 output={'manifest.json':manifestbytes,'installation-plan.json':encode(newplan),'install.py':script.encode('utf-8'),'README.md':readme.encode('utf-8'),'validation-report.json':encode(report)}
 print('Original package and cached source hashes verified.')
 print('SMART contract restored in the actual system-instruction module.')
 print('Source guards retained; exact known v1 prompt/document hashes added as accepted upgrade baselines.')
 if not apply:
  print('BUILD DRY RUN PASSED. No files changed. Re-run with --build to create the separate v1.1 package.');return output
 staging=Path(tempfile.mkdtemp(prefix='.quality-v1-1-build-',dir=old.parent))
 try:
  for name,data in output.items():(staging/name).write_bytes(data)
  node=shutil.which('node')
  if node:
   probe=staging/'prompt-syntax-check.mjs';probe.write_text(updated,encoding='utf-8')
   checked=subprocess.run([node,'--check',str(probe)],capture_output=True,text=True)
   require(checked.returncode==0,'New prompt module syntax check failed; no package promoted.')
   probe.unlink()
  require(not new.exists(),'Destination appeared concurrently; refusing overwrite.')
  staging.rename(new)
 finally:
  if staging.exists():shutil.rmtree(staging)
 print('V1.1 PACKAGE BUILT: '+str(new))
 print('Original package, application source, .env, tests, data and production were not modified.')
 return output

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--build',action='store_true');a=p.parse_args();build(a.root,a.build)

if __name__=='__main__':
 if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(errors='replace')
 try:main()
 except Exception as error:print('ERROR: '+str(error),file=sys.stderr);sys.exit(1)
