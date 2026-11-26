import { applyGmailSignature,readGmailSignature } from './gmail-message-presentation.js';
import { gmailDraftConfigurationDiagnostics } from './gmail-runtime-diagnostics.js';
import { randomUUID,createHash } from 'node:crypto';
import { readFile,realpath,stat } from 'node:fs/promises';
import path from 'node:path';
import { prepareDraftSnapshot } from './outreach-message-snapshot.js';
import { normalizeSubject } from './review-subject.js';
import { extractOutreachExperienceBody } from './compose-outreach-letter.js';
import { draftSnapshotFingerprint } from './gmail-draft-state-ledger.js';
import { runGmailDraftWorker } from './gmail-draft-worker-runner.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
function fail(message,code,statusCode=409){const error=new Error(message);error.code=code;error.statusCode=statusCode;throw error;}
export function createConfirmedGmailDraftService({repository,mailboxPort,env=process.env,runner=runGmailDraftWorker,clock=()=>Date.now(),signatureReader=readGmailSignature,linkTracker=null}={}) {
  const tickets=new Map();
  function getStatus(){const mailbox=mailboxPort.getStatus();const diagnostics=gmailDraftConfigurationDiagnostics({env,mailbox,repository});return {
    draftCreationEnabled:diagnostics.checks.find(check=>check.name==='draftCreationFlag').ok,
    configurationReady:diagnostics.configurationReady,configuredMailbox:mailbox.configuredFromAddress||'',sendingEnabled:false,
    ...diagnostics};}
  function gate(){const status=getStatus();if(!status.draftCreationEnabled)fail('Gmail draft creation is disabled.','GMAIL_DRAFT_DISABLED',403);
    if(!status.configurationReady)fail('Mailbox checking, OAuth, CV_FOLDER and draft ledger must be configured.','GMAIL_DRAFT_CONFIGURATION',503);return status;}
  async function prepared(queueId,retryFailed=false){
    const item=repository.getById(queueId);if(!item||(item.status!=='new'&&!(retryFailed===true&&item.status==='draft_failed')))fail('Select one new queue item. Existing or uncertain operations must not be retried blindly.','GMAIL_DRAFT_ITEM');
    const draft=prepareDraftSnapshot({...item,status:'new'});draft.subject=normalizeSubject(draft.subject);
    if(/\|\s*Candidate\s*$|^Candidate$/i.test(draft.subject))fail('This subject still contains the generic Candidate marker. Correct it and requeue explicitly.','GMAIL_DRAFT_SUBJECT');
    const candidate=String(env.CANDIDATE_DISPLAY_NAME||'Vijay DAFAL').trim();
    const expectedGreeting = `Dear ${draft.recipient.firstname},`;
    const greetingMatches =
      draft.bodyPlainText.startsWith(expectedGreeting);
    const signoffMatches =
      draft.bodyPlainText.endsWith(candidate);
    
    if (!greetingMatches || !signoffMatches) {
      console.warn(
        `[GMAIL_DRAFT_IDENTITY]\n${JSON.stringify({
          queueId: draft.queueId,
          greetingMatches,
          signoffMatches,
          expectedGreeting,
          actualFirstLine: draft.bodyPlainText.split(/\r?\n/)[0],
          expectedCandidate: candidate,
          actualLastLine: draft.bodyPlainText.split(/\r?\n/).at(-1)
        }, null, 2)}`
      );
    
      fail(
        'Queued greeting or candidate signoff does not match the resolved identity. Requeue the reviewed letter.',
        'GMAIL_DRAFT_IDENTITY'
      );
    }
    extractOutreachExperienceBody(draft.bodyPlainText,['micro1']);
    if(!draft.attachment?.relativePath)fail('A selected CV attachment is required.','GMAIL_DRAFT_ATTACHMENT');
    const relative=String(draft.attachment.relativePath).replaceAll('\\','/');
    if(/^(?:\/|[A-Za-z]:)/.test(relative))fail('CV attachment must be relative to CV_FOLDER.','GMAIL_DRAFT_ATTACHMENT');
    try {
    const tailored=draft.attachment.root==='tailored';
    const root=await realpath(path.resolve(String((tailored?env.TAILORED_CV_FOLDER:env.CV_FOLDER)||'')));
    const file=await realpath(path.resolve(root,relative));
    const within=path.relative(root,file);
    if(!within||within==='..'||within.startsWith('..'+path.sep)||path.isAbsolute(within)||!(tailored?['.pdf']:['.pdf','.docx']).includes(path.extname(file).toLowerCase()))fail('Selected CV is outside CV_FOLDER or is not a PDF/DOCX.','GMAIL_DRAFT_ATTACHMENT');
    const info=await stat(file);if(!info.isFile()||info.size>20*1024*1024)fail('Selected CV is missing or exceeds 20 MiB.','GMAIL_DRAFT_ATTACHMENT');
    const bytes=await readFile(file);if(bytes.length>20*1024*1024)fail('Selected CV exceeds 20 MiB.','GMAIL_DRAFT_ATTACHMENT');if(tailored&&hash(bytes)!==draft.attachment.sha256)fail('The tailored CV PDF changed after it was queued. Remove and requeue.','GMAIL_DRAFT_ATTACHMENT');draft.attachment={...draft.attachment,sha256:hash(bytes),sizeBytes:bytes.length};
    const signedOnly=await applyGmailSignature(draft,{account:getStatus().configuredMailbox,env,signatureReader});
    // Link-click tracking (off unless ENABLE_LINK_TRACKING=true): same ids every time, so the fingerprint is stable.
    const signed=linkTracker?await linkTracker.track(signedOnly,item):signedOnly;
    return {item,draft:signed,fingerprint:hash(JSON.stringify(signed))};
    } catch(error){if(error?.statusCode)throw error;fail('Selected CV could not be read or verified. Check CV_FOLDER and requeue if needed.','GMAIL_DRAFT_ATTACHMENT',400);}
  }
  function existing(item,account){return repository.findDraftOperation({applicationKey:item.applicationKey,email:item.email,sendingAccount:account});}
  async function verify(account){const result=await mailboxPort.check({confirmed:true,expectedAddress:account});
    if(result.ok!==true||result.mailboxMatch!==true||result.mailbox.toLowerCase()!==account.toLowerCase())fail('Authenticated mailbox does not match the approved sender.','GMAIL_DRAFT_MAILBOX');}
  const service={getStatus,async draftOne({queueId,confirmed=false,retryFailed=false}={}) {
    if(confirmed!==true)fail('Confirm the Draft action.','GMAIL_DRAFT_CONFIRMATION',400);
    const preview=await service.preview({queueId,confirmed:true,retryFailed});
    return service.create({ticket:preview.ticket,confirmed:true});
  },async preview({queueId,confirmed=false,retryFailed=false}={}){
    const status=gate();if(confirmed!==true||typeof queueId!=='string'||!queueId)fail('Confirm review of one explicit queue item.','GMAIL_DRAFT_CONFIRMATION',400);
    const value=await prepared(queueId,retryFailed);const previous=existing(value.item,status.configuredMailbox);if(previous&&!(retryFailed===true&&previous.status==='failed'&&previous.safeToRetry===true))fail('A draft operation already exists for this application, recipient and mailbox.','GMAIL_DRAFT_DUPLICATE');
    await verify(status.configuredMailbox);
    for(const [key,value] of tickets)if(value.expiresAt<clock())tickets.delete(key);
    if(tickets.size>=100)fail('Too many outstanding previews. Wait for expiry or restart before reviewing again.','GMAIL_DRAFT_PREVIEW_LIMIT');
    const ticket=randomUUID(),expiresAt=clock()+5*60*1000;
    tickets.set(ticket,{queueId,account:status.configuredMailbox,fingerprint:value.fingerprint,expiresAt,retryFailed:retryFailed===true});
    return {ticket,expiresAt,sendingAccount:status.configuredMailbox,draft:value.draft,created:false,sent:false};
  },async create({ticket,confirmed=false}={}){
    const status=gate();if(confirmed!==true)fail('Confirm this exact draft preview before creation.','GMAIL_DRAFT_CONFIRMATION',400);
    const approved=tickets.get(ticket);if(!approved)fail('Preview is missing, consumed or expired. An app restart also clears it. Review the queue item again.','GMAIL_DRAFT_TICKET');
    tickets.delete(ticket);
    if(approved.expiresAt<clock()||approved.account.toLowerCase()!==status.configuredMailbox.toLowerCase())fail('Preview expired or sender changed. Review again.','GMAIL_DRAFT_TICKET');
    const value=await prepared(approved.queueId,approved.retryFailed);
    if(value.fingerprint!==approved.fingerprint)fail('Message or CV bytes changed after preview. Review again.','GMAIL_DRAFT_CHANGED');
    const previous=existing(value.item,approved.account);if(previous&&!(approved.retryFailed===true&&previous.status==='failed'&&previous.safeToRetry===true))fail('Draft creation is already reserved or recorded.','GMAIL_DRAFT_DUPLICATE');
    await verify(approved.account);
    const final=await prepared(approved.queueId,approved.retryFailed);if(final.fingerprint!==approved.fingerprint)fail('Message or CV changed during account verification. Review again.','GMAIL_DRAFT_CHANGED');
    if(approved.expiresAt<clock())fail('Preview expired during account verification. Review again.','GMAIL_DRAFT_TICKET');
    const operation=repository.claimDraftOperation({queueId:approved.queueId,sendingAccount:approved.account,retryFailed:approved.retryFailed});
    if(operation.snapshotFingerprint!==draftSnapshotFingerprint(final.item)){repository.recordDraftOutcome({operationId:operation.id,status:'failed',safeToRetry:true});fail('Queue snapshot changed during reservation. No creation attempted.','GMAIL_DRAFT_CHANGED');}
    let result;
    try {result=await runner({workerMode:'confirmed',payload:{action:'draft',expectedAddress:approved.account,drafts:[final.draft]}});}
    catch {repository.recordDraftOutcome({operationId:operation.id,status:'unknown'});fail('Draft outcome is uncertain. Check Gmail; this operation is locked against retry.','GMAIL_DRAFT_UNKNOWN',503);}
    const detail=result?.details?.[0];
    const verified=result?.sent===0&&result?.profileVerified===true&&typeof result.sendingAccount==='string'&&result.sendingAccount.toLowerCase()===approved.account.toLowerCase();
    if(detail?.status==='drafted'&&verified&&detail.queueId===approved.queueId&&typeof detail.draftId==='string'&&detail.draftId&&!/^local-/i.test(detail.draftId)) {
      try {
        const record=repository.recordDraftOutcome({operationId:operation.id,status:'drafted',draftId:detail.draftId,messageId:detail.messageId||null});
        return {created:true,sent:false,queueId:approved.queueId,operationId:record.id,sendingAccount:approved.account,draftId:record.draftId,messageId:record.messageId};
      } catch {
        return {created:true,persistenceConfirmed:false,sent:false,queueId:approved.queueId,operationId:operation.id,sendingAccount:approved.account,
          draftId:detail.draftId,messageId:detail.messageId||null,error:'Gmail confirmed creation, but persistence failed. Do not retry; keep these IDs and inspect the ledger.'};
      }
    }
    const definite=detail?.status==='failed'&&detail.creationAttempted===false;
    repository.recordDraftOutcome({operationId:operation.id,status:definite?'failed':'unknown',safeToRetry:definite});
    fail(definite?'Draft creation was not attempted. Correct setup; no automatic retry is performed.':'Draft outcome is uncertain. Inspect Gmail before any recovery.',definite?'GMAIL_DRAFT_NOT_CREATED':'GMAIL_DRAFT_UNKNOWN',503);
  }};
  return service;
}

