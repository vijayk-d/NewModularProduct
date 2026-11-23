import contextlib
import importlib.util
import io
import sqlite3
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('size_report', Path(__file__).resolve().parents[2] / 'tools/maintenance/database_size_report.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class DatabaseSizeReportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        db = sqlite3.connect(self.folder / 'outreach.db')
        db.execute('CREATE TABLE outreach_sent_emails(id TEXT PRIMARY KEY, payload TEXT)')
        db.execute('CREATE TABLE small(id TEXT)')
        db.executemany('INSERT INTO outreach_sent_emails VALUES(?,?)', [(str(i), 'PRIVATE letter text ' * 500) for i in range(20)])
        db.execute("INSERT INTO small VALUES('x')")
        db.commit()
        db.close()
        sqlite3.connect(self.folder / 'empty.db').close()

    def test_reports_sizes_rows_and_stored_payload_largest_first_without_contents(self):
        items = r.report(self.folder)
        self.assertEqual([i['name'] for i in items][0], 'outreach.db')
        tables = items[0]['tables']
        self.assertEqual(tables[0]['table'], 'outreach_sent_emails')
        self.assertEqual(tables[0]['rows'], 20)
        self.assertEqual(tables[0]['storedBytes'], 20 * len('PRIVATE letter text ' * 500))
        self.assertEqual(tables[1], {'table': 'small', 'rows': 1, 'storedBytes': 0})
        text = r.render(items)
        self.assertIn('2 databases', text)
        self.assertIn('outreach_sent_emails', text)
        self.assertNotIn('PRIVATE', text)

    def test_opens_read_only_and_changes_nothing(self):
        before = (self.folder / 'outreach.db').read_bytes()
        r.report(self.folder)
        self.assertEqual((self.folder / 'outreach.db').read_bytes(), before)
        self.assertEqual(sorted(p.name for p in self.folder.iterdir()), ['empty.db', 'outreach.db'])

    def test_missing_folder_is_reported(self):
        with contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertEqual(r.main(['--data', str(self.folder / 'missing')]), 2)
        self.assertIn('not found', err.getvalue())


if __name__ == '__main__':
    unittest.main()
