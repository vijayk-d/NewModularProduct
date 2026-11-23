"""Gmail read access for the Reply assistant: check which permissions the app's Gmail token has, and add read-only access.

  check --env FILE      Read-only. Lists the permissions (scopes) the GMAIL_OAUTH_REFRESH_TOKEN in FILE has. Prints no secrets.
  authorise --env FILE  One-time, owner-run. Opens Google sign-in for the configured sender, asking for read-only access
                        on top of the permissions the token already has (so drafting and sending keep working). Checks the
                        signed-in mailbox is GMAIL_FROM_ADDRESS, backs FILE up, then replaces only GMAIL_OAUTH_REFRESH_TOKEN.
                        Restart the app afterwards. Nothing is sent and no token is printed.
"""
import argparse
import base64
import hashlib
import hmac
import http.server
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
TOKEN_URL = 'https://oauth2.googleapis.com/token'
TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo'
PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile'
READONLY = 'https://www.googleapis.com/auth/gmail.readonly'
COMPOSE = 'https://www.googleapis.com/auth/gmail.compose'
KEYS = ('GMAIL_OAUTH_CLIENT_ID', 'GMAIL_OAUTH_CLIENT_SECRET', 'GMAIL_OAUTH_REFRESH_TOKEN', 'GMAIL_FROM_ADDRESS')


class SetupError(RuntimeError):
    pass


def require(ok, message):
    if not ok:
        raise SetupError(message)


def read_env(path):
    values = {}
    for line in Path(path).read_text(encoding='utf-8-sig').splitlines():
        m = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$', line)
        if not m:
            continue
        v = m[2].strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in '\'"':
            v = v[1:-1]
        values[m[1]] = v
    return values


def replace_token(raw, token):
    """Returns the env file bytes with only GMAIL_OAUTH_REFRESH_TOKEN replaced; keeps BOM, line endings and every other line."""
    require(isinstance(token, str) and token and not re.search(r"[\r\n\x00'\"]", token) and len(token) <= 4096, 'Google returned an unusable token. Nothing saved.')
    bom = raw.startswith(b'\xef\xbb\xbf')
    crlf = b'\r\n' in raw
    lines = raw.decode('utf-8-sig').replace('\r\n', '\n').split('\n')
    hits = [i for i, line in enumerate(lines) if re.match(r'^\s*(?:export\s+)?GMAIL_OAUTH_REFRESH_TOKEN\s*=', line)]
    require(len(hits) == 1, 'The configuration must contain exactly one GMAIL_OAUTH_REFRESH_TOKEN line. Nothing saved.')
    lines[hits[0]] = "GMAIL_OAUTH_REFRESH_TOKEN='" + token + "'"
    out = '\n'.join(lines).encode('utf-8')
    if crlf:
        out = out.replace(b'\n', b'\r\n')
    return (b'\xef\xbb\xbf' if bom else b'') + out


def scopes_to_request(current):
    return sorted(set(current) | {READONLY, COMPOSE})


def google_json(url, body=None, access_token=None, stage='Google'):
    data = urllib.parse.urlencode(body).encode('ascii') if body is not None else None
    headers = {'Accept': 'application/json'}
    if data is not None:
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    if access_token:
        headers['Authorization'] = 'Bearer ' + access_token
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=30) as response:
            return json.loads(response.read(1024 * 1024).decode('utf-8'))
    except urllib.error.HTTPError as error:
        try:
            value = json.loads(error.read(8192).decode('utf-8'))
            name = value.get('error')
            name = name.get('status', '') if isinstance(name, dict) else name
        except Exception:
            name = ''
        raise SetupError(f'{stage} failed (HTTP {error.code}{", " + re.sub(r"[^A-Za-z0-9_ ]", "", str(name))[:60] if name else ""}). No token was logged.') from None
    except SetupError:
        raise
    except Exception as error:
        raise SetupError(f'{stage} could not reach Google ({type(error).__name__}). No token was logged.') from None


def current_scopes(env):
    require(all(env.get(k, '').strip() for k in KEYS), 'Gmail OAuth settings are missing from this file: ' + ', '.join(k for k in KEYS if not env.get(k, '').strip()))
    tokens = google_json(TOKEN_URL, {'grant_type': 'refresh_token', 'refresh_token': env['GMAIL_OAUTH_REFRESH_TOKEN'], 'client_id': env['GMAIL_OAUTH_CLIENT_ID'], 'client_secret': env['GMAIL_OAUTH_CLIENT_SECRET']}, stage='Token refresh')
    info = google_json(TOKENINFO_URL + '?' + urllib.parse.urlencode({'access_token': tokens.get('access_token', '')}), stage='Token check')
    return sorted(str(info.get('scope', '')).split())


