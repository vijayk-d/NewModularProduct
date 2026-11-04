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
