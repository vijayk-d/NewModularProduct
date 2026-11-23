"""Read-only size report for the app's SQLite databases.

For each .db file in a data folder: file size, space a compaction (VACUUM) could reclaim, and per table the
row count and the stored payload size, largest first. Opens every database read-only (mode=ro) and reads
counts and lengths only, never row contents, so the output is safe to paste into a support chat.

Usage: python tools/maintenance/database_size_report.py --data <folder>
"""
import argparse
import sqlite3
import sys
from pathlib import Path

MB = 1024 * 1024


def table_report(db, table):
    columns = [r[1] for r in db.execute(f'PRAGMA table_info("{table}")')]
    rows = db.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
    text_columns = [c for c in columns if c in ('payload', 'value', 'body', 'data', 'json')]
    stored = 0
    for c in text_columns:
        stored += db.execute(f'SELECT COALESCE(SUM(LENGTH("{c}")),0) FROM "{table}"').fetchone()[0] or 0
    return {'table': table, 'rows': rows, 'storedBytes': stored}


def database_report(path):
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    try:
        page_size = db.execute('PRAGMA page_size').fetchone()[0]
        free = db.execute('PRAGMA freelist_count').fetchone()[0] * page_size
        tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        details = sorted((table_report(db, t) for t in tables), key=lambda t: (-t['storedBytes'], -t['rows'], t['table']))
    finally:
        db.close()
    return {'name': Path(path).name, 'bytes': Path(path).stat().st_size, 'reclaimableBytes': free, 'tables': details}


def report(folder):
    files = sorted(Path(folder).glob('*.db'), key=lambda p: -p.stat().st_size)
    result = []
    for f in files:
        try:
            result.append(database_report(f))
        except sqlite3.Error as e:
            result.append({'name': f.name, 'bytes': f.stat().st_size, 'error': type(e).__name__})
    return result


def render(items):
    lines = []
    total = sum(i['bytes'] for i in items)
    lines.append(f'{len(items)} databases, {total / MB:.1f} MB in total (largest first)')
    for i in items:
        if 'error' in i:
            lines.append(f"\n{i['name']}: {i['bytes'] / MB:.1f} MB (could not be read: {i['error']})")
            continue
        lines.append(f"\n{i['name']}: {i['bytes'] / MB:.1f} MB, {i['reclaimableBytes'] / MB:.1f} MB reclaimable by compaction")
        for t in i['tables']:
            stored = f", {t['storedBytes'] / MB:.1f} MB stored" if t['storedBytes'] else ''
            lines.append(f"  {t['table']:<45} {t['rows']:>8} rows{stored}")
    return '\n'.join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Read-only size report for the app databases.')
    parser.add_argument('--data', required=True, help='Folder that holds the .db files, for example the production shared\\data folder.')
    args = parser.parse_args(argv)
    if not Path(args.data).is_dir():
        print('Data folder not found: ' + args.data, file=sys.stderr)
        return 2
    print(render(report(args.data)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
