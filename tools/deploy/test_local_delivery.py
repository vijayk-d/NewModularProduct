import contextlib,importlib.util,io,json,os,sqlite3,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('delivery',Path(__file__).with_name('local_delivery.py'));d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)/'repo';self.root.mkdir();self.prod=Path(self.tmp.name)/'production';p=patch.object(d,'ROOT',self.root);p.start();self.addCleanup(p.stop)
 def gitinit(self):
  subprocess.run(['git','init','-q',str(self.root)],check=True)
  for k,v in [('user.email','fixture@example.test'),('user.name','Fixture'),('commit.gpgsign','false'),('tag.gpgsign','false'),('core.hooksPath',str(self.root/'empty-hooks'))]:subprocess.run(['git','-C',str(self.root),'config',k,v],check=True)
  (self.root/'package.json').write_text('{}');(self.root/'.gitignore').write_text('.env\nvar/\ndata/\n');subprocess.run(['git','-C',str(self.root),'add','package.json','.gitignore'],check=True);subprocess.run(['git','-C',str(self.root),'commit','-qm','fixture'],check=True)
 def makeplan(self):
  self.gitinit();(self.root/'src').mkdir();(self.root/'src/new.js').write_text('export const a=1;')
  with patch.object(d,'prepare',lambda:None),contextlib.redirect_stdout(io.StringIO()):d.plan()
  return next((self.root/'var/maintenance/delivery').glob('checkpoint-plan-*.json'))
 def args(self,**kw):return type('Args',(),{'production_root':str(self.prod),**kw})()
 def prodsetup(self):
  self.gitinit();(self.prod/'shared/config').mkdir(parents=True);(self.prod/'shared/config/production.env').write_text('');(self.prod/'shared/data').mkdir();(self.prod/'shared/logs').mkdir();(self.prod/'releases').mkdir()
 def test_allowlist_excludes_private_generated_and_root_artifacts(self):
  for n in ['.env','data/cv.pdf','output/outreach.db','tools/patches/a/install.py','tests/worker/__pycache__/a.pyc','tools/maintenance/x-source.json','tools/maintenance/local-production-audit-1.json','unknown.json','../escape.js']:self.assertFalse(d.safe_source(n),n)
  for n in ['src/app.js','package-lock.json','tools/deploy/local_delivery.py','tools/deploy/assets/standard-cover-letter.md']:self.assertTrue(d.safe_source(n),n)
 def test_secret_scan_does_not_echo_the_secret(self):
  with self.assertRaises(RuntimeError) as e:d.scan('src/a.js',b'-----BEGIN '+b'PRIVATE KEY-----')
  self.assertNotIn('BEGIN PRIVATE KEY',str(e.exception))
 def test_dotenv_retains_windows_path_and_quotes(self):
  p=self.root/'sample.env';d.write_env(p,{'CV_FOLDER':r'D:\Some Folder\CV','NAME':"O'Connor"});self.assertIn(r"CV_FOLDER='D:\Some Folder\CV'",p.read_text());self.assertIn('NAME="O\'Connor"',p.read_text())
  with self.assertRaises(RuntimeError):d.write_env(p,{'A':'bad\nvalue'})
 def test_database_and_contact_snapshot(self):
  source=self.root/'output';source.mkdir()
  with _managed_sqlite_connection(source/'outreach.db') as db:db.execute('CREATE TABLE proof(x TEXT)');db.execute('INSERT INTO proof VALUES(?)',('retained',))
  (source/'imported-recruiter-contacts.json').write_text('[{"id":"synthetic"}]');target=self.root/'backup';d.snapshot(source,target)
  self.assertEqual(d.schemas(source),d.schemas(target))
  with _managed_sqlite_connection(target/'outreach.db') as db:self.assertEqual(db.execute('SELECT x FROM proof').fetchone()[0],'retained')
  self.assertEqual(d.read(target/'imported-recruiter-contacts.json')[0]['id'],'synthetic')
 def test_snapshot_never_overwrites(self):
  p=self.root/'backup';p.mkdir();(p/'keep').write_text('keep')
  with self.assertRaises(RuntimeError):d.snapshot(self.root,p)
  self.assertEqual((p/'keep').read_text(),'keep')
 def test_delivery_lock_is_exclusive(self):
  with d.delivery_lock(self.prod):
   with self.assertRaises(RuntimeError):
    with d.delivery_lock(self.prod):pass
  self.assertFalse((self.prod/'delivery.lock').exists())
 def test_production_root_outside_repository(self):
  self.gitinit()
  with self.assertRaises(RuntimeError):d.prod_root(self.args(production_root=str(self.root/'production')))
 def test_git_archive_excludes_tracked_env_and_database(self):
  self.gitinit();(self.root/'src').mkdir();(self.root/'src/a.js').write_text('export const a=1;');(self.root/'.env').write_text('SECRET=not-for-release');(self.root/'data').mkdir();(self.root/'data/private.db').write_bytes(b'private');subprocess.run(['git','-C',str(self.root),'add','src/a.js'],check=True);subprocess.run(['git','-C',str(self.root),'add','-f','.env','data/private.db'],check=True);subprocess.run(['git','-C',str(self.root),'commit','-qm','source'],check=True)
  target=self.root/'artifact';target.mkdir();d.extract(d.git('rev-parse','HEAD'),target);self.assertTrue((target/'src/a.js').exists());self.assertFalse((target/'.env').exists());self.assertFalse((target/'data/private.db').exists())
 def test_plan_does_not_stage_or_commit(self):
  self.makeplan();self.assertEqual(d.git('diff','--cached','--name-only'),'');self.assertEqual(d.git('log','-1','--format=%s'),'fixture')
 def test_test_failure_prevents_staging_and_commit(self):
  plan=self.makeplan();head=d.git('rev-parse','HEAD')
  with patch.object(d,'verify_candidate',side_effect=RuntimeError('synthetic failure')):
   with self.assertRaises(RuntimeError):d.checkpoint(self.args(plan=str(plan)))
  self.assertEqual(d.git('rev-parse','HEAD'),head);self.assertEqual(d.git('diff','--cached','--name-only'),'')
 def test_source_changes_invalidate_plan(self):
  plan=self.makeplan();(self.root/'src/new.js').write_text('changed')
  with self.assertRaises(RuntimeError):d.checkpoint(self.args(plan=str(plan)))
  self.assertEqual(d.git('diff','--cached','--name-only'),'')
 def test_successful_checkpoint_commits_reviewed_scope_only(self):
  plan=self.makeplan();(self.root/'private-note.txt').write_text('not source')
  with patch.object(d,'verify_candidate',return_value={'synthetic':True}),contextlib.redirect_stdout(io.StringIO()):d.checkpoint(self.args(plan=str(plan)))
  changed=d.git('show','--format=','--name-only','HEAD');self.assertIn('src/new.js',changed);self.assertNotIn('private-note.txt',changed);self.assertTrue(d.git('tag','--list','baseline-localprod-*'))
 def test_initial_seed_separate_and_integrations_off(self):
  self.gitinit();self.prod.mkdir();d.atomic(self.prod/'bootstrap-manifest.json',{'sourceProject':str(self.root)});inv=self.root/'inventory.json';inv.write_text('{"cvs":[]}');source=self.root/'output';source.mkdir();(source/'imported-recruiter-contacts.json').write_text('[{"id":"synthetic"}]')
  with patch.object(d,'dev_env',return_value={'CV_INVENTORY_PATH':str(inv),'CV_FOLDER':'CV','ENABLE_GMAIL':'true','PERPLEXITY_API_KEY':'synthetic'}),patch.object(d,'busy',return_value=False),contextlib.redirect_stdout(io.StringIO()):d.initialise(self.args(seed=True))
  self.assertIn("ENABLE_GMAIL='false'",(self.prod/'shared/config/production.env').read_text());self.assertTrue((source/'imported-recruiter-contacts.json').exists());self.assertTrue((self.prod/'shared/data/imported-recruiter-contacts.json').exists());self.assertTrue((self.prod/'control/local_delivery.py').exists())
 def test_production_does_not_inherit_dev_tokens(self):
  with patch.dict(os.environ,{'GMAIL_OAUTH_REFRESH_TOKEN':'should-not-inherit','PERPLEXITY_API_KEY':'should-not-inherit'}):env=d.production_env(self.prod,self.prod/'releases/a','a')
  self.assertNotIn('GMAIL_OAUTH_REFRESH_TOKEN',env);self.assertNotIn('PERPLEXITY_API_KEY',env);self.assertEqual(env['NMP_ENV'],'production')
 def test_modified_release_source_is_refused(self):
  release=self.root/'release';release.mkdir();(release/'a.js').write_text('changed');d.atomic(release/'release.json',{'files':{'a.js':'wrong'},'runtime':{}})
  with self.assertRaises(RuntimeError):d.checked_release(release)
 def test_failed_release_tests_keep_active_and_do_not_pause(self):
  self.prodsetup();d.atomic(self.prod/'active.json',{'commit':'old'})
  with patch.object(d,'verify_candidate',side_effect=RuntimeError('synthetic')),patch.object(d,'pause') as pause:
   with self.assertRaises(RuntimeError):d.deliver(self.args(ref='HEAD'))
  pause.assert_not_called();self.assertEqual(d.read(self.prod/'active.json')['commit'],'old');self.assertFalse((self.prod/'delivery.lock').exists())
 def test_promotion_retains_current_data(self):
  self.prodsetup();(self.prod/'shared/data/imported-recruiter-contacts.json').write_text('[{"id":"retained"}]')
  with patch.object(d,'verify_candidate',return_value={'contract':1}),patch.object(d,'smoke'),patch.object(d,'pause',return_value=None),contextlib.redirect_stdout(io.StringIO()):d.deliver(self.args(ref='HEAD'))
  commit=d.git('rev-parse','HEAD');self.assertEqual(d.read(self.prod/'active.json')['commit'],commit);self.assertEqual(d.read(self.prod/'shared/data/imported-recruiter-contacts.json')[0]['id'],'retained')
 def test_schema_changes_block_promotion_without_touching_real_state(self):
  self.prodsetup();file=self.prod/'shared/data/outreach.db'
  with _managed_sqlite_connection(file) as db:db.execute('CREATE TABLE original(x TEXT)')
  def smoke(release,state,commit,log):
   if state.name=='production-copy':
    with _managed_sqlite_connection(state/'outreach.db') as db:db.execute('ALTER TABLE original ADD COLUMN forbidden TEXT')
  with patch.object(d,'verify_candidate',return_value={'contract':1}),patch.object(d,'smoke',side_effect=smoke),patch.object(d,'pause',return_value=None):
   with self.assertRaises(RuntimeError):d.deliver(self.args(ref='HEAD'))
  self.assertFalse((self.prod/'active.json').exists())
  with _managed_sqlite_connection(file) as db:self.assertEqual(len(db.execute('PRAGMA table_info(original)').fetchall()),1)

