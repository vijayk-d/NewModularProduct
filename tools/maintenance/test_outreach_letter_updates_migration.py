import sys;sys.dont_write_bytecode=True
import importlib.util,json,pathlib,sqlite3,tempfile,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('migration',pathlib.Path(__file__).with_name('migrate_outreach_letter_updates_v1.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=pathlib.Path(self.temp.name);self.source=self.root/'source.db';self.probe=self.root/'probe.db';self.backup=self.root/'backup.db'
  db=sqlite3.connect(self.source);db.executescript('CREATE TABLE outreach_queue(id TEXT PRIMARY KEY,payload TEXT);CREATE TABLE sent(id TEXT PRIMARY KEY,payload TEXT)');db.execute('INSERT INTO outreach_queue VALUES(?,?)',('q','PRIVATE £2M content'));db.execute('INSERT INTO sent VALUES(?,?)',('s','sent history'));db.commit();db.close();m.copy_db(self.source,self.probe);db=m.connect(self.probe,True);m.add(db);db.commit();db.close()
 def test_preview_does_not_change_live_schema_or_data(self):
  before=self.source.read_bytes();p=m.preview(self.source,self.probe);self.assertEqual(before,self.source.read_bytes());self.assertEqual(len(p['migrationObjects']),2)
 def test_apply_preserves_all_existing_records_and_backup(self):
  p=m.preview(self.source,self.probe);m.apply_database(self.source,p,self.backup);db=m.connect(self.source);self.assertEqual(db.execute('SELECT payload FROM sent').fetchone()[0],'sent history');self.assertEqual(db.execute('SELECT COUNT(*) FROM outreach_letter_updates').fetchone()[0],0);db.close();db=m.connect(self.backup);self.assertNotIn(('table','outreach_letter_updates'),m.schema_map(m.schema(db)));db.close()
 def test_changed_data_blocks_without_schema_mutation(self):
  p=m.preview(self.source,self.probe);db=m.connect(self.source,True);db.execute('INSERT INTO sent VALUES(?,?)',('later','retained'));db.commit();db.close()
  with self.assertRaises(ValueError):m.apply_database(self.source,p,self.backup)
  db=m.connect(self.source);self.assertEqual(db.execute('SELECT COUNT(*) FROM sent').fetchone()[0],2);self.assertNotIn(('table','outreach_letter_updates'),m.schema_map(m.schema(db)));db.close()
 def test_unexpected_candidate_schema_refused(self):
  db=m.connect(self.probe,True);db.execute('CREATE TABLE unexpected(x TEXT)');db.commit();db.close()
  with self.assertRaises(ValueError):m.preview(self.source,self.probe)
 def test_partial_migration_refused(self):
  db=m.connect(self.source,True);db.execute(m.TABLE);db.commit();db.close()
  with self.assertRaises(ValueError):m.preview(self.source,self.probe)
 def test_unique_partial_index_protects_reserved_and_unknown(self):
  p=m.preview(self.source,self.probe);m.apply_database(self.source,p,self.backup);db=m.connect(self.source,True);db.execute('INSERT INTO outreach_letter_updates VALUES(?,?,?,?,?,?)',('1','a','recipient','q','reserved','{}'))
  with self.assertRaises(sqlite3.IntegrityError):db.execute('INSERT INTO outreach_letter_updates VALUES(?,?,?,?,?,?)',('2','a','recipient','q','unknown','{}'))
  db.execute("UPDATE outreach_letter_updates SET status='updated'");db.execute('INSERT INTO outreach_letter_updates VALUES(?,?,?,?,?,?)',('2','a','recipient','q','unknown','{}'));db.rollback();db.close()
 def test_existing_backup_not_overwritten(self):
  self.backup.write_text('keep')
  with self.assertRaises(ValueError):m.apply_database(self.source,m.preview(self.source,self.probe),self.backup)
  self.assertEqual(self.backup.read_text(),'keep')
 def test_wrong_post_schema_rolls_back_ddl(self):
  p=m.preview(self.source,self.probe);p['afterSchemaHash']='wrong'
  with self.assertRaises(ValueError):m.apply_database(self.source,p,self.backup)
  db=m.connect(self.source);self.assertNotIn(('table','outreach_letter_updates'),m.schema_map(m.schema(db)));db.close()
 def test_supervisor_lock_blocks_apply_gate(self):
  (self.root/'supervisor.lock').write_text('123')
  with self.assertRaises(ValueError):m.require_stopped(self.root)
 def test_receipt_contains_no_application_rows(self):
  p=m.preview(self.source,self.probe);self.assertNotIn('PRIVATE',json.dumps(p));self.assertNotIn('sent history',json.dumps(p))
if __name__=='__main__':unittest.main()