def check(env_file):
    scopes = current_scopes(read_env(env_file))
    print('Permissions granted to the app\'s Gmail token:')
    for s in scopes:
        print('  ' + s)
    has = READONLY in scopes or 'https://mail.google.com/' in scopes or 'https://www.googleapis.com/auth/gmail.modify' in scopes
    print('Read access for the Reply assistant: ' + ('YES - nothing to do.' if has else 'NO - run: python tools/maintenance/gmail_read_access.py authorise --env "' + str(env_file) + '"'))
    return 0


def pkce():
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).decode().rstrip('=')
    return verifier, base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')


def authorization_url(client_id, account, redirect, state, challenge, scopes):
    return AUTH_URL + '?' + urllib.parse.urlencode({'client_id': client_id, 'redirect_uri': redirect, 'response_type': 'code', 'scope': ' '.join(scopes), 'state': state,
        'code_challenge': challenge, 'code_challenge_method': 'S256', 'access_type': 'offline', 'prompt': 'consent', 'include_granted_scopes': 'true', 'login_hint': account})


def callback_handler(expected_state, box):
    class Callback(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            state = query.get('state', [''])[0]
            if not hmac.compare_digest(state, expected_state):
                self.send_response(400); self.end_headers(); self.wfile.write(b'Invalid response. Return to the setup tool.'); return
            if 'error' in query:
                box['error'] = 'Google sign-in was declined or blocked.'
            elif query.get('code', [''])[0]:
                box['code'] = query['code'][0]
            else:
                box['error'] = 'Google returned no authorisation code.'
            self.send_response(200); self.send_header('Content-Type', 'text/plain; charset=utf-8'); self.end_headers()
            self.wfile.write(b'Done. Close this tab and return to the setup tool. No email was sent.')
    return Callback


def authorise(env_file):
    path = Path(env_file)
    raw = path.read_bytes()
    env = read_env(path)
    try:
        existing = current_scopes(env)
    except SetupError:
        existing = [COMPOSE]
    scopes = scopes_to_request(existing)
    verifier, challenge = pkce()
    state, box = secrets.token_urlsafe(32), {}
    with http.server.HTTPServer(('127.0.0.1', 0), callback_handler(state, box)) as server:
        server.timeout = 1
        redirect = 'http://127.0.0.1:' + str(server.server_port) + '/'
        print('Opening Google sign-in. Sign in as ' + env['GMAIL_FROM_ADDRESS'] + ' and allow read-only Gmail access.')
        require(webbrowser.open(authorization_url(env['GMAIL_OAUTH_CLIENT_ID'], env['GMAIL_FROM_ADDRESS'], redirect, state, challenge, scopes), new=1), 'Could not open the browser. Nothing changed.')
        deadline = time.monotonic() + 300
        while not box and time.monotonic() < deadline:
            server.handle_request()
    require(bool(box), 'Sign-in timed out. Nothing changed.')
    require(not box.get('error'), box.get('error', 'Sign-in failed.') + ' Nothing changed.')
    tokens = google_json(TOKEN_URL, {'grant_type': 'authorization_code', 'code': box['code'], 'code_verifier': verifier, 'client_id': env['GMAIL_OAUTH_CLIENT_ID'],
                                     'client_secret': env['GMAIL_OAUTH_CLIENT_SECRET'], 'redirect_uri': redirect}, stage='Token exchange')
    granted = set(str(tokens.get('scope', '')).split())
    require(READONLY in granted, 'Read-only Gmail access was not granted (tick it on the Google screen). Nothing changed.')
    require(set(existing) <= granted, 'Google did not keep all existing permissions. Nothing changed, so drafting and sending keep working.')
    profile = google_json(PROFILE_URL, access_token=tokens.get('access_token', ''), stage='Mailbox check')
    require(str(profile.get('emailAddress', '')).lower() == env['GMAIL_FROM_ADDRESS'].lower(), 'You signed in with a different mailbox from GMAIL_FROM_ADDRESS. Nothing changed.')
    updated = replace_token(raw, tokens.get('refresh_token', ''))
    require(path.read_bytes() == raw, 'The configuration file changed during sign-in. Nothing overwritten.')
    backup = path.with_name(path.name + '.before-gmail-read-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.write_bytes(raw)
    tmp = path.with_name(path.name + '.' + secrets.token_hex(8) + '.tmp')
    tmp.write_bytes(updated)
    os.replace(tmp, path)
    print('Read-only Gmail access added. Backup of the previous file: ' + str(backup))
    print('Restart the app (development or production) so it uses the new token.')
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description='Gmail read access for the Reply assistant.')
    parser.add_argument('action', choices=['check', 'authorise'])
    parser.add_argument('--env', required=True, help='The app configuration file that holds the Gmail OAuth settings.')
    args = parser.parse_args(argv)
    if not Path(args.env).is_file():
        print('Configuration file not found: ' + args.env, file=sys.stderr)
        return 2
    try:
        return check(args.env) if args.action == 'check' else authorise(args.env)
    except SetupError as error:
        print('ERROR: ' + str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
