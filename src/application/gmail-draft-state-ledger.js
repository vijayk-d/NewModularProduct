import { createHash, randomUUID } from 'node:crypto';
export const DRAFT_LEDGER_SCHEMA = `CREATE TABLE IF NOT EXISTS outreach_gmail_draft_operations (
  id TEXT PRIMARY KEY, application_key TEXT NOT NULL, recipient_key TEXT NOT NULL,
  sending_account TEXT NOT NULL, payload TEXT NOT NULL,
  UNIQUE(application_key, recipient_key, sending_account)
);`;
function conflict(message,code='GMAIL_DRAFT_CONFLICT') {const error=new Error(message);error.code=code;error.statusCode=409;throw error;}
const required=(value,label)=>{if(typeof value!=='string'||!value.trim())conflict(`${label} is required.`,'GMAIL_DRAFT_INVALID');return value.trim();};
const address=(value,label)=>{const text=required(value,label);if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text))conflict(`${label} is invalid.`,'GMAIL_DRAFT_INVALID');return text.toLowerCase();};
export function draftSnapshotFingerprint(item) {
  return createHash('sha256').update(JSON.stringify({subject:item.subject,bodyPlainText:item.bodyPlainText,
    bodyHtml:item.bodyHtml||'',attachment:item.attachment||null})).digest('hex');
}
export function createDraftAttemptLedger(db,mirrorQueue=()=>{}) {
  db.exec(DRAFT_LEDGER_SCHEMA);
  const decode=row=>row?JSON.parse(row.payload):null;
  const get=id=>decode(db.prepare('SELECT payload FROM outreach_gmail_draft_operations WHERE id = ?').get(id));
  const find=(applicationKey,recipientKey,sendingAccount)=>decode(db.prepare(`SELECT payload FROM outreach_gmail_draft_operations
    WHERE application_key = ? AND recipient_key = ? AND sending_account = ?`).get(applicationKey,recipientKey,sendingAccount));
  const write=record=>db.prepare('UPDATE outreach_gmail_draft_operations SET payload = ? WHERE id = ?').run(JSON.stringify(record),record.id);
  return {
    find({applicationKey,email,sendingAccount}) {return find(required(applicationKey,'Application key'),address(email,'Recipient email'),address(sendingAccount,'Sending account'));},
    getById(id){return get(required(id,'Draft operation ID'));},
    list(){return db.prepare('SELECT payload FROM outreach_gmail_draft_operations ORDER BY rowid').all().map(decode);},
    claim(item,sendingAccount,{retryFailed=false}={}) {
      const queueId=required(item?.id,'Queue ID'),applicationKey=required(item.applicationKey,'Application key');
      const recipientKey=address(item.email,'Recipient email'),account=address(sendingAccount,'Sending account');
      const subject=required(item.subject,'Subject');if(/[\r\n]/.test(subject))conflict('Subject must be a single line.','GMAIL_DRAFT_INVALID');
      if(!['new','draft_failed'].includes(item.status))conflict('This queue item is not eligible for draft creation.');
      const fingerprint=draftSnapshotFingerprint(item);
      db.exec('BEGIN IMMEDIATE');
      try {
        const previous=find(applicationKey,recipientKey,account);
        if(previous && !(retryFailed===true && previous.status==='failed' && previous.safeToRetry===true)) {
          conflict('A draft operation already exists for this application, recipient and account. Inspect it before any retry.','GMAIL_DRAFT_ALREADY_RESERVED');
        }
        const now=new Date().toISOString();
        const record={id:randomUUID(),queueId,applicationKey,contactId:String(item.contactId||''),recipientKey,sendingAccount:account,
          subject,snapshotFingerprint:fingerprint,status:'reserved',safeToRetry:false,draftId:null,messageId:null,
          createdAt:now,updatedAt:now,history:previous?[...(previous.history||[]),{id:previous.id,status:previous.status,createdAt:previous.createdAt,updatedAt:previous.updatedAt}]:[]};
        if(previous) {
          db.prepare('UPDATE outreach_gmail_draft_operations SET id = ?, payload = ? WHERE id = ?').run(record.id,JSON.stringify(record),previous.id);
        } else {
          db.prepare(`INSERT INTO outreach_gmail_draft_operations (id, application_key, recipient_key, sending_account, payload)
            VALUES (?, ?, ?, ?, ?)`).run(record.id,applicationKey,recipientKey,account,JSON.stringify(record));
        }
        mirrorQueue(record);db.exec('COMMIT');return structuredClone(record);
      } catch(error){db.exec('ROLLBACK');throw error;}
    },
    recordOutcome({operationId,status,draftId=null,messageId=null,safeToRetry=false}={}) {
      required(operationId,'Draft operation ID');
      if(!['drafted','failed','unknown'].includes(status))conflict('Draft outcome must be drafted, failed or unknown.','GMAIL_DRAFT_INVALID');
      let confirmedDraft=null,confirmedMessage=null;
      if(status==='drafted') {
        confirmedDraft=required(draftId,'Confirmed Gmail draft ID');
        if(/^local-/i.test(confirmedDraft))conflict('A simulated draft ID cannot confirm Gmail creation.','GMAIL_DRAFT_INVALID');
        if(messageId!=null && messageId!==''){confirmedMessage=required(messageId,'Gmail message ID');if(/^local-/i.test(confirmedMessage))conflict('A simulated message ID cannot confirm Gmail creation.','GMAIL_DRAFT_INVALID');}
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const previous=get(operationId);if(!previous)conflict('Draft operation is missing or no longer current.');
        if(previous.status==='drafted' && status==='drafted' && previous.draftId===confirmedDraft &&
            (!confirmedMessage || !previous.messageId || previous.messageId===confirmedMessage)) {db.exec('COMMIT');return previous;}
        if(previous.status!=='reserved')conflict('A final or uncertain draft outcome cannot be overwritten.');
        const record={...previous,status,draftId:confirmedDraft,messageId:confirmedMessage,
          safeToRetry:status==='failed'&&safeToRetry===true,updatedAt:new Date().toISOString()};
        write(record);mirrorQueue(record);db.exec('COMMIT');return structuredClone(record);
      } catch(error){db.exec('ROLLBACK');throw error;}
    }
  };
}
