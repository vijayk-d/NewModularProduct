"""Permit the exact CV catalogue in the existing source policy; install recovery docs/tests. No Git writes or push."""
import argparse,ast,hashlib,json,os,re,sys
from pathlib import Path,PurePosixPath,PureWindowsPath
BASELINE='c5f202a472b728fe55cfaeac7da1d77d012af5ee'
MARKER=" if name=='config/cv-library.json':return True\n"
ANCHOR=" if name in ['package.json','package-lock.json','.gitignore','.gitattributes','playwright.config.js','playwright.contacts.config.js','start-local-server.bat']:return True"
PAYLOAD={'docs/cv-library-recovery.md': '# CV library: maintained source and recovery\n\nThe maintained implementation is the installed repository source, not a ZIP in Downloads.\n\n## Commit scope\n- config/cv-library.json (relative paths and metadata; no absolute legacy_source_path)\n- src/infrastructure/cv-inventory/cv-library-v1.js\n- src/interfaces/http/cv-library-v1.js\n- src/interfaces/http/cv-library-v1.html\n- src/interfaces/http/cv-library-v1.browser.js\n- src/interfaces/http/run-local-server.js (development integration)\n- src/interfaces/http/rendering.js (front-page link, if applied)\n- tests/cv-library-v1.test.js\n- tools/deploy/local_delivery.py (exact catalogue allowlist)\n- tools/maintenance/preserve-cv-library.py\n- tests/worker/test_cv_library_source_policy.py\n- docs/cv-library-recovery.md\n\nReview these actual working-copy files before committing; do not replace them with old remote files. The recovery note and policy test are installed by the persistence helper. Transport ZIPs, old installation backups and generated test reports are not required to run a fresh clone.\n\n## Routine workflow\n1. Test the changed source and inspect one real CV locally.\n2. In GitHub Desktop, select NewModularProduct and review Changes on the CURRENT working branch. Do not switch a dirty working tree merely to match an example branch.\n3. Select the intended source/catalogue/tests/documentation. Keep credentials, source CV documents, databases and extracted text out of the commit. Do not discard unrelated changes.\n4. Commit with a meaningful message, such as "Maintain CV library, navigation and recovery documentation".\n5. Push origin. A local commit alone does not protect against laptop loss. If GitHub requests fetch/conflict resolution, resolve and review it; never force-push or reset to bypass it.\n6. Verify the commit and config/cv-library.json on GitHub in the branch you actually pushed. Record the commit identifier.\n\ncommit-changes.bat uses root_workflow.py and local_delivery.safe_source(). The persistence patch explicitly permits ONLY config/cv-library.json in the new top-level config folder. The root commit launcher still does NOT push. It may select other eligible changes; inspect its complete scope if using it instead of Desktop. The old feature_checkpoint.py has a historical hash-bound audit scope; do not reuse that frozen scope as if it automatically covered these new files.\n\nThe library editor changes a tracked working-tree file. Future catalogue edits must also be committed and pushed after review; there is no automatic Git commit/push from the browser.\n\n## What stays private\n- .env and OAuth/API credentials\n- Original PDF/DOCX documents under CV_FOLDER\n- output/cv-library-v1/index.json and catalogue backups\n- Runtime databases, imported contacts and application history\n- .patch-backups/, local logs and generated captures\n\nKeep separate secured off-device backups for secrets, CV originals and non-rebuildable application data. The absolute CV_FOLDER belongs in private environment configuration. Use consistent database backups rather than assuming a live SQLite file copy captures all state. An index can be rebuilt from originals; lost application history cannot be recreated from the catalogue.\n\n## Fresh-machine recovery\n1. Clone the remote branch/commit containing the maintained implementation. Installing old transport patches should not be necessary.\n2. Restore the supported Node.js 24+ / Python toolchain and project dependencies following the repository\'s existing setup and lock files. Node dependencies can be restored with npm ci; confirm all document-worker dependencies are available too.\n3. Restore private environment configuration from secured backup. Set machine-specific CV_FOLDER and reconnect the original CV documents. Do not put credentials into tracked files.\n4. Restore any required development/application database state from consistent private backups. Do not reseed or overwrite production stores.\n5. Confirm config/cv-library.json exists. Preserve the deliberate distinction between the maintained catalogue and the currently active CV_INVENTORY_PATH: this increment did not activate it for ranking automatically.\n6. Start development using start-local-server.bat. Open /cv-library, Validate, Inspect a real document, then Reindex all to rebuild missing private caches.\n7. Run feature tests and a smoke check. A small feature unit suite is not a full application or Windows end-to-end certification.\n\n## Tests\nnode --test tests/cv-library-v1.test.js\npy -B -m unittest discover -s tests/worker -p test_cv_library_source_policy.py\n\nThe catalogue is now eligible for the existing source-selection/packaging function. Eligibility does not activate features or promote a release. Development-only gates stay in place; production promotion remains a separate reviewed workflow.\n', 'tests/worker/test_cv_library_source_policy.py': "import ast\nimport re\nimport unittest\nfrom pathlib import Path, PurePosixPath\nROOT=Path(__file__).resolve().parents[2]\n\ndef policy():\n    tree=ast.parse((ROOT/'tools/deploy/local_delivery.py').read_text(encoding='utf-8-sig'))\n    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='safe_source')\n    namespace={'PurePosixPath':PurePosixPath,'re':re}\n    exec(compile(ast.Module(body=[node],type_ignores=[]),'<safe_source>','exec'),namespace)\n    return namespace['safe_source']\n\nclass CvLibrarySourcePolicyTests(unittest.TestCase):\n    def test_exact_catalogue_is_included(self):\n        self.assertTrue(policy()('config/cv-library.json'))\n    def test_config_folder_is_not_generally_opened(self):\n        for name in ['config/other.json','config/cv-library.json.bak','config/production.env','config/private.pdf']:\n            with self.subTest(name=name):self.assertFalse(policy()(name))\n    def test_private_and_generated_paths_stay_excluded(self):\n        for name in ['.env','data/cv-library.json','output/cv-library-v1/index.json','output/application.db','var/maintenance/report.json','config/../cv-library.json']:\n            with self.subTest(name=name):self.assertFalse(policy()(name))\n    def test_source_tests_and_documentation_remain_included(self):\n        for name in ['src/interfaces/http/cv-library-v1.js','tests/cv-library-v1.test.js','docs/cv-library-recovery.md','tools/maintenance/preserve-cv-library.py']:\n            with self.subTest(name=name):self.assertTrue(policy()(name))\nif __name__=='__main__':unittest.main()\n"}
def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(('blob '+str(len(b))+'\0').encode()+b).hexdigest()
def plan(raw,expected=None):
    expected=expected or BASELINE;text=raw.decode('utf-8').replace('\r\n','\n')
    if MARKER in text:
        if blob(text.replace(MARKER,'',1).encode())!=expected:raise RuntimeError('Installed policy has other changes. No automatic override.')
        return raw,True
    if blob(text.encode())!=expected or text.count(ANCHOR)!=1:raise RuntimeError('Source-policy baseline differs. Stop; do not force the patch.')
    updated=text.replace(ANCHOR,MARKER+ANCHOR)
    tree=ast.parse(updated);node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='safe_source')
    ns={'PurePosixPath':PurePosixPath,'re':re};exec(compile(ast.Module(body=[node],type_ignores=[]),'<policy>','exec'),ns)
    fn=ns['safe_source']
    if not fn('config/cv-library.json') or any(fn(n) for n in ['config/other.json','.env','output/index.json','data/private.json','config/cv-library.json.bak']):raise RuntimeError('Source-policy safety checks failed.')
    return updated.replace('\n','\r\n').encode() if b'\r\n' in raw else updated.encode(),False

