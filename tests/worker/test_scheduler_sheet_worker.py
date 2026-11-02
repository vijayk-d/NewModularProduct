import importlib.util,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('scheduler_transport',ROOT/'python-worker/scheduler_sheet_worker.py');worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
class Result:
 def __init__(self,value):self.value=value
 def execute(self,**kwargs):
  assert kwargs=={'num_retries':0}
  if isinstance(self.value,Exception):raise self.value
  return self.value
class API:
 def __init__(self):self.writes=[];self.owner='sender@example.test';self.namespace='11111111-1111-1111-1111-111111111111';self.bad_header=False;self.fail_append=False;self.public=False
 def spreadsheets(self):return self
 def values(self):return self
 def permissions(self):return self
 def list(self,**kw):return Result({'permissions':[{'type':'anyone','role':'reader'}] if self.public else [{'type':'user','role':'owner','emailAddress':self.owner}]})
 def get(self,**kw):
  value={"'Settings'!A1:B4":[['schema','cloud-mail-queue-v1'],['owner',self.owner],['namespace',self.namespace],['environment','production']],"'Requests'!A1:G1":[['bad']] if self.bad_header else [worker.REQUEST_HEADER],"'Jobs'!A1:C1":[worker.JOB_HEADER],"'Jobs'!A2:C2001":[],"'Requests'!A2:A10002":[]}[kw['range']]
  return Result({'values':value})
 def append(self,**kw):self.writes.append(kw);return Result(RuntimeError('transport') if self.fail_append else {'updates':{'updatedRows':len(kw['body']['values'])}})
class Tests(unittest.TestCase):
 def setUp(self):self.api=API();self.env={'GMAIL_FROM_ADDRESS':self.api.owner,'CLOUD_SCHEDULER_NAMESPACE':self.api.namespace,'CLOUD_SCHEDULER_SPREADSHEET_ID':'private-fixture'}
 def call(self,value):return worker.process(value,self.env,lambda env:{'email':self.api.owner,'sheets':self.api,'drive':self.api})
 def test_inspection_never_writes(self):self.assertEqual(self.call({'action':'inspect'})['receipts'],[]);self.assertEqual(self.api.writes,[])
 def test_append_uses_raw_cells_and_does_not_send(self):
  result=self.call({'action':'append','rows':[['r','j','schedule','0','1','{}','mac']]});self.assertFalse(result['sent']);self.assertEqual(self.api.writes[0]['valueInputOption'],'RAW')
 def test_shared_sheet_blocks_before_append(self):
  self.api.public=True
  with self.assertRaises(RuntimeError):self.call({'action':'append','rows':[['r','j','schedule','0','1','{}','mac']]})
  self.assertEqual(self.api.writes,[])
 def test_wrong_account_blocks_before_append(self):
  self.env['GMAIL_FROM_ADDRESS']='other@example.test'
  with self.assertRaises(ValueError):self.call({'action':'append','rows':[['r','j','schedule','0','1','{}','mac']]})
  self.assertEqual(self.api.writes,[])
 def test_wrong_headers_are_not_overwritten(self):
  self.api.bad_header=True
  with self.assertRaises(ValueError):self.call({'action':'inspect'})
  self.assertEqual(self.api.writes,[])
 def test_invalid_cells_never_write(self):
  with self.assertRaises(ValueError):self.call({'action':'append','rows':[['invalid']]})
  self.assertEqual(self.api.writes,[])
 def test_ambiguous_append_is_not_retried(self):
  self.api.fail_append=True
  with self.assertRaises(RuntimeError):self.call({'action':'append','rows':[['r','j','schedule','0','1','{}','mac']]})
  self.assertEqual(len(self.api.writes),1)
 def test_unknown_actions_fail_closed(self):
  with self.assertRaises(ValueError):self.call({'action':'send'})
  self.assertEqual(self.api.writes,[])
if __name__=='__main__':unittest.main()
