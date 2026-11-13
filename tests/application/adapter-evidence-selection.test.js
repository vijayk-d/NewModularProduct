import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerplexityCoverLetterRefinementAdapter} from '../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
test('adapter keeps, orders and reports scenario evidence (server path)',async()=>{
 let sent='';
 const draft='Dear {{firstname}},\n\nI am keen on this Delivery Manager role.\nAt SKY, I supported delivery.\nAt DNB, I led integration.\n\nWarm regards,\nTest Person';
 const adapter=createPerplexityCoverLetterRefinementAdapter({apiKey:'synthetic',async fetchImpl(_u,init){sent=String(init?.body||'');return {ok:true,async json(){return {output_parsed:{proposedDraft:draft,warnings:[],highlightPhrases:[],appliedResearchPointIds:[],omittedResearchPointIds:[],suggestedResearchPoints:[]}};}};}});
 const sc=['2016','2018','2020','2022'].map((y,i)=>({id:'s'+i,organisation:'ORG'+i,period:y,approvedWording:'I managed delivery risks for clients number '+i+'.',evidenceState:'user-confirmed'}));
 const r=await adapter.refine({draftPlainText:'Original',letterTone:'consultative',jobAdvertLink:'https://example.test/job',applicationJobTitle:'Delivery Manager',organisationName:'Example',candidateDisplayName:'Test Person',maxWords:400,jobDescriptionText:'Delivery Manager managing delivery risks for clients.',approvedScenarioEvidence:sc});
 const order=['s3','s2','s1','s0'].map(id=>sent.indexOf('\\"id\\":\\"'+id+'\\"')>=0?sent.indexOf('\\"id\\":\\"'+id+'\\"'):sent.indexOf('"id":"'+id+'"'));
 assert.ok(order.every(i=>i>=0),'kept scenarios sent');assert.ok(order[0]<order[1]&&order[1]<order[2]&&order[2]<order[3],'most recent first');
 assert.ok(!r.warnings.some(w=>/Not used/.test(w)));assert.ok(r.warnings.some(w=>/ORG0 scenario is missing/.test(w)));assert.ok(r.warnings.some(w=>/markers were added locally/.test(w)));assert.match(r.proposedDraft,/• At SKY/);
 assert.equal(r.polishParameters.tone,'Consultative and problem-solving');assert.equal(r.polishParameters.scenariosUsed,4);assert.equal(r.polishParameters.evidenceOrder,'SKY → DNB');
});
