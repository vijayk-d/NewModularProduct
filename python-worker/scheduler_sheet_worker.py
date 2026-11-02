"""Authenticated transport only. Never sends email or creates a Sheet."""
import json, os, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/maintenance'))
from scheduler_setup_support import google_services, verify_private_file
REQUEST_HEADER=['requestId','jobId','action','part','total','data','mac']
JOB_HEADER=['jobId','receipt','mac']
def process(payload,env=None,factory=google_services):
 env=os.environ if env is None else env
 if not isinstance(payload,dict) or payload.get('action') not in ('inspect','append'):raise ValueError('Invalid action')
 auth=factory(env);owner=str(env.get('GMAIL_FROM_ADDRESS','')).strip().lower()
 if not owner or auth.get('email')!=owner:raise ValueError('Account mismatch')
 sheet=env.get('CLOUD_SCHEDULER_SPREADSHEET_ID','');namespace=env.get('CLOUD_SCHEDULER_NAMESPACE','')
 verify_private_file(auth,sheet,owner)
 values=auth['sheets'].spreadsheets().values()
 def read(range):return values.get(spreadsheetId=sheet,range=range).execute(num_retries=0).get('values',[])
 settings=dict(row for row in read("'Settings'!A1:B4") if len(row)==2)
 if settings!={'schema':'cloud-mail-queue-v1','owner':owner,'namespace':namespace,'environment':'production'}:raise ValueError('Sheet identity mismatch')
 if read("'Requests'!A1:G1")!=[REQUEST_HEADER] or read("'Jobs'!A1:C1")!=[JOB_HEADER]:raise ValueError('Scheduler worker not initialised')
 if payload['action']=='append':
  if set(payload)!={'action','rows'}:raise ValueError('Unexpected fields')
  if len(read("'Requests'!A2:A10002"))+len(payload['rows'])>10000:raise ValueError('Request archival required')
  rows=payload['rows']
  if not isinstance(rows,list) or not 1<=len(rows)<=150:raise ValueError('Invalid rows')
  if any(not isinstance(row,list) or len(row)!=7 or any(not isinstance(v,str) or len(v)>30000 for v in row) for row in rows):raise ValueError('Invalid cells')
  result=values.append(spreadsheetId=sheet,range="'Requests'!A:G",valueInputOption='RAW',insertDataOption='INSERT_ROWS',body={'values':rows}).execute(num_retries=0)
  if result.get('updates',{}).get('updatedRows')!=len(rows):raise ValueError('Unconfirmed append')
  return {'ok':True,'acceptedRows':len(rows),'sent':False}
 if set(payload)!={'action'}:raise ValueError('Unexpected fields')
 rows=read("'Jobs'!A2:C2001")
 return {'ok':True,'receipts':[r for r in rows if len(r)==3],'sent':False}
if __name__=='__main__':
 try:
  raw=sys.stdin.buffer.read(6*1024*1024+1)
  if len(raw)>6*1024*1024:raise ValueError('Too large')
  print(json.dumps(process(json.loads(raw.decode('utf-8'))),ensure_ascii=False))
 except Exception:
  print(json.dumps({'ok':False,'sent':False,'error':'Scheduler transport/identity validation failed. Outcome may be unconfirmed; do not duplicate.'}));sys.exit(1)
