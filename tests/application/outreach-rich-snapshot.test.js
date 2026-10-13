import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable, Writable } from 'node:stream';
import { sanitizeSnapshotHtml, snapshotMessage, prepareDraftSnapshot } from '../../src/application/outreach-message-snapshot.js';
import { createOutreachQueueService } from '../../src/application/outreach-queue-service.js';
import { createOutreachHttpHandler } from '../../src/interfaces/http/outreach-queue-http.js';
import { runGmailDraftWorker } from '../../src/application/gmail-draft-worker-runner.js';
const uuid='b55a4a60-6d8e-4ce9-a57d-efb674358400';
const plain='Dear {{firstname}},\n\nJob advert: Job advert\n\nI led delivery dependencies.';
const html='Dear {{firstname}},<br><br>Job advert: <a href="https://example.test/job?a=1&amp;b=2" onclick="bad()">Job advert</a><br><br>I led <mark data-job-aligned="true">delivery dependencies</mark>.';
function fixture(){
  const entries=[];
  const review={formData:{jobTitle:'Delivery Manager',organisationName:'Example',jobAdvertLink:'https://example.test/job?a=1&b=2'},selectedCvRoleCode:'DM',prepared:{coverLetter:{subject:'Delivery application'},rankedCvs:[{cv:{role_code:'DM',local_path:'DM/cv.pdf'}}]}};
  const repository={list:()=>structuredClone(entries),async addMany(items){for(const item of items)entries.push({...structuredClone(item),id:uuid,status:'new'});return {added:items.length,duplicates:0,items:structuredClone(entries)};}};
  const contacts={async listByReview(){return [{id:'contact-1',firstName:'Alice',lastName:'Test',fullName:'Alice Test',selectedEmail:'alice@example.test',emailCandidates:['alice@example.test']}];}};
  return {entries,review,repository,contacts,service:createOutreachQueueService({repository,contactStore:contacts,getReview:()=>review})};
}
test('sanitizer retains highlight and advert URL but discards event attributes',()=>{
  const clean=sanitizeSnapshotHtml(html);
  assert.ok(clean.html.includes('<mark style="background-color:#fff2a8">'));
  assert.ok(clean.html.includes('a=1&amp;b=2'));
  assert.ok(!clean.html.includes('onclick'));
});
test('unsafe tags, links and recipient tokens in attributes are rejected',()=>{
  for(const source of ['<script>bad()</script>','<img src=x>','<a href="javascript:bad()">X</a>','<a href="https://example.test/{{firstname}}">X</a>'])assert.throws(()=>sanitizeSnapshotHtml(source));
});
test('span highlighting is reduced to fixed safe highlight styling',()=>{
  const clean=sanitizeSnapshotHtml('<span style="background-color: red; background-image:url(https://evil.test)">Evidence</span>');
  assert.equal(clean.html,'<mark style="background-color:#fff2a8">Evidence</mark>');
});
test('text disagreement and malformed tags are rejected',()=>{
  assert.throws(()=>snapshotMessage('Different',html), /disagree/);
  assert.throws(()=>sanitizeSnapshotHtml('<p><b>Evidence</p>'), /mismatched/);
});
test('legacy plain requests retain their original contract',()=>{
  assert.deepEqual(snapshotMessage(' Original draft ',undefined),{bodyPlainText:'Original draft'});
});
test('plain-text advert fallback keeps its URL',()=>{
  assert.ok(snapshotMessage(plain,html,'https://example.test/job?a=1&b=2').bodyPlainText.includes('Job advert: https://example.test/job?a=1&b=2'));
});
test('queue snapshot preserves CV metadata and later review edits cannot change it',async()=>{
  const f=fixture();await f.service.add({reviewId:'review-1',recipients:[{contactId:'contact-1',email:'alice@example.test'}],bodyPlainText:plain,bodyHtml:html});
  const before=JSON.stringify(f.entries);f.review.formData.jobTitle='Changed';
  assert.equal(JSON.stringify(f.entries),before);
  assert.equal(f.entries[0].attachment.relativePath,'DM/cv.pdf');
  assert.equal(f.entries[0].firstname,'Alice');
});
test('draft preparation is read-only, uses UUID and resolves greeting',async()=>{
  const f=fixture();await f.service.add({reviewId:'review-1',recipients:[{contactId:'contact-1',email:'alice@example.test'}],bodyPlainText:plain,bodyHtml:html});
  const before=JSON.stringify(f.entries);const result=f.service.prepareDrafts({ids:[uuid]});
  assert.equal(result.liveDraftingEnabled,false);assert.equal(result.drafts[0].queueId,uuid);
  assert.ok(result.drafts[0].bodyPlainText.startsWith('Dear Alice,'));
  assert.ok(!result.drafts[0].bodyHtml.includes('{{'));
  assert.equal(JSON.stringify(f.entries),before);
});
test('HTML recipient substitution escapes markup',()=>{
  const result=prepareDraftSnapshot({id:uuid,status:'new',email:'a@example.test',subject:'Application',firstname:'A<&',bodyPlainText:'Dear {{firstname}},',bodyHtml:'Dear {{firstname}},'});
  assert.equal(result.bodyHtml,'Dear A&lt;&amp;,');
  assert.equal(result.bodyPlainText,'Dear A<&,');
});
test('missing CV attachment metadata and unknown IDs fail preparation',()=>{
  assert.throws(()=>prepareDraftSnapshot({id:uuid,status:'new',email:'a@example.test',subject:'Application',bodyPlainText:'Dear Alice',application:{selectedCvRoleCode:'DM'}}),/attachment/);
  assert.throws(()=>fixture().service.prepareDrafts({ids:['missing']}),/no longer exists/);
});
test('HTTP local preparation route returns payload without dispatch',async()=>{
  const f=fixture();await f.service.add({reviewId:'r',recipients:[{contactId:'contact-1',email:'alice@example.test'}],bodyPlainText:plain,bodyHtml:html});
  const handler=createOutreachHttpHandler({repository:f.repository,contactStore:f.contacts,getReview:()=>f.review});
  const request=Readable.from([Buffer.from(JSON.stringify({ids:[uuid]}))]);request.method='POST';request.headers={'content-type':'application/json',host:'localhost'};
  let status,data;const response={writeHead(code){status=code;},end(text){data=JSON.parse(text);}};
  assert.equal(await handler(request,response,new URL('http://localhost/api/outreach-queue/prepare-drafts')),true);
  assert.equal(status,200);assert.equal(data.prepared,1);assert.equal(data.liveDraftingEnabled,false);
});
function fakeSpawn(result,exitCode=0){return ()=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
  child.stdin=new Writable({write(chunk,enc,cb){cb();},final(cb){cb();setImmediate(()=>{child.stdout.emit('data',JSON.stringify(result));child.emit('close',exitCode);});}});return child;
};}
const payload={action:'draft',drafts:[{queueId:uuid}]};
test('draft runner preserves UUID and confirmed draft/message IDs',async()=>{
  const result=await runGmailDraftWorker({payload,spawnImpl:fakeSpawn({sent:0,details:[{queueId:uuid,status:'drafted',draftId:'draft-1',messageId:'message-1'}]})});
  assert.equal(result.drafted,1);assert.equal(result.details[0].queueId,uuid);assert.equal(result.sent,0);
});
test('worker exit and synthetic success do not become confirmed drafts',async()=>{
  await assert.rejects(runGmailDraftWorker({payload,spawnImpl:fakeSpawn({},1)}),/failed/);
  await assert.rejects(runGmailDraftWorker({payload,spawnImpl:fakeSpawn({sent:0,details:[{queueId:uuid,status:'drafted',draftId:'local-mock'}]})}),/unconfirmed/);
});
test('draft adapter rejects sending before spawning',async()=>{
  await assert.rejects(runGmailDraftWorker({payload:{action:'send',drafts:[{queueId:uuid}]},spawnImpl:()=>{throw new Error('must not spawn');}}),/Sending is disabled/);
});
test('SQLite preserves rich snapshots and duplicates do not replace content',async t=>{
  let createOutreachRepository;try {({createOutreachRepository}=await import('../../src/infrastructure/outreach/sqlite-outreach-repository.js'));}catch(error){if(error.code==='ERR_UNKNOWN_BUILTIN_MODULE'){t.skip('Sandbox Node lacks node:sqlite; run locally.');return;}throw error;}
  const repo=createOutreachRepository({filePath:':memory:'});t.after(()=>repo.close());
  const item={applicationKey:'app',contactId:'c',email:'alice@example.test',subject:'Application',bodyPlainText:'Evidence',bodyHtml:'<mark>Evidence</mark>',firstname:'Alice',attachment:{relativePath:'DM/cv.pdf',name:'cv.pdf'}};
  const first=repo.addMany([item]);const second=repo.addMany([{...item,bodyPlainText:'Changed',bodyHtml:'Changed'}]);
  assert.equal(second.duplicates,1);assert.equal(repo.list()[0].bodyPlainText,'Evidence');
  assert.equal(repo.list()[0].id,first.items[0].id);assert.equal(repo.list()[0].attachment.relativePath,'DM/cv.pdf');
});
