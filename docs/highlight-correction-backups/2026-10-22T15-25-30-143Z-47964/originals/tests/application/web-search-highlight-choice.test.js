import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerplexityCoverLetterRefinementAdapter } from '../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
import { refineCoverLetter } from '../../src/application/refine-cover-letter.js';
import { renderCoverLetterHtml } from '../../src/interfaces/http/cover-letter-html.js';
test('explicit search choice controls provider tools without changing legacy requests', async()=>{
  for (const choice of [false,true,undefined]) {
    let sent;
    const adapter=createPerplexityCoverLetterRefinementAdapter({apiKey:'synthetic',async fetchImpl(url,options){
      sent=JSON.parse(options.body);
      return {ok:true,async json(){return {output_parsed:{proposedDraft:'I led delivery.',highlightPhrases:[],warnings:[],appliedResearchPointIds:[],omittedResearchPointIds:[],suggestedResearchPoints:[]}};}};
    }});
    await adapter.refine({draftPlainText:'Original',maxWords:450,...(choice===undefined?{}:{webSearchEnabled:choice})});
    assert.equal(Object.hasOwn(sent,'tools'),choice!==false);
  }
});
test('normalization preserves an explicit false search choice', async()=>{
  let received;
  await refineCoverLetter({draftPlainText:'Original',webSearchEnabled:false},{coverLetterRefinementPort:{async refine(req){received=req;return {proposedDraft:'I led delivery.'};}}});
  assert.equal(received.webSearchEnabled,false);
});
test('job-aligned phrases use highlight markup, not automatic bold',()=>{
  const html=renderCoverLetterHtml('I led delivery dependencies.', ['delivery dependencies']);
  assert.ok(html.includes('<mark data-job-aligned="true" data-highlight="true">delivery dependencies</mark>'));
  assert.ok(!html.includes('<strong'));
});
