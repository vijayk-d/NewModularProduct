import base64, copy, hashlib, json, os, re, sys, time
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses
from cv_docx import MIME as DOCX_MIME, validate_docx
sys.dont_write_bytecode=True
LIMIT=64*1024*1024
SEP='\n\n-- \n'
MARK='<!-- application-gmail-signature:v1 -->'
def sha(b):return hashlib.sha256(b).hexdigest()
def norm(s):return str(s).replace('\r\n','\n').strip()
def decode(raw):
 if not isinstance(raw,str) or not raw or len(raw)>LIMIT:raise ValueError('RAW_LIMIT')
 data=base64.b64decode(raw+'='*(-len(raw)%4),altchars=b'-_',validate=True)
 if len(data)>32*1024*1024:raise ValueError('RAW_LIMIT')
 return data
def encode(b):return base64.urlsafe_b64encode(b).decode('ascii')
def inspect(data,account,recipient):
 m=BytesParser(policy=policy.default).parsebytes(data)
 for k,v in [('From',account),('To',recipient)]:
  if len(m.get_all(k,[]))!=1 or [a.lower() for _,a in getaddresses(m.get_all(k,[]))]!=[v.lower()]:raise ValueError('IDENTITY')
 if any(m.get_all(k) for k in ['Cc','Bcc','Sender','Resent-To','Resent-Cc','Resent-Bcc']):raise ValueError('HEADERS')
 if len(m.get_all('Subject',[]))!=1 or not str(m['Subject']).strip() or len(str(m['Subject']))>300:raise ValueError('SUBJECT')
 parts=list(m.iter_attachments())
 if len(parts)!=1:raise ValueError('ONE_ORIGINAL_CV')
 p=parts[0];b=p.get_payload(decode=True) or b'';name=p.get_filename() or '';kind=p.get_content_type()
 if not b or len(b)>20*1024*1024:raise ValueError('CV_LIMIT')
 if kind==DOCX_MIME and name.lower().endswith('.docx'):validate_docx(b)
 elif not(kind=='application/pdf' and name.lower().endswith('.pdf') and b.startswith(b'%PDF-')):raise ValueError('CV_FORMAT')
 texts=[p for p in m.walk() if p.get_content_type() in ['text/plain','text/html'] and p.get_content_disposition()!='attachment']
 if sum(p.get_content_type()=='text/plain' for p in texts)!=1 or sum(p.get_content_type()=='text/html' for p in texts)!=1:raise ValueError('BODY_PARTS')
 plain=m.get_body(preferencelist=('plain',)).get_content();html=m.get_body(preferencelist=('html',)).get_content()
 if len(plain)>100000 or len(html)>300000:raise ValueError('BODY_LIMIT')
 return m,{'recipient':recipient,'subject':str(m['Subject']),'bodyPlainText':plain,'bodyHtml':html,'attachment':{'name':name,'contentType':kind,'sizeBytes':len(b),'sha256':sha(b)}}
def split_signature(plain,html):
 plain,html=norm(plain),norm(html);a,b=plain.count(SEP),html.count(MARK)
 if not a and not b:return plain,html,'',''
 if a!=1 or b!=1:raise ValueError('SIGNATURE_BOUNDARY')
 letter,sp=plain.split(SEP);lh,sh=html.split(MARK)
 if not re.search(r'<br\s*/?>\s*<br\s*/?>\s*$',lh,re.I):raise ValueError('SIGNATURE_BOUNDARY')
 lh=re.sub(r'<br\s*/?>\s*<br\s*/?>\s*$','',lh,flags=re.I)
 if not all(v.strip() for v in [letter,lh,sp,sh]):raise ValueError('SIGNATURE_EMPTY')
 return letter.strip(),lh.strip(),sp,sh
