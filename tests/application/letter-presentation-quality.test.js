import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCoverLetterHtml } from '../../src/interfaces/http/cover-letter-html.js';
import { createPerplexityCoverLetterRefinementAdapter } from '../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
test('protected advert line becomes an embedded link without changing source text', () => {
  const text='Dear {{firstname}},\n\nJob advert: https://example.test/job?id=1&ref=2\n\nEvidence.';
  const html=renderCoverLetterHtml(text);
  assert.ok(html.includes('href="https://example.test/job?id=1&amp;ref=2"'));
  assert.ok(html.includes('>Job advert</a>'));
  assert.ok(text.includes('Job advert: https://example.test/job?id=1&ref=2'));
});
test('raw HTML and unsafe link schemes remain escaped text', () => {
  const html=renderCoverLetterHtml('<script>alert(1)</script>\nJob advert: javascript:alert(1)');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<a '));
});
test('ordinary letter paragraphs preserve breaks and currency symbols', () => {
  assert.equal(renderCoverLetterHtml('First paragraph.\n\nSaved £1.8M.'),'First paragraph.<br><br>Saved £1.8M.');
});
function fakeAdapter(warnings, capture) {
  return createPerplexityCoverLetterRefinementAdapter({ apiKey:'synthetic',async fetchImpl(url,options) {
    capture.request=JSON.parse(options.body);
    return {ok:true,async json(){return {output_parsed:{
      proposedDraft:'Dear {{firstname}},\n\nSupported delivery evidence.\n\nWarm regards,\nVijay DAFAL',
      warnings,highlightPhrases:[],appliedResearchPointIds:[],omittedResearchPointIds:[],suggestedResearchPoints:[]
    }};}};
  }});
}
const req={draftPlainText:'Original',candidateDisplayName:'Vijay DAFAL',maxWords:450};
test('reported mixed-language warning is rejected rather than silently stripped',async()=>{
  await assert.rejects(fakeAdapter(['Overlap 没有想到 requires review'],{}).refine(req),/mixed-language/);
});
test('English warnings retain currency and prompt restricts evidence attribution',async()=>{
  const capture={};
  const result=await fakeAdapter(['Check £1.8M source attribution.'],capture).refine(req);
  assert.deepEqual(result.warnings,['Check £1.8M source attribution.']);
  const system=capture.request.input[0].content[0].text;
  assert.ok(system.includes('Write every response field in English'));
  assert.ok(system.includes('Never assign a summary-level claim'));
  assert.ok(system.includes('Do not guess which engagement is current'));
});
