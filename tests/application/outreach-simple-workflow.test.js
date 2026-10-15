import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { draftSnapshotFingerprint } from '../../src/application/gmail-draft-state-ledger.js';
import { createConfirmedGmailDraftService } from '../../src/application/confirmed-gmail-draft-service.js';
const account='sender@example.test';
async function fixture(t,{runner,flag='true'}={}){
 const root=await mkdtemp(path.join(tmpdir(),'confirmed-draft-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(path.join(root,'cv.pdf'),Buffer.from('%PDF-1.4\nsynthetic'));
 const queue={id:'queue-uuid',status:'new',applicationKey:'app',email:'matt@example.test',firstname:'Matt',lastname:'Smith',subject:'Application | Vijay DAFAL',
  bodyPlainText:'Dear {{firstname}},\n\nI led delivery.\n\nWarm regards,\nVijay DAFAL',bodyHtml:'Dear {{firstname}},<br><br>I led delivery.<br><br>Warm regards,<br>Vijay DAFAL',attachment:{relativePath:'cv.pdf',name:'CV.pdf'},application:{selectedCvRoleCode:'DM'}};
 let operation=null,calls=0,checks=0,now=1000;
 const repo={getById(){return structuredClone(queue);},findDraftOperation(){return operation;},claimDraftOperation(){if(operation)throw new Error('duplicate');operation={id:'operation',status:'reserved',snapshotFingerprint:draftSnapshotFingerprint(queue)};queue.status='draft_creating';return operation;},recordDraftOutcome(value){operation={...operation,...value};queue.status=value.status==='drafted'?'drafted':value.status==='unknown'?'draft_unknown':'draft_failed';return operation;}};
 const mailbox={getStatus(){return {mailboxCheckEnabled:true,configurationReady:true,configuredFromAddress:account};},async check(){checks++;return {ok:true,mailboxMatch:true,mailbox:account};}};
 const service=createConfirmedGmailDraftService({repository:repo,mailboxPort:mailbox,env:{ENABLE_GMAIL_DRAFT_CREATION:flag,CV_FOLDER:root},clock:()=>now,
  runner:async args=>{calls++;return runner?runner(args):{sent:0,profileVerified:true,sendingAccount:account,details:[{queueId:queue.id,status:'drafted',draftId:'draft-real',messageId:'message-real',creationAttempted:true}]};}});
 return {service,queue,repo,root,mailbox,get calls(){return calls;},get checks(){return checks;},get operation(){return operation;},advance(){now+=6*60*1000;}};
}

import { finalizeOutreachIdentity } from '../../src/application/outreach-final-identity.js';
import { createRecruiterContactStore } from '../../src/application/recruiter-contact-store.js';
import { createOutreachQueueService } from '../../src/application/outreach-queue-service.js';
import { createOutreachHttpHandler } from '../../src/interfaces/http/outreach-queue-http.js';
import { emailCandidateRows } from '../../src/interfaces/http/outreach-simple-contacts.js';
import { Readable } from 'node:stream';
const plain='Dear Organisation,\n\nI led delivery worth £2M for Ageas’s teams.\n\nWarm regards,\nCandidate';
const html='Dear <a href="https://business.test/people">Organisation</a>,<br><br>I led <mark>delivery</mark> worth £2M for Ageas’s teams.<br><br>Warm regards,<br>Candidate';
const identity={firstName:'Zoe',candidateName:'Vijay DAFAL'};
test('identity correction preserves experience text, Unicode and highlights',()=>{
 const result=finalizeOutreachIdentity({bodyPlainText:plain,bodyHtml:html},identity);
 assert.match(result.bodyPlainText,/^Dear Zoe,/);assert.match(result.bodyPlainText,/Vijay DAFAL$/);assert.match(result.bodyHtml,/<mark[^>]*>delivery<\/mark>/);assert.match(result.bodyPlainText,/£2M/);
});
test('paragraph HTML wrappers survive identity resolution',()=>{
 const result=finalizeOutreachIdentity({bodyPlainText:plain,bodyHtml:'<p>Dear Organisation,</p><p>I led <strong>delivery</strong> worth £2M for Ageas’s teams.</p><p>Warm regards,<br>Candidate</p>'},identity);
 assert.match(result.bodyHtml,/<strong>delivery<\/strong>/);
});
test('plain-only flow builds formatted body and correct signoff',()=>{assert.match(finalizeOutreachIdentity({bodyPlainText:plain},identity).bodyHtml,/Vijay DAFAL$/);});
test('URL names, absent signatures and mismatched bodies are refused',()=>{
 assert.throws(()=>finalizeOutreachIdentity({bodyPlainText:plain},{...identity,firstName:'https://business.test'}),/name/);
 assert.throws(()=>finalizeOutreachIdentity({bodyPlainText:'Dear Zoe,\nEvidence.'},identity),/regards/);
 assert.throws(()=>finalizeOutreachIdentity({bodyPlainText:plain,bodyHtml:'Dear Organisation,<br>Different.<br>Warm regards,<br>Candidate'},identity),/disagree/);
});
test('inferred addresses are separate and case-insensitive duplicate addresses collapse',()=>{
 const rows=emailCandidateRows([{id:'x',firstName:'Zoe',lastName:'Jones',selectedEmail:'Zoe@business.test',emailCandidates:['zoe@business.test','jones.zoe@business.test'],emailSource:'imported'}]);
 assert.equal(rows.length,2);assert.equal(rows[1].source,'inferred');
});
async function contactFixture(t){const root=await mkdtemp(path.join(tmpdir(),'simple-contact-'));t.after(()=>rm(root,{recursive:true,force:true}));return createRecruiterContactStore({filePath:path.join(root,'contacts.json')});}
const contactRow={clientKey:'manual-row-1234',firstName:'Zoe',lastName:'Jones',email:'zoe@business.test',role:'Recruiter'};
test('manual rows persist idempotently and link to the review',async t=>{
 const store=await contactFixture(t),input={reviewId:'r',rows:[contactRow]};
 const a=await store.saveOutreachCandidates(input),b=await store.saveOutreachCandidates(input);assert.deepEqual(a,b);assert.equal((await store.listByReview('r')).length,1);
});
test('bad contact batch makes no partial changes',async t=>{
 const store=await contactFixture(t);await assert.rejects(store.saveOutreachCandidates({reviewId:'r',rows:[contactRow,{...contactRow,clientKey:'another-row-1234',email:'bad'}]}),/invalid/);assert.equal((await store.listAll()).length,0);
});
test('edited address preserves manual origin and never becomes verified',async t=>{
 const store=await contactFixture(t);const [a]=await store.saveOutreachCandidates({reviewId:'r',rows:[contactRow]});
 await store.saveOutreachCandidates({reviewId:'r',rows:[{...contactRow,contactId:a.contactId,email:'other@business.test'}]});
 const saved=(await store.listAll())[0];assert.equal(saved.emailSources['other@business.test'],'manual');assert.equal(saved.verified,false);
});
test('plain-only link flow retains names and CV metadata',async t=>{
 const store=await contactFixture(t),recipients=await store.saveOutreachCandidates({reviewId:'r',rows:[contactRow]});let items;
 const service=createOutreachQueueService({contactStore:store,getReview:()=>({formData:{jobTitle:'Delivery Manager'},prepared:{coverLetter:{subject:'Application | Vijay DAFAL'},recommendation:{bestCv:{role_code:'DM',local_path:'cv.pdf'}}}}),repository:{addMany(value){items=value;return {added:value.length};}}});
 await service.add({reviewId:'r',recipients,bodyPlainText:plain,finalizeIdentity:true});assert.equal(items[0].firstname,'Zoe');assert.equal(items[0].attachment.relativePath,'cv.pdf');assert.match(items[0].bodyPlainText,/^Dear Zoe,/);
});
test('direct Draft performs one internally prepared creation',async t=>{const f=await fixture(t);const r=await f.service.draftOne({queueId:f.queue.id,confirmed:true});assert.equal(r.created,true);assert.equal(f.calls,1);});
test('direct Draft requires confirmation',async t=>{const f=await fixture(t);await assert.rejects(f.service.draftOne({queueId:f.queue.id}),/Confirm/);assert.equal(f.calls,0);});
test('concurrent direct Draft calls cannot create twice',async t=>{const f=await fixture(t);await Promise.allSettled([f.service.draftOne({queueId:f.queue.id,confirmed:true}),f.service.draftOne({queueId:f.queue.id,confirmed:true})]);assert.equal(f.calls,1);});
test('successful and uncertain operations cannot be retried blindly',async t=>{
 const f=await fixture(t);await f.service.draftOne({queueId:f.queue.id,confirmed:true});await assert.rejects(f.service.draftOne({queueId:f.queue.id,confirmed:true,retryFailed:true}));assert.equal(f.calls,1);
 const g=await fixture(t,{runner:()=>{throw new Error('transport');}});await assert.rejects(g.service.draftOne({queueId:g.queue.id,confirmed:true}),/uncertain/);await assert.rejects(g.service.draftOne({queueId:g.queue.id,confirmed:true,retryFailed:true}));assert.equal(g.calls,1);
});
test('safe preflight retry passes the explicit retry option to the ledger',async t=>{
 const f=await fixture(t,{runner:()=>({sent:0,details:[{queueId:'queue-uuid',status:'failed',creationAttempted:false}]})});
 await assert.rejects(f.service.draftOne({queueId:f.queue.id,confirmed:true}),/not attempted/);assert.equal(f.operation.safeToRetry,true);
 f.repo.claimDraftOperation=args=>{assert.equal(args.retryFailed,true);return {id:'retry',snapshotFingerprint:draftSnapshotFingerprint(f.queue)};};
 await assert.rejects(f.service.draftOne({queueId:f.queue.id,confirmed:true,retryFailed:true}),/not attempted/);assert.equal(f.calls,2);
});
async function request(handler,route,payload,origin){
 const bytes=Buffer.from(JSON.stringify(payload)),index=bytes.indexOf(Buffer.from('£'))+1;
 const req=Readable.from([bytes.subarray(0,index),bytes.subarray(index)]);req.method='POST';req.headers={host:'localhost','content-type':'application/json',...(origin?{origin}:{})};
 let code,data;await handler(req,{writeHead(n){code=n;},end(v){data=JSON.parse(v);}},new URL('http://localhost'+route));return {code,data};
}
test('UTF-8 split chunks survive the new direct-draft endpoint',async()=>{
 let received;const handler=createOutreachHttpHandler({gmailDraftCreationPort:{async draftOne(v){received=v;return {created:true,draftId:'test'};}}});
 assert.equal((await request(handler,'/api/outreach-queue/draft-one',{queueId:'£-queue',confirmed:true})).code,200);assert.equal(received.queueId,'£-queue');
});
test('direct Draft rejects cross-origin requests',async()=>{
 const handler=createOutreachHttpHandler({gmailDraftCreationPort:{draftOne(){assert.fail('must not draft');}}});assert.equal((await request(handler,'/api/outreach-queue/draft-one',{},'https://untrusted.test')).code,403);
});
test('bad letter is rejected before contact save',async()=>{
 const handler=createOutreachHttpHandler({repository:{list:()=>[]},getReview:()=>({formData:{},prepared:{coverLetter:{subject:'Application'}}}),contactStore:{saveOutreachCandidates(){assert.fail('must not save');}}});
 assert.equal((await request(handler,'/api/outreach-queue/link-and-add',{reviewId:'r',rows:[contactRow],bodyPlainText:'No signature'})).code,400);
});