def no_link(p):
    if p.is_symlink():raise RuntimeError('Symbolic-link managed paths refused.')
def atomic(p,b):
    temp=p.with_name(p.name+'.cv-persistence.tmp')
    try:
        with temp.open('xb') as f:f.write(b);f.flush();os.fsync(f.fileno())
        os.replace(temp,p)
    finally:
        if temp.exists():temp.unlink()
def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,required=True)
    modes=parser.add_mutually_exclusive_group();modes.add_argument('--check',action='store_true');modes.add_argument('--apply',action='store_true');modes.add_argument('--rollback',action='store_true');a=parser.parse_args(argv)
    root=a.root.resolve()
    if (root/'release.json').exists():raise RuntimeError('Production release refused.')
    source=root/'tools/deploy/local_delivery.py';folder=root/'.patch-backups/cv-library-persistence-v1';record=folder/'installation.json';backup=folder/'local_delivery.py.before'
    for p in [root/'tools',root/'tools/deploy',source,root/'.patch-backups',folder,record,backup]:no_link(p)
    raw=source.read_bytes()
    if a.rollback:
        report=json.loads(record.read_text());before=backup.read_bytes()
        if sha(raw)!=report['after'] or sha(before)!=report['before']:raise RuntimeError('Policy or backup changed; rollback refused.')
        for name,h in report['created'].items():
            p=root/name;no_link(p)
            if p.exists() and sha(p.read_bytes())!=h:raise RuntimeError('Added source/document changed; rollback refused.')
        atomic(source,before)
        for name in report['created']:(root/name).unlink(missing_ok=True)
        record.rename(folder/'rolled-back.json');print('ROLLED BACK: source-policy increment only. CV code, catalogue and data preserved.');return
    updated,installed=plan(raw)
    additions={**PAYLOAD,'tools/maintenance/preserve-cv-library.py':Path(__file__).read_text(encoding='utf-8')}
    for name,text in additions.items():
        p=root/name
        for parent in p.parents:
            if parent==root:break
            no_link(parent)
        no_link(p)
        if p.exists() and p.read_bytes()!=text.encode():raise RuntimeError('Existing documentation/helper/test differs: '+name)
    catalogue=root/'config/cv-library.json'
    if not catalogue.is_file():raise RuntimeError('Place the cleaned catalogue at config/cv-library.json first.')
    parsed=json.loads(catalogue.read_text(encoding='utf-8-sig'))
    if not isinstance(parsed.get('cvs'),list) or not parsed['cvs']:raise RuntimeError('Catalogue must contain the maintained cvs array.')
    allowed={'role_code','role_name','local_path','tags','use_cases','priority','legacy_aliases'}
    codes=set()
    for entry in parsed['cvs']:
        if not isinstance(entry,dict) or set(entry)-allowed:raise RuntimeError('Unsupported/private catalogue fields; use the cleaned catalogue.')
        local=entry.get('local_path','');code=entry.get('role_code','')
        if not isinstance(local,str) or not local or PureWindowsPath(local).drive or PureWindowsPath(local).is_absolute() or PurePosixPath(local).is_absolute() or '..' in local.replace(chr(92),'/').split('/') or ':' in local:raise RuntimeError('Catalogue paths must be relative to private CV_FOLDER.')
        if not isinstance(code,str) or not code or code.lower() in codes:raise RuntimeError('Catalogue codes must be unique.')
        codes.add(code.lower())
    if installed:
        if not all((root/n).is_file() for n in additions):raise RuntimeError('Policy installed but persistence documents are incomplete; review before retrying.')
        print('ALREADY INSTALLED. No files changed.');return
    if record.exists() or backup.exists():raise RuntimeError('Existing persistence backup found; review it before reapplying.')
    print('CHECK PASSED: only config/cv-library.json is added to the existing allowlist.')
    print('Adds recovery documentation, a policy regression test and this maintained helper. Does NOT stage, commit, push or deploy.')
    if not a.apply:return
    folder.mkdir(parents=True,exist_ok=True)
    with backup.open('xb') as f:f.write(raw)
    created={n:sha(t.encode()) for n,t in additions.items() if not (root/n).exists()}
    with record.open('x',encoding='utf-8') as f:json.dump({'before':sha(raw),'after':sha(updated),'created':created},f,indent=2)
    if source.read_bytes()!=raw:raise RuntimeError('Source policy changed before write. No policy replacement performed.')
    for name,text in additions.items():
        p=root/name
        if name in created:
            p.parent.mkdir(parents=True,exist_ok=True)
            with p.open('xb') as f:f.write(text.encode())
    atomic(source,updated)
    print('APPLIED locally. Review/commit the installed source, tests, catalogue and documentation, then Push origin.')
if __name__=='__main__':
    try:main()
    except Exception as e:print('STOPPED: '+str(e),file=sys.stderr);sys.exit(1)
