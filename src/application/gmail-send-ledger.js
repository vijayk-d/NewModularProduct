import {randomUUID} from 'node:crypto';
import {messageEditVersion} from './queue-message-editor.js';
const fail=m=>{const e=new Error(m);e.statusCode=409;throw e;};
export function createSendLedger(db,{additionalBlocker=()=>false}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS outreach_gmail_send_attempts(id TEXT PRIMARY KEY,application_key TEXT NOT NULL,recipient_key TEXT NOT NULL,sending_account TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS outreach_one_active_send ON outreach_gmail_send_attempts(application_key,recipient_key,sending_account) WHERE status IN ('reserved','unknown');`);
 const decode=r=>r?JSON.parse(r.payload):null;
 const get=id=>decode(db.prepare('SELECT payload FROM outreach_gmail_send_attempts WHERE id=?').get(id));
 const queue=id=>decode(db.prepare('SELECT payload FROM outreach_queue WHERE id=?').get(id));
 // One pass over the send attempts and the sent history for a whole list, instead of one scan per row.
 function context(account){
  const acct=String(account||'').toLowerCase(),attempts=new Map(),sent=new Set();
  for(const r of db.prepare('SELECT application_key,recipient_key,payload FROM outreach_gmail_send_attempts WHERE sending_account=? ORDER BY rowid DESC').all(acct)){const k=r.application_key+'\n'+r.recipient_key;if(!attempts.has(k))attempts.set(k,[]);attempts.get(k).push(JSON.parse(r.payload));}
  for(const r of db.prepare(`SELECT json_extract(payload,'$.applicationKey') AS a,lower(json_extract(payload,'$.email')) AS e FROM outreach_sent_emails WHERE sending_account=?`).all(acct))sent.add(r.a+'\n'+r.e);
  return {account:acct,attempts,sent};
 }
 function state(item,account,ctx=null){
  const key=item.applicationKey+'\n'+item.email.toLowerCase(),usable=ctx&&ctx.account===account.toLowerCase();
  const records=usable?(ctx.attempts.get(key)||[]):db.prepare('SELECT payload FROM outreach_gmail_send_attempts WHERE application_key=? AND recipient_key=? AND sending_account=? ORDER BY rowid DESC').all(item.applicationKey,item.email.toLowerCase(),account.toLowerCase()).map(decode);
  const legacy=usable?(ctx.sent.has(key)||null):db.prepare(`SELECT id FROM outreach_sent_emails WHERE sending_account=? AND json_extract(payload,'$.applicationKey')=? AND lower(json_extract(payload,'$.email'))=? LIMIT 1`).get(account.toLowerCase(),item.applicationKey,item.email.toLowerCase());
  return {blocked:records.some(r=>['reserved','unknown'].includes(r.status))||additionalBlocker(item),hasSent:Boolean(legacy)||records.some(r=>r.status==='sent'),retryAllowed:records[0]?.status==='failed'&&records[0].safeToRetry===true,last:records[0],count:records.length};
 }
 return {state,context,list:()=>db.prepare('SELECT payload FROM outreach_gmail_send_attempts ORDER BY rowid DESC').all().map(decode),
 claim({queueId,account,version,mode,summary}){
  db.exec('BEGIN IMMEDIATE');try{
   const item=queue(queueId);if(!item||messageEditVersion(item)!==version)fail('Queue changed after send confirmation.');
   const previous=state(item,account);if(previous.blocked)fail('A send is reserved or uncertain. Do not retry blindly.');
   if(!['new','draft','repeat'].includes(mode))fail('Invalid send mode.');
   if(previous.hasSent&&mode!=='repeat')fail('Already sent; explicit Send again is required.');
   if(item.status==='send_failed'&&!previous.retryAllowed)fail('Failure is not recorded safe to retry.');
   const record={id:randomUUID(),queueId,applicationKey:item.applicationKey,recipientKey:item.email.toLowerCase(),sendingAccount:account.toLowerCase(),mode,summary,snapshot:structuredClone(item),status:'reserved',safeToRetry:false,createdAt:new Date().toISOString()};
   db.prepare('INSERT INTO outreach_gmail_send_attempts VALUES(?,?,?,?,?,?)').run(record.id,record.applicationKey,record.recipientKey,record.sendingAccount,record.status,JSON.stringify(record));
   db.prepare('UPDATE outreach_queue SET payload=? WHERE id=?').run(JSON.stringify({...item,status:'send_pending',sendAttemptId:record.id,updatedAt:record.createdAt,lastOutcome:'Send reserved. Do not duplicate.'}),queueId);
   db.exec('COMMIT');return record;
  }catch(e){db.exec('ROLLBACK');throw e;}
 },
 finish({attemptId,status,messageId=null,threadId='',safeToRetry=false}){
  if(!['sent','failed','unknown'].includes(status))fail('Invalid send outcome.');
  if(status==='sent'&&(typeof messageId!=='string'||!messageId||/^local-/i.test(messageId)))fail('Confirmed Gmail message ID required.');
  db.exec('BEGIN IMMEDIATE');try{
   const old=get(attemptId);if(!old||old.status!=='reserved')fail('Send attempt is missing or final.');
   const now=new Date().toISOString(),record={...old,status,messageId,threadId,safeToRetry:status==='failed'&&safeToRetry===true,updatedAt:now};
   if(status==='sent'){
    const duplicate=decode(db.prepare('SELECT payload FROM outreach_sent_emails WHERE sending_account=? AND message_id=?').get(old.sendingAccount,messageId));
    if(duplicate&&duplicate.queueId!==old.queueId)fail('Message ID already belongs to another queue item.');
    if(!duplicate){const sent={...old.snapshot,id:randomUUID(),queueId:old.queueId,sendingAccount:old.sendingAccount,messageId,threadId,sentAt:now,status:'sent',action:old.mode==='repeat'?'send_again':old.mode==='draft'?'send_draft':'send',subject:old.summary.subject,bodyPlainText:old.summary.bodyPlainText,bodyHtml:old.summary.bodyHtml,contentHash:old.summary.contentHash,sendAttemptId:attemptId};db.prepare('INSERT INTO outreach_sent_emails VALUES(?,?,?,?)').run(sent.id,sent.sendingAccount,messageId,JSON.stringify(sent));}
   }
   db.prepare('UPDATE outreach_gmail_send_attempts SET status=?,payload=? WHERE id=?').run(status,JSON.stringify(record),attemptId);
   const item=queue(old.queueId);if(item)db.prepare('UPDATE outreach_queue SET payload=? WHERE id=?').run(JSON.stringify({...item,status:status==='sent'?'sent':status==='failed'?'send_failed':'send_unknown',updatedAt:now,sentAt:status==='sent'?now:item.sentAt,messageId:status==='sent'?messageId:item.messageId,lastOutcome:status==='sent'?`Sent messageId: ${messageId}`:status==='failed'?'Send not attempted. Explicit retry is available.':'Send uncertain. Inspect Gmail; do not retry.'}),old.queueId);
   db.exec('COMMIT');return record;
  }catch(e){db.exec('ROLLBACK');throw e;}
 }};
}
