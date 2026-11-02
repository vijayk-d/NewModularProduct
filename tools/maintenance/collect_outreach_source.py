"""Collect source without modifying the application. Run from project root."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

SKIP = {'node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'build', '.next', 'coverage', 'backups', 'output'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    root = parser.parse_args().root.resolve()
    if not (root / 'src').is_dir() or not (root / 'python-worker').is_dir():
        raise RuntimeError('Run from project root, or supply --root.')
    files = set()
    for folder in ('src', 'python-worker', 'test', 'tests'):
        for p in (root / folder).rglob('*'):
            rel = p.relative_to(root)
            if any(part.lower() in SKIP for part in rel.parts):
                continue
            if p.is_symlink() or not p.is_file() or p.suffix.lower() not in {'.js','.mjs','.cjs','.ts','.tsx','.py'}:
                continue
            if not p.resolve().is_relative_to(root):
                continue
            if any(word in p.name.lower() for word in ('credential', 'client_secret', 'token_cache')):
                continue
            files.add(p)
    package = root / 'package.json'
    if package.is_file() and not package.is_symlink():
        files.add(package)
    contents = {}
    for p in sorted(files):
        data = p.read_bytes()
        if len(data) > 2*1024*1024:
            raise RuntimeError(f'Source file too large: {p.relative_to(root)}')
        contents[p.relative_to(root).as_posix()] = data
    if sum(map(len, contents.values())) > 30*1024*1024:
        raise RuntimeError('Source exceeds 30 MiB; no bundle written.')
    directory = root / 'var/maintenance/bundles'
    if (root/'var').is_symlink() or (root/'var/maintenance').is_symlink() or directory.is_symlink():
        raise RuntimeError('Bundle destination must not be a symlink.')
    directory.mkdir(parents=True, exist_ok=True)
    dest = directory / 'outreach-current-source.zip'
    if dest.exists():
        raise RuntimeError('Bundle already exists; rename it before collecting again.')
    manifest = {'files': [{'path': k, 'bytes': len(v), 'sha256': hashlib.sha256(v).hexdigest()} for k,v in contents.items()],
                'warning': 'Review source for hard-coded secrets and private test data before upload.'}
    try:
        with zipfile.ZipFile(dest, 'x', zipfile.ZIP_DEFLATED) as z:
            for name, data in contents.items():
                z.writestr(name, data)
            z.writestr('SOURCE_MANIFEST.json', json.dumps(manifest, indent=2))
    except Exception:
        if dest.exists():
            dest.unlink()
        raise
    print(f'Collected {len(contents)} source files into: {dest}')
    print('Review for secrets before sharing. No application code/data or Gmail records changed.')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(f'ERROR: {error}')
