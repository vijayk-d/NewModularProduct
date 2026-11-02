"""Write a timestamped text source bundle without executing application code."""
import argparse
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    root=parser.parse_args().root.resolve()
    if not (root/'src').is_dir() or not (root/'python-worker').is_dir():raise RuntimeError('Invalid project root.')
    files=set();skip={'.git','node_modules','.venv','venv','__pycache__','dist','build','.next','coverage','backups'}
    for folder in ('src','python-worker','test','tests'):
        for p in (root/folder).rglob('*'):
            if any(v.lower() in skip for v in p.relative_to(root).parts):continue
            if p.is_symlink() or not p.is_file() or not p.resolve().is_relative_to(root):continue
            if p.suffix.lower() not in {'.js','.mjs','.cjs','.ts','.tsx','.py','.css'}:continue
            if any(v in p.name.lower() for v in ('credential','client_secret','token_cache')):continue
            files.add(p)
    if (root/'package.json').is_file():files.add(root/'package.json')
    rows=[];total=0
    for p in sorted(files):
        data=p.read_bytes();total+=len(data)
        if len(data)>2*1024*1024 or total>30*1024*1024:raise RuntimeError('Source size limit exceeded; no output written.')
        rows.append((p.relative_to(root).as_posix(),data.decode('utf-8-sig'),hashlib.sha256(data).hexdigest()))
    folder=root/'var/maintenance/bundles'
    if any(p.is_symlink() for p in (root/'var',root/'var/maintenance',folder)):raise RuntimeError('Output must not be a symlink.')
    folder.mkdir(parents=True,exist_ok=True)
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');out=folder/f'outreach-current-source-{stamp}.txt'
    with out.open('x',encoding='utf-8',newline='\n') as f:
        f.write('OUTREACH CURRENT SOURCE BUNDLE\n')
        for name,text,digest in rows:f.write(f'========== BEGIN FILE: {name} ==========\n{text}\n========== END FILE: {name} ==========\n\n')
        f.write('SOURCE HASHES\n'+json.dumps({n:h for n,_,h in rows},indent=2))
    print(out);print('Review for hard-coded secrets and private data before uploading. No Gmail calls or source changes.')
if __name__=='__main__':
    try:main()
    except Exception as e:raise SystemExit(f'ERROR: {e}')