def same(a,b):return a['recipient'].lower()==b['recipient'].lower() and a['subject']==b['subject'] and norm(a['bodyPlainText'])==norm(b['bodyPlainText']) and norm(a['bodyHtml'])==norm(b['bodyHtml']) and a['attachment']==b['attachment']
def process_update(r,service_factory=None,env=None,clock=None):
 env=os.environ if env is None else env;now=clock or (lambda:time.time()*1000)
 def fail(code):return {'ok':False,'updated':False,'updateAttempted':False,'sent':False,'error':code}
 if not isinstance(r,dict) or r.get('action') not in ['prepare_update','commit_update']:return fail('UPDATE_ACTION_INVALID')
 if any(str(env.get(k,'')).strip().lower()!='true' for k in ['ENABLE_GMAIL','ENABLE_GMAIL_DRAFT_UPDATES']):return fail('DRAFT_UPDATE_DISABLED')
 account=str(env.get('GMAIL_FROM_ADDRESS','')).strip();recipient=r.get('recipient','');draft_id=r.get('draftId','');commit=r['action']=='commit_update'
 if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',account) or str(r.get('expectedAddress','')).lower()!=account.lower():return fail('SENDER_CHANGED')
 if not isinstance(recipient,str) or not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',recipient):return fail('RECIPIENT_INVALID')
 if not isinstance(draft_id,str) or not draft_id or draft_id.lower().startswith('local-'):return fail('DRAFT_ID_REQUIRED')
 if commit and (r.get('confirmed') is not True or type(r.get('expiresAt')) not in [int,float] or r['expiresAt']<=now()):return fail('UPDATE_CONFIRMATION_EXPIRED_OR_MISSING')
 try:
  if service_factory is None:
   from gmail_draft_worker import _gmail_service
   service_factory=_gmail_service
  service=service_factory();mailbox=service.users().getProfile(userId='me').execute(num_retries=0).get('emailAddress','')
  if str(mailbox).lower()!=account.lower():return fail('MAILBOX_MISMATCH')
  current=service.users().drafts().get(userId='me',id=draft_id,format='raw').execute(num_retries=0)
  if current.get('id')!=draft_id or 'DRAFT' not in current.get('message',{}).get('labelIds',[]) or 'SENT' in current.get('message',{}).get('labelIds',[]):return fail('DRAFT_NOT_VERIFIED')
  before_data=decode(current['message']['raw']);old,before=inspect(before_data,account,recipient);oldp,oldh,sp,sh=split_signature(before['bodyPlainText'],before['bodyHtml'])
  if not commit:
   if r.get('expectedLetterHash')!=sha(oldp.encode()) or r.get('expectedHtmlHash')!=sha(oldh.encode()) or r.get('expectedSubject')!=before['subject']:return fail('GMAIL_DRAFT_DIFFERS_FROM_LOCAL_SNAPSHOT')
   plain,html,first,candidate=[r.get(k) for k in ['bodyPlainText','bodyHtml','firstName','candidateName']]
   if not all(isinstance(v,str) and v.strip() for v in [plain,html,first,candidate]):return fail('NEW_BODY_IDENTITY')
   if len(plain)>100000 or len(html)>300000 or any('{{' in v or '}}' in v for v in [plain,html]) or MARK in html or SEP in plain or re.search(r'<\s*(script|iframe|object|embed|form|input|meta|link)\b|javascript\s*:',html,re.I):return fail('NEW_BODY_INVALID')
   if plain.splitlines()[0].strip()!='Dear '+first+',' or plain.splitlines()[-1].strip()!=candidate:return fail('GREETING_OR_SIGNOFF_CHANGED')
   new=copy.deepcopy(old);new.get_body(preferencelist=('plain',)).set_content(norm(plain)+(SEP+sp if sp else ''));new.get_body(preferencelist=('html',)).set_content(norm(html)+('<br><br>'+MARK+sh if sh else ''),subtype='html')
   if r.get('updateSubject') is True:
    subject=r.get('subject')
    if not isinstance(subject,str) or not subject.strip() or len(subject)>300 or '\r' in subject or '\n' in subject or '{{' in subject or '}}' in subject:return fail('NEW_SUBJECT_INVALID')
    new.replace_header('Subject',subject)
   data=new.as_bytes();_,proposed=inspect(data,account,recipient)
   if proposed['attachment']!=before['attachment']:return fail('ORIGINAL_CV_CHANGED')
   return {'ok':True,'updated':False,'updateAttempted':False,'sent':False,'draftId':draft_id,'sendingAccount':account,'beforeHash':sha(before_data),'contentHash':sha(data),'raw':encode(data),'before':before,'proposed':proposed}
  if r.get('beforeHash')!=sha(before_data):return fail('GMAIL_DRAFT_CHANGED_AFTER_APPROVAL')
  data=decode(r.get('raw'));_,proposed=inspect(data,account,recipient)
  if r.get('contentHash')!=sha(data) or proposed['attachment']!=before['attachment']:return fail('APPROVED_CONTENT_OR_CV_CHANGED')
  _,_,newsp,newsh=split_signature(proposed['bodyPlainText'],proposed['bodyHtml'])
  if (newsp,newsh)!=(sp,sh):return fail('SIGNATURE_CHANGED')
 except Exception:return fail('DRAFT_UPDATE_PREFLIGHT_FAILED')
 if r['expiresAt']<=now():return fail('UPDATE_APPROVAL_EXPIRED')
 try:
  message={'raw':encode(data)}
  if current.get('message',{}).get('threadId'):message['threadId']=current['message']['threadId']
  response=service.users().drafts().update(userId='me',id=draft_id,body={'id':draft_id,'message':message}).execute(num_retries=0)
  if response.get('id')!=draft_id:raise ValueError('Unconfirmed draft ID')
  check=service.users().drafts().get(userId='me',id=draft_id,format='raw').execute(num_retries=0)
  if check.get('id')!=draft_id or 'DRAFT' not in check.get('message',{}).get('labelIds',[]) or 'SENT' in check.get('message',{}).get('labelIds',[]):raise ValueError('Draft no longer verified')
  _,actual=inspect(decode(check['message']['raw']),account,recipient);mid=check['message'].get('id')
  if not same(actual,proposed) or not isinstance(mid,str) or not mid or mid.lower().startswith('local-'):raise ValueError('Updated contents unconfirmed')
  return {'ok':True,'updated':True,'updateAttempted':True,'sent':False,'draftId':draft_id,'messageId':mid,'contentHash':sha(decode(check['message']['raw'])),'sendingAccount':account}
 except Exception:return {'ok':False,'updated':False,'updateAttempted':True,'sent':False,'unknown':True,'error':'DRAFT_UPDATE_OUTCOME_UNCERTAIN'}
if __name__=='__main__':
 try:
  raw=sys.stdin.buffer.read(LIMIT+1)
  if len(raw)>LIMIT:raise ValueError('Request limit')
  sys.stdout.write(json.dumps(process_update(json.loads(raw.decode('utf-8'))),ensure_ascii=True))
 except Exception:sys.exit(1)
