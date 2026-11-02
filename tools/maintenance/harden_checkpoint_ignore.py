"""Minimally harden checkpoint .gitignore rules. Dry run by default; no Git writes."""
import argparse
from datetime import datetime,timezone
from pathlib import Path
import sys


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--ignore-patch-packages',action='store_true',help='Optionally keep tools/patches local/untracked; does not delete its contents.')
    args=parser.parse_args();root=args.root.resolve();target=root/'.gitignore'
    if not target.is_file() or target.is_symlink():
        raise RuntimeError('An existing non-symlink project .gitignore is required. Use --root if needed.')
    original=target.read_bytes();text=original.decode('utf-8-sig').replace('\r\n','\n')
    changes=[]
    broken='.patch-backups/# Local secrets and generated artifacts'
    if broken in text.splitlines():
        text=text.replace(broken,'.patch-backups/\n# Local secrets and generated artifacts')
        changes.append('Separate the joined backup pattern/comment.')
    quoted='"t research and cover letter refinement"'
    if quoted in text.splitlines():
        text='\n'.join('/t research and cover letter refinement' if line==quoted else line for line in text.split('\n'))
        changes.append('Replace literal shell-style quotes with a root-anchored filename pattern.')
    existing=set(text.splitlines());missing=[rule for rule in ('__pycache__/','*.py[cod]') if rule not in existing]
    if args.ignore_patch_packages and '/tools/patches/' not in existing:
        missing.append('/tools/patches/')
    if missing:
        text+=('' if text.endswith('\n') else '\n')+'\n# Checkpoint hygiene: generated files and optional local packages\n'+'\n'.join(missing)+'\n'
        changes.extend('Add '+rule for rule in missing)
    data=text.encode('utf-8')
    if b'\r\n' in original:data=data.replace(b'\n',b'\r\n')
    if original.startswith(b'\xef\xbb\xbf'):data=b'\xef\xbb\xbf'+data
    if data==original:
        print('Ignore rules already match. No changes made.');return
    for change in changes:print(change)
    print('All other patterns are preserved, including .env, runtime data, databases, templates and reports.')
    print('No file deletion, Git index change, commit, environment edit or server/Gmail call is performed.')
    if not args.apply:
        print('DRY RUN PASSED. Use --apply to update .gitignore.');return
    folder=root/'var/maintenance/backups'/('checkpoint-ignore-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    if any(p.is_symlink() for p in (root/'var',root/'var/maintenance',root/'var/maintenance/backups')):
        raise RuntimeError('Backup destination must not be a symlink.')
    folder.mkdir(parents=True,exist_ok=False);backup=folder/'.gitignore.before';backup.write_bytes(original)
    try:target.write_bytes(data)
    except Exception:
        target.write_bytes(original);raise
    print('IGNORE UPDATE PASSED. Backup: '+str(backup))
    print('No restart required. Ignore rules do not untrack already-tracked files or hide/delete Explorer files.')


if __name__=='__main__':
    try:main()
    except Exception as error:raise SystemExit('ERROR: '+str(error))
