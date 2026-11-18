"""Release backups: list them, and optionally move or delete the oldest ones. Run by the owner, never by ship.

Every ship copies shared\\data to shared\\backups\\before-<commit>-<time> before promoting a release. Nothing prunes
them, so the disk slowly fills. This command:
  * by default only PREVIEWS: lists backups newest first with sizes, and what --keep N would remove;
  * changes something only with --apply and the confirmation code printed by the preview for the same plan;
  * moves the oldest backups to --move-to <folder>, or deletes them only when --delete is given;
  * always keeps at least the newest 3, and touches only folders named like release backups.

  python tools\\deploy\\release_backups.py --production-root D:\\NewModularProduct-Production --keep 10
  python tools\\deploy\\release_backups.py --production-root D:\\NewModularProduct-Production --keep 10 --move-to E:\\JobApp-Backups --apply --confirm <code>
"""
import argparse, hashlib, os, re, shutil, sys
from pathlib import Path

PATTERN = re.compile(r'^before-[0-9a-f]{7,40}-(\d{8}T\d{6}\d*Z)$')
MIN_KEEP = 3


def folder_size(path):
    total = 0
    for root, _, files in os.walk(path):
        for name in files:
            try: total += (Path(root) / name).stat().st_size
            except OSError: pass
    return total


def human(n):
    return f'{n / 2 ** 30:.2f} GB' if n >= 2 ** 30 else f'{n / 2 ** 20:.1f} MB'


def backups(backup_root):
    found, other = [], []
    for entry in sorted(Path(backup_root).iterdir()) if Path(backup_root).is_dir() else []:
        match = PATTERN.match(entry.name)
        if entry.is_dir() and not entry.is_symlink() and match:
            found.append({'name': entry.name, 'path': entry, 'stamp': match.group(1), 'size': folder_size(entry)})
        else:
            other.append(entry.name)
    found.sort(key=lambda b: b['stamp'], reverse=True)
    return found, other


def plan(found, keep):
    keep = max(MIN_KEEP, int(keep))
    remove = found[keep:]
    code = hashlib.sha256('\n'.join(b['name'] for b in remove).encode()).hexdigest()[:12] if remove else ''
    return keep, remove, code


def main(argv=None, out=print):
    p = argparse.ArgumentParser(description='List release backups and optionally move or delete the oldest (preview first).')
    p.add_argument('--production-root', required=True)
    p.add_argument('--keep', type=int, default=10, help=f'newest backups to keep (at least {MIN_KEEP})')
    p.add_argument('--move-to', help='move removed backups into this folder (must exist, outside the production folder)')
    p.add_argument('--delete', action='store_true', help='delete removed backups permanently instead of moving them')
    p.add_argument('--apply', action='store_true')
    p.add_argument('--confirm', default='')
    a = p.parse_args(argv)
    backup_root = Path(a.production_root) / 'shared' / 'backups'
    if not backup_root.is_dir():
        out(f'No backup folder at {backup_root}. Nothing to do.'); return 0
    found, other = backups(backup_root)
    keep, remove, code = plan(found, a.keep)
    out(f'{len(found)} release backup(s), {human(sum(b["size"] for b in found))} in total, in {backup_root}')
    for i, b in enumerate(found):
        out(f'  {"keep  " if i < keep else "REMOVE"}  {b["name"]}  {human(b["size"])}')
    if other: out('Not release backups, left alone: ' + ', '.join(other))
    if not remove:
        out(f'Nothing to remove when keeping the newest {keep}.'); return 0
    out(f'Keeping the newest {keep} would remove {len(remove)} backup(s), freeing {human(sum(b["size"] for b in remove))}.')
    if not a.apply:
        action = f'--move-to "<folder>"' if not a.delete else '--delete'
        out(f'Preview only; nothing changed. To go ahead, add: {action} --apply --confirm {code}')
        return 0
    if a.confirm != code:
        out('The confirmation code does not match this plan (backups may have changed). Run the preview again. Nothing changed.'); return 2
    if bool(a.move_to) == bool(a.delete):
        out('Choose exactly one of --move-to <folder> or --delete. Nothing changed.'); return 2
    if a.move_to:
        target = Path(a.move_to).resolve()
        prod = Path(a.production_root).resolve()
        if not target.is_dir() or target == prod or prod in target.parents:
            out('--move-to must be an existing folder outside the production folder. Nothing changed.'); return 2
        for b in remove:
            if (target / b['name']).exists():
                out(f'{target / b["name"]} already exists. Nothing changed.'); return 2
    for b in remove:
        if a.move_to:
            shutil.move(str(b['path']), str(Path(a.move_to).resolve() / b['name'])); out(f'Moved   {b["name"]}')
        else:
            shutil.rmtree(b['path']); out(f'Deleted {b["name"]}')
    out(f'Done. {keep} newest backup(s) kept.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
