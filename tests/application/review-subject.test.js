import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSubject,currentReviewSubject,queueSnapshotSubject,reviewWithSavedSubject} from '../../src/application/review-subject.js';
import {createOutreachQueueService} from '../../src/application/outreach-queue-service.js';
import {attachSubjectEditors} from '../../src/interfaces/http/subject-editors.js';
const review=()=>({candidateDisplayName:'Vijay DAFAL',formData:{jobTitle:'Delivery Manager',jobReference:'12345'},prepared:{coverLetter:{subject:'Application for Delivery Manager | LinkedIn (Ref: 12345) | Candidate'}}});
test('default generic candidate suffix becomes configured name without model output',()=>assert.equal(currentReviewSubject(review()),'Application for Delivery Manager | LinkedIn (Ref: 12345) | Vijay DAFAL'));
test('existing non-generic subject is not rewritten',()=>{const value=review();value.prepared.coverLetter.subject='Delivery leadership application';assert.equal(currentReviewSubject(value),'Delivery leadership application');});
test('current saved subject takes precedence over prepared subject',()=>assert.equal(currentReviewSubject({...review(),currentDraftSubject:'My reviewed subject'}),'My reviewed subject'));
test('configured profile name overrides the single-candidate fallback',()=>{const value=review();value.candidateDisplayName='Example Candidate';assert.ok(currentReviewSubject(value).endsWith('Example Candidate'));});
test('blank, multiline, control characters and oversized subjects are rejected',()=>{for(const value of ['', ' ', 'Good\r\nBcc: other@example.test', 'Good\n', 'Good\t', 'x'.repeat(301),null])assert.throws(()=>normalizeSubject(value),error=>error.code==='SUBJECT_INVALID');});
test('normalization trims surrounding spaces and keeps Unicode and punctuation',()=>assert.equal(normalizeSubject('  Delivery — £2M portfolio  '),'Delivery — £2M portfolio'));
test('explicit invalid queue subject never falls back to a prepared subject',()=>assert.throws(()=>queueSnapshotSubject(review(),''),/single-line/));
test('save changes only subject and does not mutate the supplied review',()=>{
 const original={...review(),currentDraftPlainText:'Body',refinementProposal:{proposedDraft:'Proposal'}};const before=JSON.stringify(original);
 const saved=reviewWithSavedSubject(original,'Edited subject');assert.equal(saved.currentDraftSubject,'Edited subject');assert.equal(saved.currentDraftPlainText,'Body');assert.equal(JSON.stringify(original),before);
});
test('queue captures explicit visible subject and remains independent of later review edits',async()=>{
 const state=review(),stored=[];
 const service=createOutreachQueueService({getReview:()=>state,contactStore:{async listByReview(){return[{id:'contact',selectedEmail:'matt@example.test',fullName:'Matt Smith'}];}},repository:{async addMany(items){stored.push(...structuredClone(items));return{added:items.length};}}});
 await service.add({reviewId:'r',recipients:[{contactId:'contact',email:'matt@example.test'}],bodyPlainText:'Reviewed body',subject:'Edited visible subject'});
 state.currentDraftSubject='Changed later';assert.equal(stored[0].subject,'Edited visible subject');
});
test('legacy queue requests use the locally corrected default subject',async()=>{
 let captured;const service=createOutreachQueueService({getReview:review,contactStore:{async listByReview(){return[{id:'c',selectedEmail:'matt@example.test'}];}},repository:{async addMany(items){captured=items;return{};}}});
 await service.add({reviewId:'r',recipients:[{contactId:'c',email:'matt@example.test'}],bodyPlainText:'Body'});assert.ok(captured[0].subject.endsWith('Vijay DAFAL'));
});
test('blank visible queue subject is rejected before persistence',async()=>{
 let writes=0;const service=createOutreachQueueService({getReview:review,contactStore:{async listByReview(){return[{id:'c',selectedEmail:'matt@example.test'}];}},repository:{async addMany(){writes++;}}});
 await assert.rejects(service.add({reviewId:'r',recipients:[{contactId:'c',email:'matt@example.test'}],bodyPlainText:'Body',subject:''}),/single-line/);assert.equal(writes,0);
});
test('subject save client calls only the local endpoint and leaves body untouched',async()=>{
 const callbacks={},input={value:'Edited subject',addEventListener(){}},button={dataset:{reviewId:'r'},disabled:false,addEventListener(name,fn){callbacks[name]=fn;}},status={textContent:''};
 const body={text:'Untouched body'};const doc={getElementById(id){return {'current-cover-letter-subject':input,'save-current-subject':button,'current-subject-status':status}[id];},querySelector(){return null;}};
 let url,options;attachSubjectEditors(doc,async(u,o)=>{url=u;options=o;return{ok:true,async json(){return{ok:true,subject:'Edited subject'};}};});
 await callbacks.click();assert.equal(url,'/review-subject-save');assert.equal(new URLSearchParams(options.body).get('subject'),'Edited subject');assert.equal(body.text,'Untouched body');assert.ok(status.textContent.includes('saved'));
});

import {renderApplicationReview,renderRefinementPanel} from '../../src/interfaces/http/rendering.js';
test('proposed subject belongs to the apply form and is safely escaped',()=>{
 const html=renderRefinementPanel({research:{status:'found'},currentSubject:'Role & "Name"',refinementProposal:{proposedDraft:'Evidence'}});
 assert.ok(html.includes('id="proposed-cover-letter-subject"'));assert.ok(html.includes('form="apply-refinement-form"'));
 assert.ok(html.includes('>Role &amp; &quot;Name&quot;</textarea>'));assert.ok(html.includes('id="apply-refinement-form"'));
});
test('current subject is independent of proposed subject and uses its own field',()=>{
 const html=renderApplicationReview({formData:{jobTitle:'Delivery Manager'},prepared:{coverLetter:{subject:'Original',plainText:'Body'}},currentDraftSubject:'Current subject',refinementProposal:{proposedDraft:'Proposal',proposedSubject:'Proposed subject'}});
 assert.ok(html.includes('id="current-cover-letter-subject"'));assert.ok(html.includes('>Current subject</textarea>'));assert.ok(html.includes('>Proposed subject</textarea>'));
});