@contextlib.contextmanager
def _managed_sqlite_connection(*args, **kwargs):
    connection = sqlite3.connect(*args, **kwargs)
    try:
        with connection:
            yield connection
    finally:
        connection.close()


class SqliteConnectionOwnershipTests(unittest.TestCase):
 def test_retained_connection_is_closed_and_success_is_committed(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'owned.db'
   with _managed_sqlite_connection(path) as connection:
    connection.execute('CREATE TABLE evidence(value TEXT)')
    connection.execute('INSERT INTO evidence VALUES(?)',('committed',))
   with self.assertRaises(sqlite3.ProgrammingError):connection.execute('SELECT 1')
   with _managed_sqlite_connection(path) as check:
    self.assertEqual(check.execute('SELECT value FROM evidence').fetchone()[0],'committed')
   path.unlink()
   self.assertFalse(path.exists())
 def test_exception_rolls_back_and_still_closes(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'owned.db'
   with _managed_sqlite_connection(path) as setup:setup.execute('CREATE TABLE evidence(value TEXT)')
   with self.assertRaisesRegex(RuntimeError,'synthetic'):
    with _managed_sqlite_connection(path) as connection:
     connection.execute('INSERT INTO evidence VALUES(?)',('must roll back',))
     raise RuntimeError('synthetic')
   with self.assertRaises(sqlite3.ProgrammingError):connection.execute('SELECT 1')
   with _managed_sqlite_connection(path) as check:self.assertEqual(check.execute('SELECT COUNT(*) FROM evidence').fetchone()[0],0)
   path.unlink()
 def test_snapshot_and_schema_connections_close_without_garbage_collection(self):
  opened=[]
  real_connect=sqlite3.connect
  class TrackedConnection(sqlite3.Connection):
   explicitly_closed=False
   def close(self):
    self.explicitly_closed=True
    return super().close()
  def tracked_connect(*args,**kwargs):
   kwargs['factory']=TrackedConnection
   connection=real_connect(*args,**kwargs);opened.append(connection);return connection
  with tempfile.TemporaryDirectory() as folder:
   source=Path(folder)/'source';source.mkdir();target=Path(folder)/'backup'
   with _managed_sqlite_connection(source/'outreach.db') as setup:setup.execute('CREATE TABLE evidence(value TEXT)')
   with patch.object(sqlite3,'connect',side_effect=tracked_connect):d.snapshot(source,target);d.schemas(target)
   self.assertGreaterEqual(len(opened),3)
   self.assertTrue(all(connection.explicitly_closed for connection in opened))
   (source/'outreach.db').unlink();(target/'outreach.db').unlink()


class PythonWorkerReleasePolicyTests(unittest.TestCase):
 def test_python_worker_modules_are_release_source(self):
  for name in ['python-worker/gmail_draft_worker.py','python-worker/gmail_confirmed_draft_worker.py','python-worker/gmail_send_worker.py','python-worker/gmail_mailbox_check.py','python-worker/gmail_signature_reader.py','python-worker/gmail_signature_diagnostics.py']:
   self.assertTrue(d.safe_source(name),name)
 def test_python_worker_private_and_generated_files_stay_excluded(self):
  for name in ['python-worker/.env','python-worker/credentials.json','python-worker/token.db','python-worker/__pycache__/worker.pyc','python-worker/worker.py.bak','python-worker/worker.pyc','python-worker/CV.pdf']:
   self.assertFalse(d.safe_source(name),name)
 def test_snapshot_selection_and_git_archive_include_workers(self):
  import subprocess
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)/'repo';root.mkdir()
   subprocess.run(['git','init','-q',str(root)],check=True)
   for key,value in [('user.email','fixture@example.test'),('user.name','Fixture'),('commit.gpgsign','false'),('core.hooksPath',str(root/'empty-fixture-hooks'))]:
    subprocess.run(['git','-C',str(root),'config',key,value],check=True)
   (root/'python-worker').mkdir();worker=root/'python-worker/gmail_draft_worker.py';worker.write_text('value = 1\n',encoding='utf-8')
   subprocess.run(['git','-C',str(root),'add','python-worker/gmail_draft_worker.py'],check=True)
   subprocess.run(['git','-C',str(root),'commit','-qm','Synthetic worker fixture'],check=True)
   with patch.object(d,'ROOT',root):
    self.assertIn('python-worker/gmail_draft_worker.py',d.source_files())
    target=root/'artifact';target.mkdir();d.extract(d.git('rev-parse','HEAD'),target)
    self.assertEqual((target/'python-worker/gmail_draft_worker.py').read_bytes(),worker.read_bytes())


class WindowsEnvironmentPolicyTests(unittest.TestCase):
 def test_uppercase_windows_os_keys_are_preserved_without_provider_tokens(self):
  values={'SYSTEMROOT':r'C:\Windows','SYSTEMDRIVE':'C:','PATH':'synthetic-path','COMSPEC':r'C:\Windows\System32\cmd.exe','GMAIL_OAUTH_REFRESH_TOKEN':'synthetic-private','PERPLEXITY_API_KEY':'synthetic-private','NODE_OPTIONS':'--require untrusted.js','NMP_ENV':'development'}
  with patch.object(d.os,'environ',values):result=d.base_env()
  for key in ['SYSTEMROOT','SYSTEMDRIVE','PATH','COMSPEC']:self.assertEqual(result[key],values[key])
  for key in ['GMAIL_OAUTH_REFRESH_TOKEN','PERPLEXITY_API_KEY','NODE_OPTIONS','NMP_ENV']:self.assertNotIn(key,result)
 def test_mixed_case_os_names_are_preserved_case_insensitively(self):
  values={'SystemRoot':r'C:\Windows','SystemDrive':'C:','Path':'synthetic-path','ComSpec':r'C:\Windows\System32\cmd.exe','ProgramFiles':r'C:\Program Files','http_proxy':'http://proxy.invalid','gmail_oauth_refresh_token':'synthetic-private'}
  with patch.object(d.os,'environ',values):result=d.base_env()
  for key in ['SystemRoot','SystemDrive','Path','ComSpec','ProgramFiles','http_proxy']:self.assertEqual(result[key],values[key])
  self.assertNotIn('gmail_oauth_refresh_token',result)
 def test_preflight_exercises_crypto_and_npm_with_filtered_environment_only(self):
  import contextlib,io
  values={'SYSTEMROOT':r'C:\Windows','SYSTEMDRIVE':'C:','PATH':'synthetic-path','GMAIL_OAUTH_REFRESH_TOKEN':'synthetic-private'}
  with patch.object(d.os,'environ',values),patch.object(d,'node',return_value='synthetic-node'),patch.object(d,'npm_cli',return_value='synthetic-npm-cli.js'),patch.object(d,'run',return_value='probe-ok') as run,contextlib.redirect_stdout(io.StringIO()):d.preflight()
  self.assertEqual(run.call_count,3)
  self.assertIn('randomBytes',' '.join(map(str,run.call_args_list[0].args[0])))
  self.assertIn('--version',run.call_args_list[1].args[0])
  self.assertIn('secrets',' '.join(map(str,run.call_args_list[2].args[0])))
  for call in run.call_args_list:
   env=call.kwargs['env'];self.assertIn('SYSTEMROOT',env);self.assertIn('SYSTEMDRIVE',env);self.assertNotIn('GMAIL_OAUTH_REFRESH_TOKEN',env)


class StagedSourceBytePolicyTests(unittest.TestCase):
 def test_line_endings_only_are_normalised(self):
  left=b'\xef\xbb\xbfimport example;\r\n\r\n'
  right=b'\xef\xbb\xbfimport example;\n\n'
  self.assertEqual(d.source_bytes_for_comparison(left),d.source_bytes_for_comparison(right))
 def test_bom_is_preserved_and_changes_are_detected(self):
  self.assertNotEqual(d.source_bytes_for_comparison(b'\xef\xbb\xbfvalue\n'),d.source_bytes_for_comparison(b'value\n'))
 def test_leading_and_trailing_whitespace_is_not_stripped(self):
  for changed in [b' value\n',b'value \n',b'value',b'value\n\n']:
   self.assertNotEqual(d.source_bytes_for_comparison(b'value\n'),d.source_bytes_for_comparison(changed))
 def test_bare_cr_is_not_silently_rewritten(self):
  self.assertNotEqual(d.source_bytes_for_comparison(b'value\r'),d.source_bytes_for_comparison(b'value\n'))
 def test_unicode_bytes_are_not_lossily_decoded(self):
  first='£ résumé — delivery\n'.encode('utf-8')
  self.assertEqual(d.source_bytes_for_comparison(first),first)
  self.assertNotEqual(d.source_bytes_for_comparison(b'\xff'),d.source_bytes_for_comparison(b'\xfe'))
 def test_real_git_index_with_bom_and_eol_attributes(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)
   def git(*args):
    return subprocess.run(['git',*args],cwd=root,check=True,capture_output=True)
   git('init','-q');git('config','core.autocrlf','false')
   (root/'.gitattributes').write_text('*.js text eol=lf\n',encoding='utf-8')
   source=root/'sample.js';source.write_bytes(b'\xef\xbb\xbfimport example;\r\n')
   git('add','.gitattributes','sample.js')
   with patch.object(d,'ROOT',root):
    self.assertEqual(d.staged_source_bytes('sample.js'),b'\xef\xbb\xbfimport example;\n')
    self.assertTrue(d.staged_source_matches('sample.js'))
    for changed in [b'import example;\r\n',b'\xef\xbb\xbf import example;\r\n',b'\xef\xbb\xbfimport example;']:
     source.write_bytes(changed);self.assertFalse(d.staged_source_matches('sample.js'))
 def test_missing_index_blob_does_not_pass(self):
  with patch.object(d.subprocess,'run',return_value=type('Result',(),{'returncode':1,'stdout':b'','stderr':b'private diagnostic'})()):
   with self.assertRaisesRegex(RuntimeError,'Cannot read staged source') as error:d.staged_source_bytes('missing.js')
   self.assertNotIn('private diagnostic',str(error.exception))


class BomCheckpointRegressionTests(unittest.TestCase):
 def test_checkpoint_commits_reviewed_bom_crlf_source_without_false_rejection(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)/'repo';root.mkdir()
   def git(*args):
    return subprocess.run(['git',*args],cwd=root,capture_output=True,check=True).stdout
   git('init','-q')
   for k,v in [('user.email','fixture@example.invalid'),('user.name','Fixture'),('commit.gpgsign','false'),('tag.gpgsign','false'),('core.autocrlf','false'),('core.hooksPath',str(root/'empty-hooks'))]:git('config',k,v)
   (root/'package.json').write_text('{}',encoding='utf-8')
   (root/'.gitattributes').write_text('*.js text eol=lf\n',encoding='utf-8')
   git('add','package.json','.gitattributes');git('commit','-qm','Fixture')
   p=root/'src/app.js';p.parent.mkdir();original=b'\xef\xbb\xbfexport const value=1;\r\n';p.write_bytes(original)
   with patch.object(d,'ROOT',root),patch.object(d,'prepare',lambda:None),contextlib.redirect_stdout(io.StringIO()):
    d.plan();review=next((root/'var/maintenance/delivery').glob('checkpoint-plan-*.json'))
    args=type('Args',(),{'plan':str(review)})()
    with patch.object(d,'verify_candidate',return_value={'synthetic':True}):d.checkpoint(args)
   self.assertEqual(p.read_bytes(),original)
   self.assertEqual(git('show','HEAD:src/app.js'),original.replace(b'\r\n',b'\n'))
   self.assertEqual(git('diff','--cached','--name-only').strip(),b'')



class CaptureScopeRegressionTests(unittest.TestCase):
 def test_capture_paths_are_not_release_source(self):
  paths=['docs/workflow-stabilisation-source-20261024T015001Z.json','docs/workflow-stabilisation-source-20261024T114514Z.json','docs/future-source-20271024T114514Z.json','tools/maintenance/future-source-20271024T114514Z.json','docs/scenario-polishing-source.json','docs/scenario-source-text/scenario-source-001-of-019.txt','DOCS/SCENARIO-SOURCE-TEXT/part.txt','docs/scenario-polishing-source.zip']
  for path in paths:
   with self.subTest(path=path):self.assertFalse(d.safe_source(path))
 def test_real_source_and_documentation_remain_allowed(self):
  for path in ['src/application/scenario-polishing.js','tests/ui/scenario-polishing.spec.js','docs/scenario-polishing-integration.md','docs/source-format.json','docs/source-example.txt','tools/deploy/test_local_delivery.py']:
   with self.subTest(path=path):self.assertTrue(d.safe_source(path))
 def test_selection_plan_and_extract_exclude_even_force_tracked_captures(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)/'repo';root.mkdir()
   def git(*args):return subprocess.run(['git',*args],cwd=root,check=True,capture_output=True).stdout
   git('init','-q')
   for key,value in [('user.email','fixture@example.invalid'),('user.name','Fixture'),('commit.gpgsign','false'),('core.hooksPath',str(root/'empty-hooks'))]:git('config',key,value)
   captured=['docs/workflow-source-20261024T015001Z.json','docs/scenario-source-text/scenario-source-001-of-019.txt']
   for path in captured:
    p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('synthetic capture',encoding='utf-8')
   (root/'package.json').write_text('{}',encoding='utf-8')
   git('add','-f','--','package.json',*captured);git('commit','-qm','Synthetic capture fixture')
   source=root/'src/app.js';source.parent.mkdir();source.write_text('export const value=1;\n',encoding='utf-8')
   extra=root/'docs/future-source-20271024T114514Z.json';extra.write_text('{}',encoding='utf-8')
   with patch.object(d,'ROOT',root),patch.object(d,'prepare',lambda:None),contextlib.redirect_stdout(io.StringIO()):
    selected=d.source_files()
    for path in captured+[extra.relative_to(root).as_posix()]:self.assertNotIn(path,selected)
    d.plan();plan=d.read(next((root/'var/maintenance/delivery').glob('checkpoint-plan-*.json')))
    self.assertEqual(plan['paths'],['src/app.js'])
    git('add','src/app.js');git('commit','-qm','Synthetic source')
    target=root/'artifact';target.mkdir();d.extract(d.git('rev-parse','HEAD'),target)
    self.assertTrue((target/'src/app.js').is_file())
    for path in captured:self.assertFalse((target/path).exists())
 def test_capture_ignore_rules_keep_local_copies_out_of_new_staging(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);subprocess.run(['git','init','-q',str(root)],check=True,capture_output=True)
   rules=(Path(__file__).resolve().parents[2]/'.gitignore').read_text(encoding='utf-8-sig')
   (root/'.gitignore').write_text(rules,encoding='utf-8')
   names=['docs/workflow-stabilisation-source-20261024T015001Z.json','docs/scenario-source-text/scenario-source-001-of-019.txt','docs/scenario-polishing-source.json','docs/scenario-polishing-source.zip']
   for name in names:
    result=subprocess.run(['git','check-ignore','--no-index','--',name],cwd=root,capture_output=True)
    self.assertEqual(result.returncode,0,name)



class SchedulerSourcePolicyTests(unittest.TestCase):
 def test_maintained_apps_script_source_and_manifest_are_selected(self):
  for name in ['apps-script/gmail-scheduler/Code.gs','apps-script/gmail-scheduler/Scheduler.gs','apps-script/gmail-scheduler/appsscript.json','apps-script/gmail-scheduler/appsscript.scheduler.json','apps-script/gmail-scheduler/README.md','tampermonkey/example.user.js']:
   self.assertTrue(d.safe_source(name),name)
 def test_private_apps_script_configuration_is_excluded(self):
  for name in ['apps-script/gmail-scheduler/.env','apps-script/gmail-scheduler/.clasp.json','apps-script/gmail-scheduler/credentials.json','apps-script/gmail-scheduler/token.json','apps-script/gmail-scheduler/private.key','apps-script/gmail-scheduler/backups/Code.gs']:
   self.assertFalse(d.safe_source(name),name)

if __name__=='__main__':unittest.main()
