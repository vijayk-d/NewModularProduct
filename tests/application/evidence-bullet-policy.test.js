import test from 'node:test';
import assert from 'node:assert/strict';
import {selectScenariosForRole,evidenceBulletWarnings} from '../../src/application/evidence-bullet-policy.js';
const jd='Delivery Manager for government projects. Build client relationships, manage risks and dependencies, coach other delivery managers and support team health.';
const sc=[
 {id:'a',organisation:'LEXISNEXIS',approvedWording:'I centralised AI delivery reporting for leadership.',evidenceState:'user-confirmed'},
 {id:'b',organisation:'ARABIA INSURANCE',approvedWording:'I managed delivery risks and dependencies using RAID across squads.',evidenceState:'user-confirmed'},
 {id:'c',organisation:'SKY',approvedWording:'I improved engagement by 30% by coaching delivery managers and team health practices.',evidenceState:'user-confirmed'},
 {id:'d',organisation:'SKY',approvedWording:'I delivered identity features with £500K/year lower support costs.',evidenceState:'user-confirmed'},
 {id:'e',organisation:'DNB',approvedWording:'I coordinated client relationships for Salesforce integration delivery.',evidenceState:'user-confirmed'}];
test('keeps three role-relevant scenarios, one per organisation, AI last for non-AI roles',()=>{
 const r=selectScenariosForRole(sc,jd);
 assert.equal(r.kept.length,3);
 assert.equal(new Set(r.kept.map(s=>s.organisation)).size,3);
 assert.ok(!r.kept.some(s=>s.id==='a'));
 assert.equal(r.dropped.length,2);assert.match(r.warnings[0],/Not used/);
 assert.deepEqual(selectScenariosForRole([],jd),{kept:[],dropped:[],warnings:[]});
 assert.equal(selectScenariosForRole(sc.slice(1,3),jd).warnings.length,0);
});
test('AI scenarios stay eligible when the role asks for AI',()=>{
 const r=selectScenariosForRole([sc[0]],'AI delivery reporting lead');assert.equal(r.kept[0].id,'a');
});
test('flags missing bullets, excess items, repeated organisation, weak verbs and activity-only lines',()=>{
 const draft=['Intro.','At LEXISNEXIS, I centralised reporting.','At SKY, I introduced PI planning.','At SKY, I supported early delivery.','At DNB, I supported integration.','Close.'].join('\n');
 const w=evidenceBulletWarnings(draft,sc).join(' ');
 assert.match(w,/lack the • bullet/);assert.match(w,/4 evidence items/);assert.match(w,/SKY appears in 2/);assert.match(w,/Weak verb in DNB/);assert.match(w,/SKY evidence is activity-only/);
 assert.deepEqual(evidenceBulletWarnings('Intro.\n• At SKY, I improved engagement by 30% through PI planning.\n• At DNB, I led Salesforce integration delivery.',sc),[]);
});
