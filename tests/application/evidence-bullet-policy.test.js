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
test('keeps every selected scenario, same organisation adjacent, with a combine warning',()=>{
 const r=selectScenariosForRole(sc,jd);
 assert.equal(r.kept.length,5);assert.equal(r.dropped.length,0);
 const ids=r.kept.map(s=>s.id);assert.equal(Math.abs(ids.indexOf('c')-ids.indexOf('d')),1);
 assert.match(r.warnings.join(' '),/SKY has 2 selected scenarios/);
 assert.deepEqual(selectScenariosForRole([],jd),{kept:[],dropped:[],warnings:[]});
 assert.equal(selectScenariosForRole(sc.slice(1,3),jd).warnings.length,0);
});
test('AI scenarios stay eligible when the role asks for AI',()=>{
 const r=selectScenariosForRole([sc[0]],'AI delivery reporting lead');assert.equal(r.kept[0].id,'a');
});
test('flags missing bullets, excess items, repeated organisation, weak verbs and activity-only lines',()=>{
 const draft=['Intro.','At LEXISNEXIS, I centralised reporting.','At SKY, I introduced PI planning.','At SKY, I supported early delivery.','At DNB, I supported integration.','Close.'].join('\n');
 const w=evidenceBulletWarnings(draft,sc).join(' ');
 assert.match(w,/lack the • bullet/);assert.match(w,/Selected ARABIA scenario is missing/);assert.match(w,/SKY appears in 2/);assert.match(w,/Weak verb in DNB/);assert.match(w,/SKY evidence is activity-only/);
 assert.deepEqual(evidenceBulletWarnings('Intro.\n• At SKY, I improved engagement by 30% through PI planning.\n• At DNB, I led Salesforce integration delivery.',sc.filter(s=>['SKY','DNB'].includes(s.organisation))),[]);
});
import {periodEnd,polishParameters} from '../../src/application/evidence-bullet-policy.js';
import {approvedScenarioRequest} from '../../src/application/scenario-polishing.js';
test('kept scenarios are ordered most recent employment first',()=>{
 const s=[{id:'dnb',organisation:'DNB',period:'2015 - 2017',approvedWording:'I coordinated delivery risks for clients.',evidenceState:'user-confirmed'},
  {id:'sky',organisation:'SKY',period:'Mar 2019 – Jun 2021',approvedWording:'I coached delivery teams on risks.',evidenceState:'user-confirmed'},
  {id:'lex',organisation:'LEXISNEXIS',period:'2023 – present',approvedWording:'I managed client delivery risks.',evidenceState:'user-confirmed'}];
 assert.deepEqual(selectScenariosForRole(s,jd).kept.map(x=>x.id),['lex','sky','dnb']);
 assert.equal(periodEnd('Jan 2020 to Current'),9999);assert.equal(periodEnd(''),-1);
 const r=approvedScenarioRequest({snapshots:[{scenarioId:'s1',approvedWording:'x',evidenceState:'user-confirmed'}],organisations:['SKY'],periods:['2019–2021']});
 assert.equal(r.approvedScenarioEvidence[0].period,'2019–2021');
});
test('polish parameters summarise tone, size and evidence',()=>{
 const p=polishParameters({request:{letterTone:'consultative',jobDescriptionText:jd},draft:'Hi\n• At SKY, I improved engagement by 30%.\nAt DNB, I led delivery.',quality:{mode:'standard',wordCount:12,targetMinimum:300,maximumWords:400},selection:{kept:[1,2],dropped:[3]},toneLabel:'Consultative and problem-solving'});
 assert.equal(p.tone,'Consultative and problem-solving');assert.equal(p.evidenceItems,2);assert.equal(p.bulletedItems,1);assert.equal(p.itemsWithMetric,1);
 assert.equal(p.evidenceOrder,'SKY → DNB');assert.equal(p.scenariosSelected,3);assert.equal(p.targetWords,'300–400');assert.equal(p.jobMentionsAi,false);assert.ok(p.characters>0);
});
