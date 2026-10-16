"""Read-only diagnosis of an exact-match patch/source mismatch. No code, data, Git or environment writes."""
import argparse,hashlib,json,re
from pathlib import Path

def diagnose(root,package,source):
    payload=json.loads((root/package/'payload.json').read_text(encoding='utf-8-sig'))
    if source not in payload.get('ops',{}):raise RuntimeError('Selected source has no operations in this package.')
    target=root/source;raw=target.read_bytes();original=raw.decode('utf-8-sig').replace('\r\n','\n');working=original
    report={'mode':'READ_ONLY','source':source,'sourceSha256':hashlib.sha256(raw).hexdigest(),'operations':[]}
    for index,op in enumerate(payload['ops'][source],1):
        old,new=op['old'],op['new'];expected=op.get('count',1);matches=working.count(old)
        entry={'operation':index,'expectedOldMatches':expected,'actualOldMatches':matches,'oldPatternPreview':old.replace('\n',' ')[:150],'newPatternPresent':bool(new) and new in working}
        report['operations'].append(entry)
        if matches!=expected:
            report['firstFailedOperation']=index
            break
        working=working.replace(old,new)
    else:report['firstFailedOperation']=None
    report['webSearchCheckboxSource']=[m[0][:350] for m in re.finditer(r'<input\b[^>]*name="webSearchEnabled"[^>]*>',original)]
    report['markers']={'clearButton': 'id="clear-saved-form"' in original,'emailDomainRenderCalls':original.count('${renderEmailDomainResolution(reviewId, formData, research)}'),'oldBottomNavigation':'Prepare another application' in original}
    report['sourceUnchanged']=target.read_bytes()==raw
    return report

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--package',default='tools/patches/review-flow-layout-v2');p.add_argument('--source',default='src/interfaces/http/rendering.js');a=p.parse_args();root=a.root.resolve()
    for value in [a.package,a.source]:
        if not (root/value).resolve().is_relative_to(root):raise RuntimeError('Paths must remain inside project.')
    print(json.dumps(diagnose(root,Path(a.package),a.source),indent=2,ensure_ascii=True))
if __name__=='__main__':
    try:main()
    except Exception as e:raise SystemExit('ERROR: '+str(e))
