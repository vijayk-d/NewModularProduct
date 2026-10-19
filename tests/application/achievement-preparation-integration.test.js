import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';import {createAchievementEvidenceService} from '../../src/application/achievement-evidence.js';import {createDurableReviewStore,createMemoryReviewRepository} from '../../src/application/durable-review-store.js';import {prepareApplication} from '../../src/application/prepare-application.js';
async function expectHttp(response,expected){
 let detail='';
 if(response.status!==expected){
  const body=await response.clone().text();
  const errors=body.match(/<div class="errors"[\s\S]*?<\/div>/)?.[0]||body;
  detail=errors.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,1200);
 }
 assert.equal(response.status,expected,detail);
}

const claim='Reduced release lead time by 20% through automated checks within six months.';
async function fixture(t){let current=claim,calls=0;const cv={role_code:'PM',role_name:'Project Manager',local_path:'PM/cv.pdf',use_cases:['UNSELECTED CLAIM']},store=createDurableReviewStore(createMemoryReviewRepository());const service=createAchievementEvidenceService({inventoryRepository:{async load(){return {cvs:[cv]};}},documentExtractor:{async extract(){return {text:current};}}});const server=createLocalServer({applicationReviewStore:store,achievementEvidenceService:service,prepareApplication:async request=>{calls++;return prepareApplication({...request,inventory:{cvs:[cv]},candidateProfile:{displayName:'Test Candidate'},coverLetterTemplate:'Dear {{firstname}},\n\nI am applying for the {{role}} opportunity.\nRole details: {{jobAdvertLink}}\n\n{{evidence}}\n\nWarm regards,\n{{recipient}}'});}});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});return {url:'http://127.0.0.1:'+server.address().port,service,store,change:t=>current=t,get calls(){return calls;}};}
function post(f,fields={}){return fetch(f.url+'/applications',{method:'POST',body:new URLSearchParams({jobTitle:'Project Manager',jobDescriptionText:'Lead delivery',jobAdvertLink:'https://business.test/job',achievementMode:'selected',...fields})});}
test('full form resolves selected evidence and persists source snapshots across resume',async t=>{const f=await fixture(t),c=await f.service.load({roleCode:'PM'}),r=await post(f,{achievementCvRoleCode:'PM',achievementSourceHash:c.sourceHash,achievementIds:c.candidates[0].id,cvHighlights:'FORGED HIGHLIGHT'});await expectHttp(r,200);const html=await r.text(),id=html.match(/name="reviewId"\s+value="([^"]+)"/)?.[1];assert.ok(id);const saved=f.store.get(id);assert.equal(saved.formData.achievementSelection.items[0].text,claim);assert.ok(saved.currentDraftPlainText.includes(claim));assert.ok(!saved.currentDraftPlainText.includes('FORGED'));assert.ok(!saved.currentDraftPlainText.includes('UNSELECTED'));const resume=await fetch(f.url+'/applications/'+id);assert.equal(resume.status,200);assert.ok((await resume.text()).includes(c.sourceHash.slice(0,12)));assert.equal(f.calls,1);});
test('stale proof or forged IDs do not call preparation or persist an application',async t=>{const f=await fixture(t),c=await f.service.load({roleCode:'PM'});f.change(claim+' Changed.');let r=await post(f,{achievementCvRoleCode:'PM',achievementSourceHash:c.sourceHash,achievementIds:c.candidates[0].id});await expectHttp(r,409);r=await post(f,{achievementCvRoleCode:'PM',achievementSourceHash:c.sourceHash,achievementIds:'a'.repeat(64)});await expectHttp(r,409);assert.equal(f.calls,0);assert.equal(f.store.summaries().total,0);});
test('empty explicit selection ignores submitted manual highlights and inventory fallback claims',async t=>{const f=await fixture(t),r=await post(f,{cvHighlights:'UNTRUSTED CLAIM'});await expectHttp(r,200);const html=await r.text(),id=html.match(/name="reviewId"\s+value="([^"]+)"/)?.[1];assert.ok(id);const saved=f.store.get(id);assert.ok(!saved.currentDraftPlainText.includes('UNTRUSTED'));assert.ok(!saved.currentDraftPlainText.includes('UNSELECTED'));});
test('omitted form defaults are empty arrays, while explicit unsupported role codes still reject',async t=>{
 const f=await fixture(t),r=await post(f);await expectHttp(r,200);
 const html=await r.text(),id=html.match(/name="reviewId"\s+value="([^"]+)"/)?.[1];assert.ok(id);
 const saved=f.store.get(id);assert.deepEqual(saved.formData.preferredRoleCodes,[]);assert.deepEqual(saved.formData.cvHighlights,[]);
 const rejected=await post(f,{preferredRoleCodes:'UNSUPPORTED'});await expectHttp(rejected,400);assert.equal(f.calls,1);
});
