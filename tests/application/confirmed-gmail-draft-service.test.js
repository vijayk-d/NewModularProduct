import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { draftSnapshotFingerprint } from '../../src/application/gmail-draft-state-ledger.js';
import { createConfirmedGmailDraftService } from '../../src/application/confirmed-gmail-draft-service.js';
const account='sender@example.test';
async function fixture(t,{runner,flag='true',signatureReader}={}){
 const root=await mkdtemp(path.join(tmpdir(),'confirmed-draft-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(path.join(root,'cv.pdf'),Buffer.from('%PDF-1.4\nsynthetic'));
 const queue={id:'queue-uuid',status:'new',applicationKey:'app',email:'matt@example.test',firstname:'Matt',lastname:'Smith',subject:'Application | Vijay DAFAL',
  bodyPlainText:'Dear {{firstname}},\n\nI led delivery.\n\nWarm regards,\nVijay DAFAL',bodyHtml:'Dear {{firstname}},<br><br>I led delivery.<br><br>Warm regards,<br>Vijay DAFAL',attachment:{relativePath:'cv.pdf',name:'CV.pdf'},application:{selectedCvRoleCode:'DM'}};
 let operation=null,calls=0,checks=0,now=1000;
 const repo={getById(){return structuredClone(queue);},findDraftOperation(){return operation;},claimDraftOperation(){if(operation)throw new Error('duplicate');operation={id:'operation',status:'reserved',snapshotFingerprint:draftSnapshotFingerprint(queue)};queue.status='draft_creating';return operation;},recordDraftOutcome(value){operation={...operation,...value};queue.status=value.status==='drafted'?'drafted':value.status==='unknown'?'draft_unknown':'draft_failed';return operation;}};
 const mailbox={getStatus(){return {mailboxCheckEnabled:true,configurationReady:true,configuredFromAddress:account};},async check(){checks++;return {ok:true,mailboxMatch:true,mailbox:account};}};
 const service=createConfirmedGmailDraftService({repository:repo,mailboxPort:mailbox,env:{ENABLE_GMAIL_DRAFT_CREATION:flag,CV_FOLDER:root,ENABLE_GMAIL_SIGNATURE:signatureReader?'true':'false'},signatureReader,clock:()=>now,
  runner:async args=>{calls++;return runner?runner(args):{sent:0,profileVerified:true,sendingAccount:account,details:[{queueId:queue.id,status:'drafted',draftId:'draft-real',messageId:'message-real',creationAttempted:true}]};}});
 return {service,queue,repo,root,mailbox,get calls(){return calls;},get checks(){return checks;},get operation(){return operation;},advance(){now+=6*60*1000;}};
}
test('feature is off by default and blocks before profile/worker',async t=>{const f=await fixture(t,{flag:'false'});await assert.rejects(f.service.preview({queueId:f.queue.id,confirmed:true}),/disabled/);assert.equal(f.calls,0);assert.equal(f.checks,0);});
test('preview verifies account and CV but does not claim or create',async t=>{const f=await fixture(t);const p=await f.service.preview({queueId:f.queue.id,confirmed:true});assert.equal(p.sendingAccount,account);assert.equal(p.draft.recipient.firstname,'Matt');assert.equal(p.draft.attachment.sha256.length,64);assert.equal(f.calls,0);assert.equal(f.operation,null);});
test('unconfirmed create is blocked without claiming',async t=>{const f=await fixture(t);const p=await f.service.preview({queueId:f.queue.id,confirmed:true});await assert.rejects(f.service.create({ticket:p.ticket,confirmed:false}),/Confirm/);assert.equal(f.operation,null);});
test('approved creation records separate IDs with exactly one runner invocation',async t=>{const f=await fixture(t);const p=await f.service.preview({queueId:f.queue.id,confirmed:true});const result=await f.service.create({ticket:p.ticket,confirmed:true});assert.equal(result.draftId,'draft-real');assert.equal(result.messageId,'message-real');assert.equal(result.sent,false);assert.equal(f.calls,1);assert.equal(f.operation.status,'drafted');});
test('replay of the consumed ticket cannot create again',async t=>{const f=await fixture(t);const p=await f.service.preview({queueId:f.queue.id,confirmed:true});await f.service.create({ticket:p.ticket,confirmed:true});await assert.rejects(f.service.create({ticket:p.ticket,confirmed:true}),/consumed|expired/);assert.equal(f.calls,1);});
test('expiry and changed CV bytes require fresh review',async t=>{
 const f=await fixture(t);const p=await f.service.preview({queueId:f.queue.id,confirmed:true});await writeFile(path.join(f.root,'cv.pdf'),'%PDF changed');await assert.rejects(f.service.create({ticket:p.ticket,confirmed:true}),/changed/);assert.equal(f.calls,0);
 const g=await fixture(t);const q=await g.service.preview({queueId:g.queue.id,confirmed:true});g.advance();await assert.rejects(g.service.create({ticket:q.ticket,confirmed:true}),/expired/);assert.equal(g.calls,0);
});
test('message changes after preview block before reservation',async t=>{const f=await fixture(t);const p=await f.service.preview({queueId:f.queue.id,confirmed:true});f.queue.subject='Changed';await assert.rejects(f.service.create({ticket:p.ticket,confirmed:true}),/changed/);assert.equal(f.operation,null);});
test('mailbox mismatch prevents reservation and creation',async t=>{const f=await fixture(t);const p=await f.service.preview({queueId:f.queue.id,confirmed:true});f.mailbox.check=async()=>({ok:false,mailboxMatch:false,mailbox:'other@example.test'});await assert.rejects(f.service.create({ticket:p.ticket,confirmed:true}),/mailbox/);assert.equal(f.operation,null);assert.equal(f.calls,0);});
test('runner failure becomes unknown and stays locked',async t=>{const f=await fixture(t,{runner:async()=>{throw new Error('failure');}});const p=await f.service.preview({queueId:f.queue.id,confirmed:true});await assert.rejects(f.service.create({ticket:p.ticket,confirmed:true}),/uncertain/);assert.equal(f.operation.status,'unknown');assert.equal(f.calls,1);await assert.rejects(f.service.preview({queueId:f.queue.id,confirmed:true}),/new queue/);});
test('positive preflight failure is recorded without pretending success',async t=>{const f=await fixture(t,{runner:async()=>({sent:0,details:[{queueId:'queue-uuid',status:'failed',creationAttempted:false}]})});const p=await f.service.preview({queueId:f.queue.id,confirmed:true});await assert.rejects(f.service.create({ticket:p.ticket,confirmed:true}),/not attempted/);assert.equal(f.operation.status,'failed');assert.equal(f.operation.safeToRetry,true);});
test('generic Candidate subject is rejected before authentication',async t=>{const f=await fixture(t);f.queue.subject='Application | Candidate';await assert.rejects(f.service.preview({queueId:f.queue.id,confirmed:true}),/Candidate/);assert.equal(f.checks,0);});
test('CV traversal is rejected before authentication',async t=>{const f=await fixture(t);f.queue.attachment.relativePath='../outside.pdf';await assert.rejects(f.service.preview({queueId:f.queue.id,confirmed:true}));assert.equal(f.checks,0);});

import { Readable } from 'node:stream';
import { createOutreachHttpHandler } from '../../src/interfaces/http/outreach-queue-http.js';
async function httpRequest(handler,url,method,payload,origin){
 const req=Readable.from(payload?[Buffer.from(JSON.stringify(payload))]:[]);req.method=method;req.headers={host:'localhost',...(payload?{'content-type':'application/json'}:{}),...(origin?{origin}:{})};
 let status,data;const res={writeHead(code){status=code;},end(text){data=JSON.parse(text);}};await handler(req,res,new URL('http://localhost'+url));return {status,data};
}
test('HTTP feature status does not preview or create',async()=>{
 let calls=0;const port={getStatus(){return {draftCreationEnabled:false};},async preview(){calls++;},async create(){calls++;}};
 const handler=createOutreachHttpHandler({repository:null,gmailMailboxPort:{getStatus(){return{};}},gmailDraftCreationPort:port});
 const response=await httpRequest(handler,'/api/outreach-queue/gmail-draft-status','GET');assert.equal(response.status,200);assert.equal(calls,0);
});
test('HTTP creation carries explicit token confirmation and reports persistence failure honestly',async()=>{
 let received;const port={getStatus(){return{};},async create(value){received=value;return {created:true,persistenceConfirmed:false,draftId:'confirmed-id',error:'Persistence failed'};}};
 const handler=createOutreachHttpHandler({repository:null,gmailMailboxPort:{getStatus(){return{};}},gmailDraftCreationPort:port});
 const response=await httpRequest(handler,'/api/outreach-queue/gmail-draft-create','POST',{ticket:'opaque',confirmed:true});assert.deepEqual(received,{ticket:'opaque',confirmed:true});assert.equal(response.status,503);assert.equal(response.data.created,true);assert.equal(response.data.draftId,'confirmed-id');
});
test('cross-origin creation is rejected without invoking the port',async()=>{
 let calls=0;const handler=createOutreachHttpHandler({repository:null,gmailMailboxPort:{getStatus(){return{};}},gmailDraftCreationPort:{getStatus(){return{};},async create(){calls++;}}});
 const response=await httpRequest(handler,'/api/outreach-queue/gmail-draft-create','POST',{ticket:'opaque',confirmed:true},'https://evil.test');assert.equal(response.status,403);assert.equal(calls,0);
});

test('confirmed Gmail ID is returned honestly if database persistence fails',async t=>{
 const f=await fixture(t);const p=await f.service.preview({queueId:f.queue.id,confirmed:true});
 f.repo.recordDraftOutcome=()=>{throw new Error('database unavailable');};const receipt=await f.service.create({ticket:p.ticket,confirmed:true});
 assert.equal(receipt.created,true);assert.equal(receipt.persistenceConfirmed,false);assert.equal(receipt.draftId,'draft-real');assert.equal(f.operation.status,'reserved');
});
test('mismatched worker account cannot become recorded success',async t=>{
 const f=await fixture(t,{runner:async()=>({sent:0,profileVerified:true,sendingAccount:'other@example.test',details:[{queueId:'queue-uuid',status:'drafted',draftId:'other-draft',creationAttempted:true}]})});
 const p=await f.service.preview({queueId:f.queue.id,confirmed:true});await assert.rejects(f.service.create({ticket:p.ticket,confirmed:true}),/uncertain/);assert.equal(f.operation.status,'unknown');
});

test('signed preview is bound to signature content; changed signature blocks before worker',async t=>{
 let suffix='Original';const signatureReader=async()=>({ok:true,mailbox:account,html:'<b>'+suffix+'</b>',plainText:suffix});
 const f=await fixture(t,{signatureReader});const p=await f.service.preview({queueId:f.queue.id,confirmed:true});assert.ok(p.draft.bodyPlainText.includes('Warm regards,\nVijay DAFAL\n\n-- \nOriginal'));
 suffix='Changed';await assert.rejects(f.service.create({ticket:p.ticket,confirmed:true}),/changed/);assert.equal(f.calls,0);assert.equal(f.operation,null);
});
test('confirmed worker receives the signed body, once, after explicit confirmation',async t=>{
 let received;const signatureReader=async()=>({ok:true,mailbox:account,html:'<b>Signature</b>',plainText:'Signature'});
 const f=await fixture(t,{signatureReader,runner:async args=>{received=args.payload.drafts[0];return {sent:0,profileVerified:true,sendingAccount:account,details:[{queueId:'queue-uuid',status:'drafted',draftId:'real-id',creationAttempted:true}]};}});
 const p=await f.service.preview({queueId:f.queue.id,confirmed:true});await f.service.create({ticket:p.ticket,confirmed:true});assert.equal(received.bodyPlainText,p.draft.bodyPlainText);assert.equal(f.calls,1);
});
