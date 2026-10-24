import test from 'node:test';
import assert from 'node:assert/strict';
import { LETTER_TONES, normalizeLetterTone, assertLetterBodySafe, selectAlignedHighlights } from '../../src/application/cover-letter-controls.js';
import { composeOutreachLetter, extractOutreachExperienceBody } from '../../src/application/compose-outreach-letter.js';
import { renderCoverLetterHtml } from '../../src/interfaces/http/cover-letter-html.js';
import { renderRefinementPanel, renderApplicationReview } from '../../src/interfaces/http/rendering.js';
import { refineCoverLetter } from '../../src/application/refine-cover-letter.js';
import { createPerplexityCoverLetterRefinementAdapter } from '../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
const context={ jobTitle:'Delivery Manager', organisationName:'Ageas', advertUrl:'https://example.test/job', candidateName:'Vijay DAFAL' };
test('all four tone options are allowlisted and invalid values rejected',()=>{
  assert.equal(LETTER_TONES.length,4);
  assert.equal(normalizeLetterTone(), 'professional');
  for (const tone of LETTER_TONES) assert.equal(normalizeLetterTone(tone.value),tone.value);
  assert.throws(()=>normalizeLetterTone('<script>'), /supported/);
});
test('research URLs, Markdown links and citation markers are rejected',()=>{
  for(const body of ['I led delivery. https://ageas.co.uk', 'For reference [source](https://example.test)', 'Evidence [web:1]', 'Evidence [cite:2]', 'Policy www.example.com', 'See ageas.co.uk content.']) {
    assert.throws(()=>composeOutreachLetter({...context,draft:body}), error=>error.code==='REFINEMENT_BODY_LINK_REJECTED');
  }
});
test('protected advert URL remains valid and is not duplicated on recomposition',()=>{
  const letter=composeOutreachLetter({...context,draft:'I led squad delivery.'});
  assert.equal(composeOutreachLetter({...context,draft:letter}),letter);
  assert.equal(extractOutreachExperienceBody(letter),'I led squad delivery.');
});
test('stale proposals containing research links are rejected by acceptance extraction',()=>{
  const draft='Dear {{firstname}},\n\nJob advert: https://example.test/job\n\nI led delivery. See https://example.test/research\n\nWarm regards,\nVijay DAFAL';
  assert.throws(()=>extractOutreachExperienceBody(draft), /Research links/);
});
test('excluded micro1 employer variants are rejected without rewriting evidence',()=>{
  for(const body of ['I worked at micro1.', 'My Micro 1 engagement delivered results.']) {
    assert.throws(()=>assertLetterBodySafe(body), error=>error.code==='REFINEMENT_EXCLUDED_EMPLOYER');
  }
});
test('editorial commentary and raw script markup are rejected',()=>{
  assert.throws(()=>assertLetterBodySafe('I will make edits on request.'), /Editorial/);
  assert.throws(()=>assertLetterBodySafe('<script>alert(1)</script>'), /raw HTML/);
});
test('highlight selection requires body presence and JD/evidence word alignment',()=>{
  const request={jobDescriptionText:'Manage dependencies and stakeholder communication.',selectedCvText:'Led dependencies and stakeholder communication.'};
  assert.deepEqual(selectAlignedHighlights(['dependencies','stakeholder communication','cloud migration','missing'], 'I managed dependencies and stakeholder communication, plus cloud migration.', request), ['dependencies','stakeholder communication']);
});
test('rich rendering embeds advert, highlights safely and leaves source text unchanged',()=>{
  const text='Dear {{firstname}},\n\nJob advert: https://example.test/job?a=1&b=2\n\nI led dependency management & delivery.';
  const result=renderCoverLetterHtml(text,['dependency management','<img src=x>']);
  assert.match(result,/href="https:\/\/example.test\/job\?a=1&amp;b=2"/);
  assert.ok(result.includes('<mark data-job-aligned="true" data-highlight="true">dependency management</mark>'));
  assert.ok(result.includes('&amp; delivery.'));
  assert.ok(!result.includes('<img'));
  assert.ok(!text.includes('<strong'));
});
test('tone selector persists selected value and exposes micro1 exclusion notice',()=>{
  const result=renderRefinementPanel({reviewId:'synthetic',research:{status:'found',companyValues:[]},letterTone:'warm'});
  assert.ok(result.includes('name="letterTone"'));
  assert.ok(result.includes('value="warm" selected'));
  assert.ok(result.includes('micro1 is excluded'));
});
test('proposed and current editors both render their own phrase metadata',()=>{
  const proposal=renderRefinementPanel({research:{status:'found'}, refinementProposal:{proposedDraft:'I led delivery dependencies.',highlightPhrases:['delivery dependencies']}});
  assert.ok(proposal.includes('<mark data-job-aligned="true" data-highlight="true">delivery dependencies</mark>'));
  const current=renderApplicationReview({formData:{jobTitle:'Delivery Manager'},prepared:{coverLetter:{plainText:'Original'}}, currentDraftPlainText:'I led delivery dependencies.',currentHighlightPhrases:['delivery dependencies']});
  assert.ok(current.includes('<mark data-job-aligned="true" data-highlight="true">delivery dependencies</mark>'));
});
test('normalization passes tone, exclusion and protected composition fields through',async()=>{
  let received;
  const source={draftPlainText:'Original',applicationJobTitle:'Delivery Manager',organisationName:'Ageas',jobAdvertLink:'https://example.test/job',protectOutreachStructure:true,letterTone:'warm',excludedEmployers:['micro1']};
  await refineCoverLetter(source,{coverLetterRefinementPort:{async refine(req){received=req;return{proposedDraft:'I led delivery.'};}}});
  assert.equal(received.letterTone,'warm');
  assert.deepEqual(received.excludedEmployers,['micro1']);
  assert.equal(received.protectOutreachStructure,true);
  assert.equal(received.organisationName,'Ageas');
  assert.equal(source.draftPlainText,'Original');
});
test('provider payload contains tone and explicit exclusion policy',async()=>{
  let sent;
  const adapter=createPerplexityCoverLetterRefinementAdapter({apiKey:'synthetic',async fetchImpl(url,options){
    sent=JSON.parse(options.body); return {ok:true,async json(){return{output_parsed:{proposedDraft:'I led delivery dependencies.',highlightPhrases:['delivery dependencies'],warnings:[],appliedResearchPointIds:[],omittedResearchPointIds:[],suggestedResearchPoints:[]}};}};
  }});
  const result=await adapter.refine({draftPlainText:'Original',letterTone:'concise',jobDescriptionText:'Manage delivery dependencies.',selectedCvText:'Led delivery dependencies.',maxWords:450});
  const prompt=JSON.parse(sent.input[1].content[0].text);
  assert.equal(prompt.tone,'concise');
  assert.deepEqual(prompt.excludedEmployers,['micro1']);
  assert.deepEqual(result.highlightPhrases,['delivery dependencies']);
});
