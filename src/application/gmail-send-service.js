import {assertFrozenDraftPalette} from './frozen-draft-palette.js';
import {applyGmailSignature,readGmailSignature,letterWithoutSignature} from './gmail-message-presentation.js';
import {recipientFirstName,assertResolvedMessage} from './outreach-recipient-identity.js';
import {randomUUID,createHash} from 'node:crypto';import {realpath,stat,readFile} from 'node:fs/promises';import path from 'node:path';
import {prepareDraftSnapshot} from './outreach-message-snapshot.js';import {messageEditVersion} from './queue-message-editor.js';import {extractOutreachExperienceBody} from './compose-outreach-letter.js';import {runGmailSendWorker} from './gmail-send-worker-runner.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
function fail(m,code='SEND_BLOCKED',statusCode=409){const e=new Error(m);e.code=code;e.statusCode=statusCode;throw e;}
// One-click send: development on 3000 or production (switched on via /settings/features). Never verification.
export function oneClickEnvironment(env=process.env){const mode=env.NMP_ENV||'development';return (mode==='development'&&String(env.PORT||'3000')==='3000')||mode==='production';}
export function createGmailSendService({repository,mailboxPort,env=process.env,runner=runGmailSendWorker,clock=()=>Date.now(),signatureReader=readGmailSignature}={}){
 const tickets=new Map();
 function getStatus(){const m=mailboxPort.getStatus(),flags=['ENABLE_GMAIL','ENABLE_GMAIL_SENDING'].every(k=>String(env[k]||'').trim().toLowerCase()==='true'),ready=Boolean(m.mailboxCheckEnabled&&m.configurationReady&&repository&&['getSendState','claimSendAttempt','finishSendAttempt'].every(k=>typeof repository[k]==='function'));return {sendingEnabled:flags&&ready,oneClickSendingEnabled:flags&&ready&&oneClickEnvironment(env)&&String(env.ENABLE_ONE_CLICK_SEND||'')==='true',configurationReady:ready,configuredMailbox:m.configuredFromAddress||'',reason:!flags?'Sending disabled. Enable both ENABLE_GMAIL and ENABLE_GMAIL_SENDING explicitly.':!ready?'Configure mailbox checking, OAuth and send storage.':'Sending ready; each email requires explicit confirmation.'};}
 function gate(){const s=getStatus();if(!s.sendingEnabled)fail(s.reason,'SEND_DISABLED',403);return s.configuredMailbox;}
 function modeFor(item,account){
  const s=repository.getSendState(item,account);
  if(s.blocked||['send_pending','send_unknown','draft_unknown','draft_creating'].includes(item.status))fail('Operation pending or uncertain. Check Gmail; do not retry blindly.','SEND_UNKNOWN');
  if(item.status==='send_failed'&&!s.retryAllowed)fail('This failure is not confirmed safe to retry.');
  if(s.hasSent)return {mode:'repeat',state:s};
  if(item.status==='sent')fail('Sent state has no matching confirmed history. Inspect it first.');
  if(item.status==='drafted'||(item.status==='send_failed'&&s.last?.mode==='draft')){
   if(!item.draftId||String(item.sendingAccount||'').toLowerCase()!==account.toLowerCase())fail('Draft ID/mailbox does not match the configured sender.');return {mode:'draft',state:s};
  }
  if(!['new','send_failed','draft_failed'].includes(item.status))fail('This state is not eligible for sending.');
  const d=repository.findDraftOperation?.({applicationKey:item.applicationKey,email:item.email,sendingAccount:account});
  if(d&&!(d.status==='failed'&&d.safeToRetry===true))fail('Resolve the existing draft operation before sending a new message.');return {mode:'new',state:s};
 }
 function eligibility(item,account){try{const {mode,state}=modeFor(item,account);return {eligible:true,mode,label:state.retryAllowed?'Retry send':mode==='repeat'?'Send again':mode==='draft'?'Send draft':'Send email'};}catch(e){return {eligible:false,reason:e.message};}}
 async function withCV(item){
  const draft=prepareDraftSnapshot({...item,status:'new'}),relative=String(draft.attachment?.relativePath||'').replaceAll('\\','/');
  if(!relative||/^(?:\/|[A-Za-z]:)/.test(relative))fail('A relative PDF/DOCX CV is required.','SEND_CV');
  try{const root=await realpath(path.resolve(String(env.CV_FOLDER||''))),file=await realpath(path.resolve(root,relative)),within=path.relative(root,file);
   if(!within||within==='..'||within.startsWith('..'+path.sep)||path.isAbsolute(within)||!['.pdf','.docx'].includes(path.extname(file).toLowerCase()))fail('CV is outside its configured folder.','SEND_CV');
   const info=await stat(file);if(!info.isFile()||info.size>20*1024*1024)fail('CV unavailable or exceeds 20 MiB.','SEND_CV');
   const bytes=await readFile(file);if(bytes.length>20*1024*1024)fail('CV exceeds 20 MiB.','SEND_CV');draft.attachment={...draft.attachment,sha256:hash(bytes),sizeBytes:bytes.length};return draft;
  }catch(e){if(e.statusCode)throw e;fail('Selected CV could not be verified.','SEND_CV');}
 }
 return {getStatus,eligibility,cancel({ticket}={}){return {cancelled:tickets.delete(ticket),sent:false};},
 async prepare({queueId,expectedVersion,expectedAccount,expectedRecipient,expectedMode,expectedDraftId}={}){
  const account=gate();if(typeof queueId!=='string'||!queueId)fail('Choose one explicit queue item.');const item=repository.getById(queueId);if(!item)fail('Queue item no longer exists.');
  const {mode}=modeFor(item,account),version=messageEditVersion(item);
  const bound=[expectedVersion,expectedAccount,expectedRecipient,expectedMode,expectedDraftId].some(v=>v!==undefined);
  if(bound&&!getStatus().oneClickSendingEnabled)fail('One-click sending is disabled.','SEND_ONE_CLICK_DISABLED',403);
  if(bound&&(!/^[a-f0-9]{64}$/.test(expectedVersion||'')||expectedVersion!==version||String(expectedAccount||'').toLowerCase()!==account.toLowerCase()||String(expectedRecipient||'').toLowerCase()!==item.email.toLowerCase()||expectedMode!==mode||String(expectedDraftId||'')!==String(item.draftId||'')))fail('Selected message/sender/action changed after the Send click. Refresh/review.','SEND_INTENT_CHANGED');
  const draft=mode==='draft'?null:await applyGmailSignature(await withCV(item),{account,env,signatureReader});
  let r;try{r=await runner({payload:{action:'prepare',mode,expectedAddress:account,recipient:item.email,draftId:mode==='draft'?item.draftId:undefined,draft}});}catch{fail('Preparation failed; nothing sent. Check Python/OAuth setup.','SEND_PREFLIGHT',503);}
  if(r.ok!==true||r.sent!==false||r.sendingAttempted!==false||String(r.sendingAccount||'').toLowerCase()!==account.toLowerCase())fail('Preparation failed; nothing sent: '+(r.error||'invalid receipt'),'SEND_PREFLIGHT');
  const summary=r.summary;if(!summary||typeof r.raw!=='string'||summary.recipient?.toLowerCase()!==item.email.toLowerCase()||hash(Buffer.from(r.raw,'base64url'))!==summary.contentHash)fail('Invalid prepared message receipt.');
  if(mode==='draft')assertFrozenDraftPalette(item,summary.bodyHtml);
  const plain=letterWithoutSignature(summary.bodyPlainText,summary.bodyHtml),first=recipientFirstName(item),candidate=String(env.CANDIDATE_DISPLAY_NAME||'Vijay DAFAL').trim();
  assertResolvedMessage(summary.bodyPlainText,summary.bodyHtml,summary.subject);
  if(!first||!plain.startsWith(`Dear ${first},`)||!plain.endsWith(candidate))fail('Prepared/Gmail greeting or signoff does not match the resolved identity.','SEND_IDENTITY');
  if(/^Candidate$|\|\s*Candidate\s*$/i.test(String(summary.subject||'')))fail('Correct the generic Candidate subject.','SEND_SUBJECT');
  if(/\u00c2\u00a3|\u00e2\u20ac\u2122|\u00e2\u0080\u0099/.test(plain+String(summary.bodyHtml||'')))fail('Encoding corruption detected (Â£ / â€™). Correct the queued message or actual Gmail draft before sending.','SEND_ENCODING');
  extractOutreachExperienceBody(plain,['micro1']);
  if(bound&&summary.subject!==prepareDraftSnapshot({...item,status:'new'}).subject)fail('Prepared subject differs from reviewed queue. Review/resynchronise before sending.','SEND_INTENT_CHANGED');
  if(bound&&mode==='draft'){
   const reviewed=await withCV(item),normal=s=>String(s||'').replace(/\s+/g,' ').trim();
   if(normal(plain)!==normal(letterWithoutSignature(reviewed.bodyPlainText,reviewed.bodyHtml))||!Array.isArray(summary.attachments)||summary.attachments.length!==1||summary.attachments[0].sha256!==reviewed.attachment.sha256)fail('Gmail draft body or CV differs from reviewed queue. Review/resynchronise; nothing sent.','SEND_INTENT_CHANGED');
  }
  if(messageEditVersion(repository.getById(queueId)||{})!==version)fail('Queue changed while preparing; review again.');
  for(const [id,t] of tickets)if(t.expiresAt<=clock())tickets.delete(id);
  if(/* outreach-bulk-controls-v1 */ tickets.size>=50||[...tickets.values()].reduce((n,t)=>n+t.raw.length,0)+r.raw.length>96*1024*1024)fail('Too many pending confirmations; cancel or wait for expiry.');
  const ticket=randomUUID(),expiresAt=clock()+300000;tickets.set(ticket,{queueId,account,mode,version,raw:r.raw,summary,expiresAt,draftId:mode==='draft'?item.draftId:null,cvHash:draft?.attachment.sha256});
  return {ticket,expiresAt,mode,sendingAccount:account,recipient:item.email,emailVerified:item.verified===true,emailSource:item.emailSource||'unknown',subject:summary.subject,bodyPlainText:summary.bodyPlainText,bodyHtml:summary.bodyHtml,attachments:summary.attachments,contentHash:summary.contentHash,sent:false};
 },
 async reserveScheduled({ticket,confirmed=false,repeatApproved=false}={}){
  const account=gate();if(String(env.ENABLE_CLOUD_SCHEDULING||'')!=='true'||env.NMP_ENV!=='development'||env.NMP_ALLOW_DEVELOPMENT_INTEGRATIONS!=='true')fail('Development scheduling is disabled.','SCHEDULE_DISABLED',403);
  if(confirmed!==true)fail('Confirm the exact scheduled send.','SEND_CONFIRMATION',400);
  const a=tickets.get(ticket);if(!a)fail('Confirmation missing, consumed or expired.');tickets.delete(ticket);
  if(a.expiresAt<=clock()||a.account.toLowerCase()!==account.toLowerCase())fail('Confirmation expired or sender changed.');
  if(a.mode==='repeat'&&repeatApproved!==true)fail('Explicit Send again approval is required.','SEND_CONFIRMATION',400);
  if(typeof a.raw!=='string'||a.raw.length>4*1024*1024||!/^[A-Za-z0-9_-]+={0,2}$/.test(a.raw)||hash(Buffer.from(a.raw,'base64url'))!==a.summary.contentHash)fail('Frozen MIME invalid or exceeds scheduling size limit.');
  const item=repository.getById(a.queueId);if(!item||messageEditVersion(item)!==a.version)fail('Queue changed after confirmation.');
  if(modeFor(item,account).mode!==a.mode)fail('Send action changed; prepare again.');
  if(a.cvHash&&(await withCV(item)).attachment.sha256!==a.cvHash)fail('CV bytes changed after confirmation.');
  if(a.expiresAt<=clock()||gate().toLowerCase()!==account.toLowerCase())fail('Confirmation expired or sender changed.');
  const operation=repository.claimSendAttempt({queueId:item.id,account,version:a.version,mode:a.mode,summary:a.summary});
  return {operation,queueId:item.id,account,raw:a.raw,summary:structuredClone(a.summary),sent:false};
 },
 async commit({ticket,confirmed=false,repeatApproved=false}={}){
  const account=gate();if(confirmed!==true)fail('Confirm the exact prepared send.','SEND_CONFIRMATION',400);
  const a=tickets.get(ticket);if(!a)fail('Confirmation missing, consumed or expired.');tickets.delete(ticket);
  if(a.expiresAt<=clock()||a.account.toLowerCase()!==account.toLowerCase())fail('Confirmation expired or sender changed.');
  if(a.mode==='repeat'&&repeatApproved!==true)fail('Explicit Send again approval is required.','SEND_CONFIRMATION',400);
  const item=repository.getById(a.queueId);if(!item||messageEditVersion(item)!==a.version)fail('Queue changed after confirmation.');
  if(modeFor(item,account).mode!==a.mode)fail('Send action changed; prepare again.');
  if(a.cvHash&&(await withCV(item)).attachment.sha256!==a.cvHash)fail('CV bytes changed after confirmation.');
  if(a.expiresAt<=clock())fail('Confirmation expired.');
  const op=repository.claimSendAttempt({queueId:item.id,account,version:a.version,mode:a.mode,summary:a.summary});
  let r;try{r=await runner({payload:{action:'commit',mode:a.mode,confirmed:true,expiresAt:a.expiresAt,expectedAddress:account,recipient:item.email,draftId:a.draftId,raw:a.raw,expectedHash:a.summary.contentHash}});}catch{repository.finishSendAttempt({attemptId:op.id,status:'unknown'});fail('Send outcome uncertain. Check Gmail; do not retry.','SEND_UNKNOWN',503);}
  if(r.ok===true&&r.sent===true&&r.sendingAttempted===true&&typeof r.messageId==='string'&&r.messageId&&!/^local-/i.test(r.messageId)&&String(r.sendingAccount||'').toLowerCase()===account.toLowerCase()){
   try{repository.finishSendAttempt({attemptId:op.id,status:'sent',messageId:r.messageId,threadId:r.threadId||''});}
   catch{return {sent:true,persistenceConfirmed:false,messageId:r.messageId,error:'Gmail confirmed sending, but history persistence failed. Keep this ID; do not retry.'};}
   return {sent:true,persistenceConfirmed:true,messageId:r.messageId,threadId:r.threadId||'',sendingAccount:account};
  }
  const definite=r.ok===false&&r.sent===false&&r.sendingAttempted===false;repository.finishSendAttempt({attemptId:op.id,status:definite?'failed':'unknown',safeToRetry:definite});fail(definite?'Sending was not attempted: '+(r.error||'preflight failed'):'Send outcome uncertain. Check Gmail; do not retry.',definite?'SEND_NOT_ATTEMPTED':'SEND_UNKNOWN',503);
 }};
}

