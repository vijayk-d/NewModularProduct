import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftAttemptLedger, draftSnapshotFingerprint } from '../../src/application/gmail-draft-state-ledger.js';
class MemoryDb {
 constructor(){this.rows=new Map();this.saved=null;}
 exec(sql){if(sql==='BEGIN IMMEDIATE'){assert.equal(this.saved,null);this.saved=structuredClone(this.rows);}else if(sql==='COMMIT'){this.saved=null;}else if(sql==='ROLLBACK'){this.rows=this.saved;this.saved=null;}}
 prepare(sql){const rows=this.rows;return {
  get:(...args)=>{if(sql.includes('WHERE id = ?'))return rows.has(args[0])?{payload:JSON.stringify(rows.get(args[0]))}:undefined;
    const item=[...rows.values()].find(r=>r.applicationKey===args[0]&&r.recipientKey===args[1]&&r.sendingAccount===args[2]);return item?{payload:JSON.stringify(item)}:undefined;},
  all:()=>[...rows.values()].map(r=>({payload:JSON.stringify(r)})),
  run:(...args)=>{if(sql.startsWith('INSERT')){rows.set(args[0],JSON.parse(args[4]));}
    else if(sql.includes('SET id = ?')){rows.delete(args[2]);rows.set(args[0],JSON.parse(args[1]));}
    else {rows.set(args[1],JSON.parse(args[0]));}return {changes:1};}
 };}
}
const item=(id='queue-1')=>({id,status:'new',applicationKey:'application',contactId:'contact',email:'matt@example.test',subject:'Reviewed subject',bodyPlainText:'Reviewed body',bodyHtml:'Reviewed body',attachment:{relativePath:'DM/cv.pdf'}});
const account='sender@example.test';
test('claim records immutable fingerprint and blocks duplicate reservation',()=>{
 const ledger=createDraftAttemptLedger(new MemoryDb());const first=ledger.claim(item(),account);
 assert.equal(first.status,'reserved');assert.equal(first.snapshotFingerprint,draftSnapshotFingerprint(item()));
 assert.throws(()=>ledger.claim(item(),account),error=>error.code==='GMAIL_DRAFT_ALREADY_RESERVED');
});
test('requeue/new contact ID cannot bypass recipient/application/account duplicate protection',()=>{
 const ledger=createDraftAttemptLedger(new MemoryDb());ledger.claim(item(),account);
 assert.throws(()=>ledger.claim({...item('queue-2'),contactId:'another-contact'},account));
});
test('a different application or account remains distinct',()=>{
 const ledger=createDraftAttemptLedger(new MemoryDb());ledger.claim(item(),account);ledger.claim({...item(),applicationKey:'another-app'},account);ledger.claim(item(),'other@example.test');assert.equal(ledger.list().length,3);
});
test('confirmed draft/message IDs stay distinct and repeat confirmation is idempotent',()=>{
 const ledger=createDraftAttemptLedger(new MemoryDb());const op=ledger.claim(item(),account);
 const first=ledger.recordOutcome({operationId:op.id,status:'drafted',draftId:'draft-1',messageId:'message-1'});
 const second=ledger.recordOutcome({operationId:op.id,status:'drafted',draftId:'draft-1',messageId:'message-1'});
 assert.deepEqual(first,second);assert.equal(first.draftId,'draft-1');assert.equal(first.messageId,'message-1');
 assert.throws(()=>ledger.recordOutcome({operationId:op.id,status:'unknown'}));
});
test('missing or simulated Gmail IDs cannot mark success',()=>{
 const ledger=createDraftAttemptLedger(new MemoryDb());const op=ledger.claim(item(),account);
 for(const draftId of ['',null,'local-mock'])assert.throws(()=>ledger.recordOutcome({operationId:op.id,status:'drafted',draftId}));
 assert.equal(ledger.getById(op.id).status,'reserved');
});
test('uncertain outcome is locked even with an explicit retry request',()=>{
 const ledger=createDraftAttemptLedger(new MemoryDb());const op=ledger.claim(item(),account);ledger.recordOutcome({operationId:op.id,status:'unknown'});
 assert.throws(()=>ledger.claim(item(),account,{retryFailed:true}));
});
test('failed retry requires both explicit retry and positive no-creation evidence',()=>{
 const ledger=createDraftAttemptLedger(new MemoryDb());const op=ledger.claim(item(),account);ledger.recordOutcome({operationId:op.id,status:'failed',safeToRetry:true});
 assert.throws(()=>ledger.claim(item(),account));
 const next=ledger.claim({...item(),status:'draft_failed'},account,{retryFailed:true});assert.notEqual(next.id,op.id);assert.equal(next.history[0].id,op.id);
 assert.throws(()=>ledger.recordOutcome({operationId:op.id,status:'drafted',draftId:'stale'}));
});
test('failure without no-creation evidence cannot be retried',()=>{
 const ledger=createDraftAttemptLedger(new MemoryDb());const op=ledger.claim(item(),account);ledger.recordOutcome({operationId:op.id,status:'failed'});
 assert.throws(()=>ledger.claim({...item(),status:'draft_failed'},account,{retryFailed:true}));
});
test('mirror errors roll back claim and outcome changes',()=>{
 const db=new MemoryDb();let broken=false;const ledger=createDraftAttemptLedger(db,()=>{if(broken)throw new Error('mirror failed');});
 broken=true;assert.throws(()=>ledger.claim(item(),account));assert.equal(ledger.list().length,0);
 broken=false;const op=ledger.claim(item(),account);broken=true;
 assert.throws(()=>ledger.recordOutcome({operationId:op.id,status:'drafted',draftId:'real-draft'}));assert.equal(ledger.getById(op.id).status,'reserved');
});
test('native SQLite draft ledger survives queue clearing and database reopen',async t=>{
 let createOutreachRepository;try{({createOutreachRepository}=await import('../../src/infrastructure/outreach/sqlite-outreach-repository.js'));}catch(error){if(error.code==='ERR_UNKNOWN_BUILTIN_MODULE'){t.skip('Sandbox lacks node:sqlite; run on product Node24.');return;}throw error;}
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'draft-ledger-'));const filePath=join(dir,'queue.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let repo=createOutreachRepository({filePath});
 const queued=repo.addMany([{...item(),contactId:'contact'}]).items[0];
 const operation=repo.claimDraftOperation({queueId:queued.id,sendingAccount:account});
 repo.recordDraftOutcome({operationId:operation.id,status:'drafted',draftId:'draft-1',messageId:'message-1'});
 assert.equal(repo.getById(queued.id).status,'drafted');repo.clearQueue();repo.close();repo=createOutreachRepository({filePath});
 try{assert.equal(repo.getDraftOperationById(operation.id).draftId,'draft-1');const again=repo.addMany([{...item('new-id')}]).items[0];assert.throws(()=>repo.claimDraftOperation({queueId:again.id,sendingAccount:account}));}finally{repo.close();}
});
