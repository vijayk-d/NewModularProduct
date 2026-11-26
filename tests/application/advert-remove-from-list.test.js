import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {listAdvertsWithStatus} from '../../src/application/advert-workflow-status.js';import {createJobImportService,createMemoryJobImportRepository} from '../../src/application/linkedin-job-import.js';import {createSqliteJobImportStore} from '../../src/infrastructure/applications/sqlite-job-import-store.js';
const input=(id,title='Role')=>({schemaVersion:1,source:'linkedin',requestId:randomUUID(),jobId:id,jobAdvertLink:'https://www.linkedin.com/jobs/view/'+id+'/',jobTitle:title,jobDescriptionText:'Description',advertiser:{name:'Co'},location:{text:'UK',workplaceType:'unknown'},jobPosters:[],extraction:{readerVersion:'test',extractedAt:'2026-10-21T12:00:00Z',descriptionStatus:'unknown'}});
const reviews=new Map(),outreach={list:()=>[],listSentEmails:()=>[],listSendAttempts:()=>[],listDraftOperations:()=>[]};
for(const [name,make] of [['memory',()=>createJobImportService(createMemoryJobImportRepository())],['sqlite',()=>createSqliteJobImportStore({filePath:':memory:'})]])
 test(name+': removed adverts leave the list, can be restored, and return on a changed re-send',()=>{
  const s=make();s.receive(input('1'));s.receive(input('2'));
  const ids=status=>listAdvertsWithStatus({service:s,reviews,outreach,status}).items.map(r=>r.jobId).sort();
  assert.deepEqual(s.setHidden('1',true),{jobId:'1',hidden:true});
  assert.deepEqual(ids('all'),['2']);assert.deepEqual(ids('removed'),['1']);
  const l=listAdvertsWithStatus({service:s,reviews,outreach,status:'all'});assert.equal(l.removedCount,1);assert.equal(l.unfilteredTotal,1);assert.equal(l.statusCounts.new,1);
  assert.ok(s.lookup('1'),'stored advert kept');
  s.setHidden('1',false);assert.deepEqual(ids('all'),['1','2']);
  s.setHidden('2',true);s.receive(input('2','Changed'));assert.deepEqual(ids('removed'),[]);
  assert.throws(()=>s.setHidden('999',true),/No stored advert/);assert.throws(()=>s.setHidden('x',true),/Valid job ID/);
  s.close?.();
 });
import {mkdtempSync,rmSync,existsSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
test('hidden list uses a separate file; main import schema is unchanged',()=>{const dir=mkdtempSync(path.join(os.tmpdir(),'nmp-hide-'));try{const f=path.join(dir,'job-imports.db'),s=createSqliteJobImportStore({filePath:f});s.receive(input('7'));s.setHidden('7',true);s.close();
 const main=new DatabaseSync(f);assert.equal(main.prepare("SELECT count(*) n FROM sqlite_master WHERE name='job_import_hidden'").get().n,0);main.close();assert.ok(existsSync(path.join(dir,'job-imports-hidden.db')));
 const again=createSqliteJobImportStore({filePath:f});assert.ok(again.hiddenIds().has('7'));again.close();}finally{rmSync(dir,{recursive:true,force:true});}});
for(const [name,make] of [['memory',()=>createJobImportService(createMemoryJobImportRepository())],['sqlite',()=>createSqliteJobImportStore({filePath:':memory:'})]])
 test(name+': an advert marked complete shows as Complete, counts as Complete, and can be undone',()=>{
  const s=make();s.receive(input('1'));s.receive(input('2'));
  const row=id=>listAdvertsWithStatus({service:s,reviews,outreach,status:'all'}).items.find(r=>r.jobId===id);
  assert.equal(row('1').workflow.status,'new');assert.equal(row('1').completedByYou,false);
  assert.deepEqual(s.setCompleted('1',true),{jobId:'1',completed:true});
  assert.equal(row('1').workflow.status,'complete');assert.equal(row('1').workflow.label,'Complete — marked by you');assert.equal(row('1').completedByYou,true);
  const l=listAdvertsWithStatus({service:s,reviews,outreach,status:'complete'});assert.deepEqual(l.items.map(r=>r.jobId),['1']);assert.equal(l.statusCounts.complete,1);assert.equal(l.statusCounts.new,1);
  s.setCompleted('1',false);assert.equal(row('1').workflow.status,'new');
  assert.throws(()=>s.setCompleted('999',true),/No stored advert/);assert.throws(()=>s.setCompleted('x',true),/Valid job ID/);
  s.close?.();
 });
test('marked complete overrides Needs attention but keeps an automatic Complete as it is',async()=>{const {markedComplete}=await import('../../src/application/advert-workflow-status.js');
 const idle={status:'needs_attention',label:'Needs attention — no activity for 14 days',idle:true,needsAttention:true,reason:'x'};
 assert.equal(markedComplete(idle,false),idle);const m=markedComplete(idle,true);assert.equal(m.status,'complete');assert.equal(m.idle,false);assert.equal(m.needsAttention,false);
 const sent={status:'complete',label:'Complete — email sent',reason:'Confirmed'};assert.equal(markedComplete(sent,true).label,'Complete — email sent');});
test('completed list uses its own new file; the schema-guarded import and hidden files are unchanged',()=>{const dir=mkdtempSync(path.join(os.tmpdir(),'nmp-done-'));try{const f=path.join(dir,'job-imports-v1.db'),s=createSqliteJobImportStore({filePath:f});s.receive(input('8'));s.setCompleted('8',true);s.close();
 for(const file of [f,path.join(dir,'job-imports-v1-hidden.db')]){const db=new DatabaseSync(file);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='job_import_completed'").get().n,0,file);db.close();}
 assert.ok(existsSync(path.join(dir,'job-imports-v1-completed.db')));
 const again=createSqliteJobImportStore({filePath:f});assert.ok(again.completedIds().has('8'));again.close();}finally{rmSync(dir,{recursive:true,force:true});}});
