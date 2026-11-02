"""Archive only explicitly named legacy outreach utilities. Dry run is default."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import subprocess

LEGACY_NAMES = (
    'patch_gmail_identity_diagnostic.py',
    'fix_gmail_runner_encoding.py',
    'collect_outreach_source.py',
    'outreach_simplification_preparation.zip',
    'outreach-current-source.zip',
)

def tracked(root, name):
    git = shutil.which('git')
    if not git:
        return None
    result = subprocess.run([git, 'ls-files', '--error-unmatch', '--', name],
                            cwd=root, capture_output=True, timeout=15)
    return result.returncode == 0

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--update-ignore', action='store_true',
                        help='With --apply, append /var/maintenance/ to .gitignore if absent.')
    args = parser.parse_args()
    root = args.root.resolve()
    if not (root / 'src').is_dir() or not (root / 'python-worker').is_dir():
        raise RuntimeError('Run from the project root or specify --root.')
    if (root / 'var').is_symlink() or (root / 'var/maintenance').is_symlink():
        raise RuntimeError('Maintenance destination must not be a symlink.')
    pending = []
    for name in LEGACY_NAMES:
        source = root / name
        if source.is_symlink():
            print(f'SKIP symlink: {name}')
        elif source.is_file():
            status = tracked(root, name)
            if status is True:
                print(f'SKIP Git-tracked file (review manually): {name}')
            elif status is None:
                print(f'SKIP file because Git tracking cannot be checked: {name}')
            else:
                pending.append(source)
                print(f'ARCHIVE: {name}')
    print(f'{len(pending)} known legacy file(s) eligible. No wildcard deletion is used.')
    if not args.apply:
        if args.update_ignore:
            print('Would add /var/maintenance/ to .gitignore if absent.')
        print('Dry run only. Re-run with --apply to archive eligible files.')
        return
    ignore = root / '.gitignore'
    if args.update_ignore and ignore.is_symlink():
        raise RuntimeError('Refusing to edit a symlinked .gitignore.')
    old_ignore = ignore.read_bytes() if ignore.exists() else None
    moved = []
    archive = None
    try:
        if pending:
            stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            archive = root / 'var/maintenance/archive' / stamp
            archive.mkdir(parents=True, exist_ok=False)
            for source in pending:
                target = archive / source.name
                shutil.move(str(source), str(target))
                moved.append((source, target))
            (archive / 'RESTORE_MANIFEST.json').write_text(json.dumps({
                'warning': 'Archived scripts may depend on their original root location. Do not run them here.',
                'moves': [{'original': str(a.relative_to(root)),
                           'archived': str(b.relative_to(root))} for a,b in moved]
            }, indent=2), encoding='utf-8')
        if args.update_ignore:
            data = old_ignore or b''
            if b'/var/maintenance/' not in [line.strip() for line in data.splitlines()]:
                newline = b'\r\n' if b'\r\n' in data else b'\n'
                separator = newline if data and not data.endswith((b'\n', b'\r')) else b''
                ignore.write_bytes(data + separator + b'# Local maintenance bundles and archives' + newline
                                   + b'/var/maintenance/' + newline)
                print('Added /var/maintenance/ to .gitignore; existing content preserved.')
        if archive:
            print(f'Archived files in: {archive}')
        print('Done. No files were deleted; application source, data and startup files were not changed.')
    except Exception:
        for source, target in reversed(moved):
            if target.exists() and not source.exists():
                shutil.move(str(target), str(source))
        if args.update_ignore:
            if old_ignore is None:
                if ignore.exists():
                    ignore.unlink()
            else:
                ignore.write_bytes(old_ignore)
        raise

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(f'ERROR: {error}')
