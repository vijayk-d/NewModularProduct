"""Collect current cover-letter implementation source only; never read .env or user data."""
import argparse, hashlib, json, re, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
sys.dont_write_bytecode = True

FILES = [
 'package.json',
 'src/config/validate-runtime-config.js',
 'src/config/load-runtime-config.js',
 'src/interfaces/http/run-local-server.js',
 'src/interfaces/http/create-local-server.js',
 'src/interfaces/http/rendering.js',
 'src/interfaces/http/workspace-review-v2.js',
 'src/interfaces/http/polishing-cost-controls.js',
 'src/interfaces/http/cover-letter-html.js',
 'src/application/refine-cover-letter.js',
 'src/application/compose-outreach-letter.js',
 'src/application/cover-letter-controls.js',
 'src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js',
 'src/domain/cover-letter/generate-cover-letter.js',
 'src/domain/cover-letter/validate-cover-letter.js',
 'src/domain/shared/linked-role-opening.js',
 'src/domain/shared/legacy-advert-normalization.js',
 'tests/interfaces/http/create-local-server.test.js',
 'tests/ui/review-workspace-v2.spec.js'
]
PATTERNS = [
 'tests/application/*refin*.test.js',
 'tests/application/*outreach-letter*.test.js',
 'tests/domain/**/*cover-letter*.test.js',
 'tests/infrastructure/*refin*.test.js',
 'tests/infrastructure/**/*refin*.test.js'
]
SECRETS = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AIza[0-9A-Za-z_-]{30,}|ya29\.[0-9A-Za-z_-]{30,}|1//[0-9A-Za-z_-]{30,}|(?:ghp_|github_pat_)[0-9A-Za-z_]{30,}|sk-[0-9A-Za-z_-]{32,}')

def require(ok, message):
 if not ok: raise RuntimeError(message)

def git(root, *args):
 result = subprocess.run(['git', *args], cwd=root, capture_output=True, text=True, encoding='utf-8', errors='replace')
 require(result.returncode == 0, 'Git metadata command failed; no report written.')
 return result.stdout.strip()

def main():
 parser = argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--root', type=Path, default=Path.cwd())
 args = parser.parse_args()
 root = args.root.resolve()
 require((root/'package.json').is_file() and not (root/'release.json').exists(), 'Use the development repository, never a production release.')
 paths = set(FILES)
 for pattern in PATTERNS:
  paths.update(p.relative_to(root).as_posix() for p in root.glob(pattern) if p.is_file())
 records = []
 for name in sorted(paths):
  path = root/name
  require(not path.is_symlink() and path.resolve().is_relative_to(root), 'Linked/outside-root source refused: '+name)
  if not path.exists():
   records.append({'path':name, 'missing':True})
   continue
  require(path.is_file(), 'Not a regular source file: '+name)
  require(path.stat().st_size <= 3*1024*1024, 'Unexpectedly large source file: '+name)
  raw = path.read_bytes()
  require(not SECRETS.search(raw), 'Possible credential in '+name+'. Review locally; no source contents printed and no report written.')
  text = raw.decode('utf-8-sig')
  records.append({'path':name, 'sha256':hashlib.sha256(raw).hexdigest(), 'normalisedSha256':hashlib.sha256(text.replace('\r\n','\n').encode('utf-8')).hexdigest(), 'content':text})
 report = {'purpose':'Current development cover-letter quality source; no env files or user documents read', 'createdAt':datetime.now(timezone.utc).isoformat(), 'branch':git(root,'branch','--show-current'), 'head':git(root,'rev-parse','HEAD'), 'files':records, 'privacy':'Excludes .env, credentials, CV/LinkedIn contents, contact data, databases and production. Automated credential scanning is best-effort, not a guarantee; review source before sharing.'}
 folder = root/'var/maintenance/cover-letter-quality'
 require(not folder.is_symlink() and folder.resolve().is_relative_to(root), 'Unsafe report directory.')
 folder.mkdir(parents=True, exist_ok=True)
 stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
 target = folder/('cover-letter-quality-source-'+stamp+'.json')
 with target.open('x',encoding='utf-8',newline='\n') as stream: json.dump(report,stream,ensure_ascii=False,indent=2)
 print('Source report:',target)
 print('Source files captured:',sum(not r.get('missing') for r in records))
 print('No application/configuration file changed. No server, provider, Gmail or deployment action performed.')

if __name__ == '__main__':
 try: main()
 except Exception as error:
  print('ERROR: '+str(error),file=sys.stderr)
  sys.exit(1)
