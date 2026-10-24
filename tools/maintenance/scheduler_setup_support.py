"""Private Sheet setup support only: no scheduling, Gmail calls or public endpoint."""
import os,re
SCOPES=['https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/userinfo.email']
SCHEMA='cloud-mail-queue-v1'
def require(ok,message):
 if not ok:raise RuntimeError(message)
def google_services(env):
 from google.oauth2.credentials import Credentials
 from googleapiclient.discovery import build
 cid=env.get('CLOUD_SCHEDULER_OAUTH_CLIENT_ID','');secret=env.get('CLOUD_SCHEDULER_OAUTH_CLIENT_SECRET','');token=env.get('CLOUD_SCHEDULER_OAUTH_REFRESH_TOKEN','')
 require(cid and token,'Dedicated scheduler authorisation is missing.')
 creds=Credentials(token=None,refresh_token=token,token_uri='https://oauth2.googleapis.com/token',client_id=cid,client_secret=secret,scopes=SCOPES)
 identity=build('oauth2','v2',credentials=creds,cache_discovery=False).userinfo().get().execute(num_retries=0)
 require(identity.get('verified_email') is True,'Scheduler account email is not verified.')
 drive=build('drive','v3',credentials=creds,cache_discovery=False)
 # A read-only, per-file-scoped preflight detects a disabled Drive API before Sheet creation.
 drive.files().list(pageSize=1,spaces='drive',fields='files(id)',q='trashed = false').execute(num_retries=0)
 return {'email':str(identity.get('email','')).strip().lower(),'sheets':build('sheets','v4',credentials=creds,cache_discovery=False),'drive':drive}
def verify_private_file(auth,sheet,account):
 result=auth['drive'].permissions().list(fileId=sheet,fields='permissions(type,role,emailAddress,domain),nextPageToken',pageSize=100).execute(num_retries=0)
 permissions=result.get('permissions',[])
 require(isinstance(permissions,list) and permissions and not result.get('nextPageToken'),'File privacy could not be verified.')
 require(all(p.get('type')=='user' and p.get('role')=='owner' and str(p.get('emailAddress','')).lower()==account for p in permissions),'Scheduler file must be private to its owner. Sharing was not changed automatically.')

def process_request(payload,env=None,service_factory=None):
 env=os.environ if env is None else env;attempted=False;created_id=None
 try:
  require(isinstance(payload,dict) and payload.get('action') in ['inspect','create'],'Setup supports inspect/create only.')
  account=str(env.get('GMAIL_FROM_ADDRESS','')).strip().lower();require(re.fullmatch(r'[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+',account),'Configure the expected sender locally.')
  action=payload['action']
  if action=='create':
   require(set(payload)=={'action','confirmed','title','namespace'} and payload['confirmed'] is True,'Explicit Sheet creation confirmation required.')
   require(isinstance(payload['title'],str) and 1<=len(payload['title'])<=100 and not re.search(r'[\x00-\x1f\x7f]',payload['title']),'Invalid Sheet title.')
   namespace=payload['namespace'];require(re.fullmatch(r'[a-f0-9-]{36}',str(namespace)),'Invalid namespace.')
  else:
   require(set(payload)=={'action'},'Unexpected inspect fields.')
   sheet=env.get('CLOUD_SCHEDULER_SPREADSHEET_ID','');namespace=env.get('CLOUD_SCHEDULER_NAMESPACE','')
   require(re.fullmatch(r'[A-Za-z0-9_-]{10,200}',str(sheet)) and re.fullmatch(r'[a-f0-9-]{36}',str(namespace)),'Scheduler file configuration missing.')
  auth=(service_factory or google_services)(env);require(auth.get('email')==account,'Authorised account mismatch.')
  api=auth['sheets'].spreadsheets()
  if action=='create':
   attempted=True
   response=api.create(body={'properties':{'title':payload['title']},'sheets':[{'properties':{'title':name}} for name in ['Requests','Jobs','Events','Settings']]},fields='spreadsheetId').execute(num_retries=0)
   created_id=response.get('spreadsheetId');require(isinstance(created_id,str) and re.fullmatch(r'[A-Za-z0-9_-]{10,200}',created_id),'Missing Sheet receipt.')
   verify_private_file(auth,created_id,account)
   rows=[['schema',SCHEMA],['owner',account],['namespace',namespace],['environment','production']]
   response=api.values().update(spreadsheetId=created_id,range="'Settings'!A1:B4",valueInputOption='RAW',body={'values':rows}).execute(num_retries=0)
   require(response.get('updatedRows')==4,'Sheet initialisation receipt unconfirmed.')
   return {'ok':True,'created':True,'setupComplete':True,'account':account,'spreadsheetId':created_id,'namespace':namespace,'sent':False}
  verify_private_file(auth,sheet,account)
  result=api.values().get(spreadsheetId=sheet,range="'Settings'!A1:B4").execute(num_retries=0)
  settings={str(r[0]):str(r[1]) for r in result.get('values',[]) if len(r)==2}
  require(settings=={'schema':SCHEMA,'owner':account,'namespace':namespace,'environment':'production'},'Scheduler file identity mismatch.')
  return {'ok':True,'account':account,'spreadsheetId':sheet,'namespace':namespace,'sent':False}
 except Exception as error:
  category=type(error).__name__;category=category if re.fullmatch(r'[A-Za-z0-9_]{1,80}',category) else 'SetupError'
  status=getattr(getattr(error,'resp',None),'status',None);status=status if isinstance(status,int) and 400<=status<=599 else None
  return {'errorCategory':category,'httpStatus':status,'ok':False,'operationAttempted':attempted,'unknown':attempted,'created':bool(created_id),'setupComplete':False,'spreadsheetId':created_id,'sent':False,'error':'Setup outcome unconfirmed. Retain the operation receipt; do not repeat Sheet creation blindly.' if attempted else 'Setup validation or account/file authorisation failed before any write.'}
