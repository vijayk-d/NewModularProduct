import test from 'node:test';
import assert from 'node:assert/strict';
import {isPureRoleInterest as pure,normaliseClaimKinds,assertMotivationKind} from '../src/application/cover-letter-claim-kind.js';
const opening='I am interested in Answer Digital’s Lead Delivery Consultant role because it combines hands-on Agile delivery with helping teams and clients improve how they work.';
test('exact reported opening is motivation',()=>assert.equal(pure(opening),true));
test('old mislabel corrected without altering response or wording',()=>{const raw={claimType:'prospective',draftQuote:opening,evidence:[],requirementIds:['R1']},result=normaliseClaimKinds([raw]);assert.equal(raw.claimType,'prospective');assert.equal(result.claims[0].claimType,'motivation');assert.equal(result.claims[0].draftQuote,opening);assert.deepEqual(result.adjustments.map(x=>[x.claimIndex,x.originalType,x.effectiveType]),[[0,'prospective','motivation']]);});
test('new explicit motivation is accepted without pretending to prove candidate achievements',()=>assert.doesNotThrow(()=>assertMotivationKind({claimType:'motivation',draftQuote:opening})));
for(const s of [
 'I am interested in this role because I have led AI academies.',
 "I am interested in this role because it matches my experience.",
 'I am interested in this role because it draws on our achievements.',
 'I am interested in this role because it requires a PhD.',
 'I am interested in this role because it offers £120K.',
 'I am interested in this role because it offers 37% more impact.',
 'I am interested in this role because it offers learning. I have delivered academies.',
 'At Employer A, I delivered learning programmes.',
 'In my first 3–6 months, I would understand client needs.'
])test('does not hide candidate assertions/plans as motivation: '+s,()=>{assert.equal(pure(s),false);assert.throws(()=>assertMotivationKind({claimType:'motivation',draftQuote:s}),{auditReasonCode:'CLQ_MOTIVATION_SCOPE'});});
test('real future plan is not relabelled',()=>{const raw={claimType:'prospective',draftQuote:'I would understand client needs.'};assert.equal(normaliseClaimKinds([raw]).claims[0].claimType,'prospective');});
test('past claim mislabel is left to existing guard, not repaired into motivation',()=>{const raw={claimType:'prospective',draftQuote:'I delivered programmes.'};assert.deepEqual(normaliseClaimKinds([raw]).adjustments,[]);});
test('other types are unchanged',()=>{const raw={claimType:'outcome',draftQuote:'Reduced spending by 25%.'};assert.equal(normaliseClaimKinds([raw]).claims[0].claimType,'outcome');});
