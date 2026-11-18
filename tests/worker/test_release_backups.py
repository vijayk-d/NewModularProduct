import importlib.util, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('release_backups', ROOT / 'tools' / 'deploy' / 'release_backups.py')
rb = importlib.util.module_from_spec(spec); spec.loader.exec_module(rb)


class ReleaseBackupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.prod = Path(self.tmp.name) / 'prod'
        self.root = self.prod / 'shared' / 'backups'; self.root.mkdir(parents=True)
        for i in range(6):
            d = self.root / f'before-abcdef12345{i}-2026110{i}T100000000000Z'; d.mkdir()
            (d / 'reviews.db').write_bytes(b'x' * (1000 * (i + 1)))
        (self.root / 'manual-copy').mkdir()
        self.lines = []

    def run_cmd(self, *args):
        self.lines = []
        return rb.main(['--production-root', str(self.prod), *args], out=self.lines.append)

    def names(self):
        return sorted(p.name for p in self.root.iterdir())

    def code(self):
        return next(l for l in self.lines if '--confirm' in l).split('--confirm ')[1].strip()

    def test_preview_changes_nothing_and_never_keeps_fewer_than_three(self):
        before = self.names()
        self.assertEqual(self.run_cmd('--keep', '1'), 0)
        self.assertEqual(self.names(), before)
        self.assertTrue(any('Keeping the newest 3 would remove 3' in l for l in self.lines))
        self.assertTrue(any('manual-copy' in l and 'left alone' in l for l in self.lines))
        removed = [l for l in self.lines if l.strip().startswith('REMOVE')]
        self.assertEqual(len(removed), 3)
        self.assertTrue(all('2026110' + d in ' '.join(removed) for d in '012'), 'the oldest are removed')

    def test_apply_needs_the_matching_code_and_moves_to_another_folder(self):
        self.run_cmd('--keep', '4'); code = self.code()
        archive = Path(self.tmp.name) / 'archive'; archive.mkdir()
        self.assertEqual(self.run_cmd('--keep', '4', '--move-to', str(archive), '--apply', '--confirm', 'wrong'), 2)
        self.assertEqual(len(self.names()), 7)
        self.assertEqual(self.run_cmd('--keep', '4', '--move-to', str(archive), '--apply', '--confirm', code), 0)
        self.assertEqual(len([n for n in self.names() if n.startswith('before-')]), 4)
        self.assertEqual(len(list(archive.iterdir())), 2)
        self.assertIn('manual-copy', self.names())

    def test_delete_only_when_asked_and_move_target_must_be_outside_production(self):
        self.run_cmd('--keep', '5', '--delete'); code = self.code()
        self.assertEqual(self.run_cmd('--keep', '5', '--apply', '--confirm', code), 2, 'neither --move-to nor --delete')
        inside = self.prod / 'shared' / 'elsewhere'; inside.mkdir()
        self.assertEqual(self.run_cmd('--keep', '5', '--move-to', str(inside), '--apply', '--confirm', code), 2)
        self.assertEqual(self.run_cmd('--keep', '5', '--delete', '--apply', '--confirm', code), 0)
        self.assertEqual(len([n for n in self.names() if n.startswith('before-')]), 5)

    def test_no_backup_folder_is_fine(self):
        self.assertEqual(rb.main(['--production-root', str(Path(self.tmp.name) / 'none')], out=self.lines.append), 0)
        self.assertIn('Nothing to do', self.lines[0])


if __name__ == '__main__':
    unittest.main()
