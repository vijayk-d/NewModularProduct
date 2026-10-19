import {coverLetterBudget} from '../../src/application/cover-letter-budget.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeOutreachLetter, OUTREACH_REDIRECTION } from '../../src/application/compose-outreach-letter.js';
import { createPerplexityCoverLetterRefinementAdapter } from '../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
const context = { jobTitle: 'Delivery Manager', organisationName: 'Ageas', advertUrl: 'https://example.test/jobs/123', candidateName: 'Vijay DAFAL' };
test('local composition protects purpose, exact advert URL, outreach paragraph and name', () => {
  const body = composeOutreachLetter({ ...context, draft: 'Dear {{firstname}},\n\nI led multi-squad delivery.\n\nWarm regards,\nVijay DAFAL' });
  assert.ok(body.startsWith('Dear {{firstname}},\n\nI am applying for the Delivery Manager opportunity at Ageas.'));
  assert.ok(body.includes('Role details: https://example.test/jobs/123'));
  assert.ok(body.includes(OUTREACH_REDIRECTION));
  assert.ok(body.endsWith('Warm regards,\nVijay DAFAL'));
});
test('old application opening and exact ATS paragraph are not duplicated', () => {
  const body = composeOutreachLetter({ ...context, draft: `Dear {{firstname}},\n\nI would like to apply for the Delivery Manager position.\n\nI led delivery.\n\n${OUTREACH_REDIRECTION}\n\nWarm regards,\nVijay DAFAL` });
  assert.equal(body.split(OUTREACH_REDIRECTION).length, 2);
  assert.ok(!body.includes('I would like to apply'));
  assert.ok(body.includes('I led delivery.'));
});
test('missing or unsafe advert URL is rejected', () => {
  for (const advertUrl of ['', 'javascript:alert(1)']) {
    assert.throws(() => composeOutreachLetter({ ...context, advertUrl, draft: 'Evidence paragraph.' }), /URL/);
  }
});
test('internal placeholders and raw HTML cannot reach composed body', () => {
  for (const draft of ['Evidence {{internalField}}.', '<a href="https://example.test">Advert</a>']) {
    assert.throws(() => composeOutreachLetter({ ...context, draft }), /placeholders or raw HTML/);
  }
});
test('provider prompt gets runtime date and reduced budget, final output includes protected content', async () => {
  let sent;
  const adapter = createPerplexityCoverLetterRefinementAdapter({ apiKey: 'synthetic', async fetchImpl(url, options) {
    sent=JSON.parse(options.body);
    return { ok: true, async json() { return { output_parsed: {
      proposedDraft: 'Dear {{firstname}},\n\nI led delivery across squads.\n\nWarm regards,\nVijay DAFAL',
      warnings: [], highlightPhrases: ['delivery across squads'], appliedResearchPointIds: [], omittedResearchPointIds: [], suggestedResearchPoints: []
    } }; } };
  } });
  const result=await adapter.refine({ draftPlainText: 'Original draft', applicationJobTitle: context.jobTitle,
    organisationName: context.organisationName, jobAdvertLink: context.advertUrl, candidateDisplayName: context.candidateName,
    protectOutreachStructure: true, maxWords: 450 });
  const prompt=JSON.parse(sent.input[1].content[0].text);
  assert.equal(prompt.currentDate, new Date().toISOString().slice(0,10));
  assert.equal(prompt.constraints.maxWords,coverLetterBudget({applicationJobTitle:context.jobTitle,organisationName:context.organisationName,jobAdvertLink:context.advertUrl,candidateDisplayName:context.candidateName,protectOutreachStructure:true,maxWords:450}).maximumExperienceWords);
  assert.equal(prompt.constraints.fullLetterMaximumWords,400);
  assert.ok(result.proposedDraft.includes(context.advertUrl));
  assert.ok(result.proposedDraft.includes(OUTREACH_REDIRECTION));
});
