import test from 'node:test';
import assert from 'node:assert/strict';
import {selectScenariosForRole,evidenceBulletWarnings,bulletEvidenceLines,orgKey} from '../../src/application/evidence-bullet-policy.js';
const jd='Delivery Manager on government projects: client relationships, risks, dependencies, team health and coaching.';
const u='user-confirmed';
test('variant employer names group together; newest employer first; nothing discarded',()=>{
 assert.equal(orgKey({organisation:'Sky UK Ltd'}),'SKY');assert.equal(orgKey({organisation:'',approvedWording:'At SKY, I led x.'}),'SKY');
 const sc=[
  {id:'lex',organisation:'LEXISNEXIS',period:'2023 – present',approvedWording:'I centralised delivery, quality, capacity and release reporting across AI delivery workstreams for leadership risk discussions.',evidenceState:u},
  {id:'ara',organisation:'ARABIA INSURANCE',period:'2021 – 2023',approvedWording:'I led delivery of an AI fraud-detection MVP, managing risks and dependencies with client teams.',evidenceState:u},
  {id:'sky1',organisation:'SKY',period:'2018 – 2020',approvedWording:'I improved engagement by 30% through remote PI planning and inclusive team ceremonies.',evidenceState:u},
  {id:'sky2',organisation:'Sky UK',period:'2018 – 2020',approvedWording:'I supported delivery of identity features linked to £500K/year lower support costs.',evidenceState:u},
  {id:'dnb',organisation:'DNB',period:'2015 – 2017',approvedWording:'I supported Salesforce integration delivery.',evidenceState:u}];
 const k=selectScenariosForRole(sc,jd).kept;
 assert.deepEqual(k.map(s=>s.id).slice(0,2),['lex','ara']);assert.equal(k.length,5);
 assert.equal(k.at(-1).id,'dnb');
});
test('bullets added locally without changing wording; SKY variants flagged; unsupported public-sector claim flagged',()=>{
 const d='Intro.\nAt SKY, I led a.\nAt Sky UK, I led b.\nClose.';
 assert.equal(bulletEvidenceLines(d),'Intro.\n• At SKY, I led a.\n• At Sky UK, I led b.\nClose.');
 assert.match(evidenceBulletWarnings(d,[]).join(' '),/SKY appears in 2/);
 assert.match(evidenceBulletWarnings('It fits my public-sector delivery background.',[],'banking delivery').join(' '),/public-sector/);
 assert.equal(evidenceBulletWarnings('It fits my public-sector delivery background.',[],'delivered for HMRC').length,0);
});
