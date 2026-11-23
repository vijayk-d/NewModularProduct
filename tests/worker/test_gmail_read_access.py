import importlib.util
import tempfile
import unittest
import urllib.parse
from pathlib import Path

spec = importlib.util.spec_from_file_location('gmail_read_access', Path(__file__).resolve().parents[2] / 'tools/maintenance/gmail_read_access.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)


class GmailReadAccessTests(unittest.TestCase):
    def test_only_the_refresh_token_line_changes_and_formatting_is_kept(self):
        raw = b'\xef\xbb\xbfENABLE_GMAIL=true\r\nGMAIL_OAUTH_REFRESH_TOKEN=\'old-token\'\r\n# comment\r\nOTHER="x"\r\n'
        out = g.replace_token(raw, 'new-token')
        self.assertTrue(out.startswith(b'\xef\xbb\xbf'))
        self.assertEqual(out, b'\xef\xbb\xbfENABLE_GMAIL=true\r\nGMAIL_OAUTH_REFRESH_TOKEN=\'new-token\'\r\n# comment\r\nOTHER="x"\r\n')

    def test_refuses_missing_or_duplicate_token_lines_and_unsafe_tokens(self):
        for raw in [b'OTHER=1\n', b'GMAIL_OAUTH_REFRESH_TOKEN=a\nGMAIL_OAUTH_REFRESH_TOKEN=b\n']:
            with self.assertRaises(g.SetupError):
                g.replace_token(raw, 'new')
        for token in ['', "bad'quote", 'line\nbreak']:
            with self.assertRaises(g.SetupError):
                g.replace_token(b'GMAIL_OAUTH_REFRESH_TOKEN=a\n', token)

    def test_requested_permissions_keep_existing_ones_and_add_read_only(self):
        existing = ['https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.settings.basic']
        self.assertEqual(g.scopes_to_request(existing), sorted(existing + [g.READONLY]))
        url = urllib.parse.urlparse(g.authorization_url('client', 'me@example.test', 'http://127.0.0.1:5000/', 'state', 'challenge', g.scopes_to_request(existing)))
        q = urllib.parse.parse_qs(url.query)
        self.assertEqual(q['include_granted_scopes'], ['true'])
        self.assertEqual(q['login_hint'], ['me@example.test'])
        self.assertEqual(q['access_type'], ['offline'])
        self.assertIn(g.READONLY, q['scope'][0].split())

    def test_reads_env_values_with_quotes(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / '.env'
            p.write_text("GMAIL_FROM_ADDRESS='me@example.test'\nexport GMAIL_OAUTH_CLIENT_ID=\"cid\"\n# x=1\n", encoding='utf-8')
            self.assertEqual(g.read_env(p), {'GMAIL_FROM_ADDRESS': 'me@example.test', 'GMAIL_OAUTH_CLIENT_ID': 'cid'})
            self.assertEqual(g.main(['check', '--env', str(Path(d) / 'missing.env')]), 2)


if __name__ == '__main__':
    unittest.main()
