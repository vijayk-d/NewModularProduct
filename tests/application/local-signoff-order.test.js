import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerplexityCoverLetterRefinementAdapter } from '../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
const context={draftPlainText:'Original draft',applicationJobTitle:'Delivery Manager',organisationName:'Ageas',jobAdvertLink:'https://example.test/jobs/1',candidateDisplayName:'Vijay DAFAL',protectOutreachStructure:true,maxWords:450};
function adapter(draft){return createPerplexityCoverLetterRefinementAdapter({apiKey:'synthetic',async fetchImpl(){return {ok:true,async json(){return {output_parsed:{proposedDraft:draft,warnings:[],highlightPhrases:[],appliedResearchPointIds:[],omittedResearchPointIds:[],suggestedResearchPoints:[]}};}};}});}
test('body-only provider response gets the exact local signoff',async()=>{
  const result=await adapter('I led delivery across squads.').refine(context);
  assert.ok(result.proposedDraft.endsWith('Warm regards,\nVijay DAFAL'));
  assert.ok(result.proposedDraft.includes('I led delivery across squads.'));
});
test('provider closing is replaced by the configured local identity',async()=>{
  const result=await adapter('Dear {{firstname}},\n\nI led delivery across squads.\n\nKind regards,\nOther Name').refine(context);
  assert.ok(result.proposedDraft.endsWith('Warm regards,\nVijay DAFAL'));
  assert.ok(!result.proposedDraft.includes('Other Name'));
});
test('non-protected provider letter still needs the configured candidate name',async()=>{
  await assert.rejects(adapter('I led delivery across squads.').refine({...context,protectOutreachStructure:false}),/configured candidate name/);
});
test('empty provider body is not repaired into an acceptable letter',async()=>{
  await assert.rejects(adapter('').refine(context),/no usable draft/);
});
