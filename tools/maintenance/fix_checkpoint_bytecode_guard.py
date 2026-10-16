"""Fix the exact historical-bytecode checkpoint blocker. Preview by default."""
import argparse,ast
from datetime import datetime,timezone
from pathlib import Path
KNOWN='tests/worker/__pycache__/test_gmail_draft_worker.cpython-312.pyc'
MARKER='# checkpoint-bytecode-holdback-v1'
GUARD="    if private:raise RuntimeError('Tracked private/generated paths require separate review (do not automatically delete): '+', '.join(private))"
TRACKED="    tracked=set(git(root,'ls-files','-z').decode('utf-8').split('\\0'))"

def transform(text):
    exception="    "+MARKER+"\n    private=[p for p in private if p!="+repr(KNOWN)+"]\n"+GUARD
    warning=TRACKED+"\n    if "+repr(KNOWN)+" in tracked:warnings.append('Historical tracked bytecode held back, not removed or staged: "+KNOWN+". Review in the separate cleanup checkpoint.')"
    if MARKER in text:
        if exception not in text or warning not in text:raise RuntimeError('Partial/different fix found; preserving the helper for review.')
        return text
    if text.count(GUARD)!=1 or text.count(TRACKED)!=1:raise RuntimeError('Helper differs from supported v1. No rewrite was performed.')
    result=text.replace(GUARD,exception,1).replace(TRACKED,warning,1)
    ast.parse(result);return result

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--apply',action='store_true');a=p.parse_args()
    root=a.root.resolve();target=root/'tools/maintenance/feature_checkpoint.py'
    if not target.is_file() or target.is_symlink() or not target.resolve().is_relative_to(root):raise RuntimeError('An existing local feature_checkpoint.py is required.')
    old=target.read_bytes();text=old.decode('utf-8-sig').replace('\r\n','\n');new=transform(text)
    if new==text:print('BYTECODE FIX ALREADY INSTALLED. No changes made.');return
    print('Hold back only: '+KNOWN)
    print('Credential/database/other-generated-path blockers remain. No artifact, Git index, HEAD, scope manifest or application data will be changed.')
    if not a.apply:print('DRY RUN PASSED. Use --apply to update the checkpoint helper only.');return
    for part in ['var','var/maintenance','var/maintenance/backups']:
        path=root/part
        if path.is_symlink() or not path.resolve().is_relative_to(root):raise RuntimeError('Unsafe backup destination.')
    ignore=root/'.gitignore'
    if not ignore.is_file() or '/var/maintenance/' not in ignore.read_text(encoding='utf-8-sig').splitlines():raise RuntimeError('Expected ignored /var/maintenance/ backup location is not configured.')
    folder=root/'var/maintenance/backups'/('checkpoint-bytecode-guard-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));folder.mkdir(parents=True,exist_ok=False)
    (folder/'feature_checkpoint.py.before').write_bytes(old)
    data=new.encode('utf-8')
    if b'\r\n' in old:data=data.replace(b'\n',b'\r\n')
    if old.startswith(b'\xef\xbb\xbf'):data=b'\xef\xbb\xbf'+data
    if target.read_bytes()!=old:raise RuntimeError('Helper changed before write. No overwrite performed.')
    try:target.write_bytes(data)
    except Exception:
        target.write_bytes(old);raise
    print('BYTECODE GUARD FIX INSTALLED. Backup: '+str(folder))
    print('Rerun feature_checkpoint.py preview. No restart, Git removal, stage, commit or email action was performed.')

if __name__=='__main__':
    try:main()
    except Exception as e:raise SystemExit('ERROR: '+str(e))
