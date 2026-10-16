"""Repair ONLY validated known indentation corruptions in Gmail workers; dry run first."""
import argparse,ast,hashlib,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone
TARGETS=['python-worker/gmail_draft_worker.py','python-worker/gmail_confirmed_draft_worker.py','python-worker/gmail_send_worker.py']
def sha(b):return hashlib.sha256(b).hexdigest()
def safe(root,name):
 p=root/name
 if not p.resolve().is_relative_to(root):raise RuntimeError('Path leaves project.')
 q=p
 while q!=root:
  if q.is_symlink():raise RuntimeError('Refusing symlink.')
  q=q.parent
 return p

def repair(name,text):
 original=text
 rules=[]
 if name.endswith('gmail_draft_worker.py'):
  rules=[("            details.append({'queueId': draft['queueId'], 'status': 'unknown', 'draftId': None,\n                    'messageId': None, 'error': 'Provider returned no draft ID. Check Gmail before retrying.'})\n            else:\n    details.append({'queueId': draft['queueId'], 'status': 'drafted',", "            details.append({'queueId': draft['queueId'], 'status': 'unknown', 'draftId': None,\n                    'messageId': None, 'error': 'Provider returned no draft ID. Check Gmail before retrying.'})\n            else:\n                details.append({'queueId': draft['queueId'], 'status': 'drafted',")]
 elif name.endswith('gmail_confirmed_draft_worker.py'):
  rules=[("        parts = list(message.iter_attachments())\n      if not isinstance(expected_hash, str) or len(parts) != 1 or hashlib.sha256(parts[0].get_payload(decode=True)).hexdigest() != expected_hash:", "        parts = list(message.iter_attachments())\n        if not isinstance(expected_hash, str) or len(parts) != 1 or hashlib.sha256(parts[0].get_payload(decode=True)).hexdigest() != expected_hash:"),("    try:\n    raw = base64.urlsafe_b64encode(message.as_bytes()).decode('ascii')", "    try:\n        raw = base64.urlsafe_b64encode(message.as_bytes()).decode('ascii')")]
 elif name.endswith('gmail_send_worker.py'):
  rules=[("        if request['action'] == 'prepare':\n            if mode == 'draft':", "        if request['action'] == 'prepare':\n            if mode == 'draft':"),("                result = service.users().drafts().get", "                result = service.users().drafts().get"),("            if mode == 'draft':\n                if not isinstance(request.get('draftId'), str) or not request['draftId']:\n                    return failed('DRAFT_ID_MISSING')\n                result = service.users().drafts().get(userId='me', id=request['draftId'], format='raw').execute(num_retries=0)\n                raw= result.get('message', {}).get('raw', '')\n            else:\n                draft = request.get('draft', {})\n         message = _build_message(draft, account)\n                parts = list(message.iter_attachments())\n     if len(parts) != 1 or hashlib.sha256(parts[0].get_payload(decode=True)).hexdigest() != (draft.get('attachment') or{}).get('sha256'):\n                    return failed('CV_BYTES_CHANGED')\n                raw = base64.urlsafe_b64encode(message.as_bytes()).decode('ascii')", "            if mode == 'draft':\n                if not isinstance(request.get('draftId'), str) or not request['draftId']:\n                    return failed('DRAFT_ID_MISSING')\n                result = service.users().drafts().get(userId='me', id=request['draftId'], format='raw').execute(num_retries=0)\n                raw=result.get('message',{}).get('raw','')\n            else:\n                draft = request.get('draft', {})\n                message = _build_message(draft, account)\n                parts = list(message.iter_attachments())\n                if len(parts) != 1 or hashlib.sha256(parts[0].get_payload(decode=True)).hexdigest() != (draft.get('attachment') or {}).get('sha256'):\n                    return failed('CV_BYTES_CHANGED')\n                raw = base64.urlsafe_b64encode(message.as_bytes()).decode('ascii')"),("        else:\n            if request.get('confirmed') is not True:\n    return failed('CONFIRMATION_REQUIRED')", "        else:\n            if request.get('confirmed') is not True:\n                return failed('CONFIRMATION_REQUIRED')"),("        if len(attachments) != 1 or attachments[0]['type'] != 'application/pdf' or attachments[0]['sizeBytes'] > 20 * 1024 * 1024:\n    return failed('ONE_PDF_CV_REQUIRED')", "        if len(attachments) != 1 or attachments[0]['type'] != 'application/pdf' or attachments[0]['sizeBytes'] > 20 * 1024 * 1024:\n            return failed('ONE_PDF_CV_REQUIRED')"),("        if request['action'] == 'prepare':\n            return {'ok': True, 'sent': False, 'sendingAttempted': False, 'sendingAccount': mailbox, 'raw': raw, 'summary': summary}\n        if request.get('expectedHash') != digest:", "        if request['action'] == 'prepare':\n            return {'ok': True, 'sent': False, 'sendingAttempted': False, 'sendingAccount': mailbox, 'raw': raw, 'summary': summary}\n        if request.get('expectedHash') != digest:"),("        return {'ok': True, 'sent': True, 'sendingAttempted': True, 'sendingAccount': mailbox, 'messageId': key, 'threadId': response.get('threadId', '')}\n    except Exception:\n        return {'ok': False, 'sent': False, 'sendingAttempted': True, 'unknown': True, 'error': 'SEND_OUTCOME_UNCERTAIN'}", "        return {'ok': True, 'sent': True, 'sendingAttempted': True, 'sendingAccount': mailbox, 'messageId': key, 'threadId': response.get('threadId', '')}\n    except Exception:\n        return {'ok': False, 'sent': False, 'sendingAttempted': True, 'unknown': True, 'error': 'SEND_OUTCOME_UNCERTAIN'}")]
 count=0
 for old,new in rules:
  if old not in text:
   # Already repaired fragments are accepted only if the known equivalent exists.
   if name.endswith('gmail_draft_worker.py') and '            else:\n                details.append' in text:continue
   if name.endswith('gmail_confirmed_draft_worker.py') and '        if not isinstance(expected_hash, str)' in text and '    try:\n        raw = base64' in text:continue
   if name.endswith('gmail_send_worker.py'):continue
   raise RuntimeError('Known corruption pattern not found in '+name+'; preserve file and inspect locally.')
  text=text.replace(old,new,1);count+=1
 if name.endswith('gmail_send_worker.py'):
  # Repair only indentation anomalies with exact known semantic lines, then require full Python parse.
  repairs=[('        ifrequest[\'action\']',"        if request['action']"),('         message = _build_message','                message = _build_message'),('     if len(parts) != 1','                if len(parts) != 1'),('            return failed(\'CONFIRMATION_REQUIRED\')','                return failed(\'CONFIRMATION_REQUIRED\')'),('    return failed(\'ONE_PDF_CV_REQUIRED\')',"            return failed('ONE_PDF_CV_REQUIRED')"),("   raise ValueError('Unconfirmed ID')","            raise ValueError('Unconfirmed ID')")]
  for old,new in repairs:
   if old in text:text=text.replace(old,new,1);count+=1
 try:ast.parse(text,filename=name)
 except SyntaxError as e:raise RuntimeError(f'{name} still has a syntax error at {e.lineno}:{e.offset}; no edit applied.') from e
 return text,count,text!=original

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--apply',action='store_true');a=p.parse_args();root=a.root.resolve();plans=[]
 for name in TARGETS:
  path=safe(root,name)
  if not path.is_file():raise RuntimeError('Worker missing: '+name)
  old=path.read_bytes();text=old.decode('utf-8-sig');new,count,changed=repair(name,text)
  if changed:print('PROPOSED indentation-only repair: '+name+' ('+str(count)+' known edits)')
  data=new.encode('utf-8')
  if old.startswith(b'\xef\xbb\xbf'):data=b'\xef\xbb\xbf'+data
  plans.append((name,path,old,data))
 if not a.apply:print('Dry run only: all three workers now parse with the exact known syntax repairs. No files changed.');return
 folder=root/'var/maintenance/backups'/('gmail-worker-syntax-repair-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));folder.mkdir(parents=True,exist_ok=False)
 for name,path,old,data in plans:
  backup=folder/name;backup.parent.mkdir(parents=True,exist_ok=True);backup.write_bytes(old)
 written=[]
 try:
  for name,path,old,data in plans:
   if path.read_bytes()!=old:raise RuntimeError('Worker changed before write: '+name)
   written.append((path,old,data));path.write_bytes(data)
  for name,path,_,_ in plans:ast.parse(path.read_text(encoding='utf-8-sig'),filename=name)
 except Exception:
  for path,old,data in reversed(written):
   if path.read_bytes()==data:path.write_bytes(old)
  raise
 print('GMAIL WORKER SYNTAX REPAIR INSTALLED; backup: '+str(folder))
 print('No credentials loaded, no Gmail/provider call, no send/draft/update, no ledger change. Run Python unit tests before any mailbox operation.')
if __name__=='__main__':
 try:main()
 except Exception as e:raise SystemExit('ERROR: '+str(e))
