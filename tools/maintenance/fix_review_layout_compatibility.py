"""Compatibility correction for diagnosed review-flow-layout-v2 operation 5. Preview first; package files only."""
import argparse,ast,hashlib,json,re
from pathlib import Path
from datetime import datetime,timezone
EXPECTED_SOURCE_SHA='7c38d79dff9d74380488d0e48a4379f3678d3f4c536a02e12850f0cfd94f73c9'
OBSERVED='<input type="checkbox" name="webSearchEnabled" value="true"${allowWithoutOrganisationResearch?\' disabled\':\'\'}>'
ORIGINAL='<input type="checkbox" name="webSearchEnabled" value="true">'
def sha(b):return hashlib.sha256(b).hexdigest()
def safe(root,name):
 p=root/name
 if not p.resolve().is_relative_to(root):raise RuntimeError('Path escapes project.')
 q=p
 while q!=root:
  if q.is_symlink():raise RuntimeError('Refusing symlink: '+name)
  q=q.parent
 return p

def prepare(payload_raw,installer_raw,render_raw,server_raw):
 if sha(render_raw)!=EXPECTED_SOURCE_SHA:raise RuntimeError('Renderer changed since the diagnostic. Rerun diagnose_patch_source.py; no guessed patch.')
 payload=json.loads(payload_raw.decode('utf-8-sig'));installer=installer_raw.decode('utf-8-sig');match=re.search(r"CHECKSUM='([a-f0-9]{64})'",installer)
 if not match or match[1]!=sha(payload_raw) or "ID='review-flow-layout-v2'" not in installer:raise RuntimeError('Package identity/checksum differs; preserve it for review.')
 operations=payload.get('ops',{}).get('src/interfaces/http/rendering.js',[])
 if len(operations)<5:raise RuntimeError('Expected rendering operation 5 missing.')
 target=operations[4]
 if target.get('old') not in [ORIGINAL,OBSERVED] or not target.get('new','').startswith('<input type="checkbox" name="webSearchEnabled" value="true"') or 'checked' not in target['new']:raise RuntimeError('Unexpected checkbox operation; no rewrite.')
 if render_raw.decode('utf-8-sig').count(OBSERVED)!=1:raise RuntimeError('Observed checkbox no longer matches uniquely.')
 changed=[]
 if target['old']!=OBSERVED:target['old']=OBSERVED;changed.append('Retarget renderer operation 5 to the diagnosed conditional checkbox.')
 server=server_raw.decode('utf-8-sig').replace('\r\n','\n');pattern=r"webSearchEnabled:(\s*)(?:usesCandidateValues\(review\.formData\)|review\.formData\.jobImportId&&!review\.formData\.organisationName)\?false:"
 matches=list(re.finditer(pattern,server))
 if len(matches) not in [0,2]:raise RuntimeError('Unexpected forced-off backend shape (found '+str(len(matches))+'). No partial policy guess.')
 target_ops=payload['ops'].get('src/interfaces/http/create-local-server.js')
 if not isinstance(target_ops,list):raise RuntimeError('Expected server operation list missing.')
 for m in matches:
  old=m[0];new='webSearchEnabled:'+m[1]
  if server.count(old)!=1:raise RuntimeError('Backend policy not uniquely addressable; need a targeted diagnostic.')
  existing=[p for p in target_ops if p.get('old')==old]
  if existing:
   if len(existing)!=1 or existing[0].get('new')!=new:raise RuntimeError('Conflicting backend package operation.')
  else:target_ops.append({'old':old,'new':new});changed.append('Honor explicit checkbox choice in one backend estimate/request path.')
 if not changed:return payload_raw,installer_raw,[]
 data=(json.dumps(payload,ensure_ascii=True,indent=2)+'\n').encode('utf-8');updated=installer[:match.start(1)]+sha(data)+installer[match.end(1):];ast.parse(updated)
 encoded=updated.encode('utf-8')
 if installer_raw.startswith(b'\xef\xbb\xbf'):encoded=b'\xef\xbb\xbf'+encoded
 return data,encoded,changed

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--apply',action='store_true');a=p.parse_args();root=a.root.resolve()
 names=['tools/patches/review-flow-layout-v2/payload.json','tools/patches/review-flow-layout-v2/install.py','src/interfaces/http/rendering.js','src/interfaces/http/create-local-server.js'];paths=[safe(root,n) for n in names];old=[p.read_bytes() for p in paths]
 payload,installer,changes=prepare(*old)
 if not changes:print('LAYOUT PACKAGE COMPATIBILITY ALREADY UPDATED.');return
 for change in changes:print('PROPOSED '+change)
 print('Only package payload.json and install.py checksum will change. No application source, data, .env, Git or provider action.')
 if not a.apply:print('DRY RUN PASSED. Nothing changed.');return
 folder=safe(root,'var/maintenance/backups/review-layout-checkbox-compat-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));folder.mkdir(parents=True,exist_ok=False)
 for path,original in zip(paths[:2],old[:2]):(folder/path.name).write_bytes(original)
 if any(p.read_bytes()!=b for p,b in zip(paths,old)):raise RuntimeError('Source/package changed during preparation; no overwrite.')
 written=[]
 try:
  for p,original,data in zip(paths[:2],old[:2],[payload,installer]):written.append((p,original,data));p.write_bytes(data)
 except Exception:
  for p,original,data in reversed(written):
   if p.read_bytes()==data:p.write_bytes(original)
  raise
 print('LAYOUT PACKAGE COMPATIBILITY UPDATED. Run the original installer preview again.');print('Backup: '+str(folder))
if __name__=='__main__':
 try:main()
 except Exception as e:raise SystemExit('ERROR: '+str(e))
