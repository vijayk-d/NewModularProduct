import test from 'node:test';
import assert from 'node:assert/strict';
import { refineCoverLetter } from '../../src/application/refine-cover-letter.js';
import { createPerplexityCoverLetterRefinementAdapter } from '../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';

test('refinement preserves full JD, CV and LinkedIn evidence without mutating the draft', async () => {
  let received;
  const request = { draftPlainText: 'Original draft', jobDescriptionText: 'Full delivery requirements',
    selectedCvText: 'Led delivery at Example', candidateLinkedInText: 'Delivery profile',
    candidateLinkedInUrl: 'https://www.linkedin.com/in/example/', candidateDisplayName: 'Example Candidate' };
  const result = await refineCoverLetter(request, { coverLetterRefinementPort: { async refine(value) {
    received = value; return { proposedDraft: 'I led delivery at Example.', highlightPhrases: ['led delivery', 'absent phrase'], warnings: ['Review evidence'] };
  } } });
  assert.equal(received.selectedCvText, request.selectedCvText);
  assert.equal(received.jobDescriptionText, request.jobDescriptionText);
  assert.equal(received.candidateLinkedInText, request.candidateLinkedInText);
  assert.equal(request.draftPlainText, 'Original draft');
  assert.deepEqual(result.highlightPhrases, ['led delivery']);
  assert.deepEqual(result.warnings, ['Review evidence']);
});
test('provider request includes evidence and highlight schema; warnings survive response parsing', async () => {
  let sent;
  const adapter = createPerplexityCoverLetterRefinementAdapter({ apiKey: 'synthetic-key',
    async fetchImpl(url, options) {
      sent = JSON.parse(options.body);
      return { ok: true, async json() { return { output_parsed: {
        proposedDraft: 'Dear {{firstname}},\n\nI led delivery at Example.',
        highlightPhrases: ['led delivery', 'not present'], warnings: ['Check profile dates'],
        appliedResearchPointIds: [], omittedResearchPointIds: [], suggestedResearchPoints: []
      } }; } };
    }
  });
  const result = await adapter.refine({ draftPlainText: 'Original', selectedCvText: 'CV evidence: led delivery at Example',
    jobDescriptionText: 'Full JD: led delivery', candidateLinkedInText: 'Profile evidence', maxWords: 450 });
  const prompt = JSON.parse(sent.input[1].content[0].text);
  assert.equal(prompt.selectedCvText, 'CV evidence: led delivery at Example');
  assert.equal(prompt.fullJobDescription, 'Full JD: led delivery');
  assert.equal(prompt.candidateLinkedInText, 'Profile evidence');
  assert.ok(sent.response_format.json_schema.schema.required.includes('highlightPhrases'));
  assert.deepEqual(result.highlightPhrases, ['led delivery']);
  assert.deepEqual(result.warnings, ['Check profile dates']);
});
test('provider failure retains the caller draft and returns controlled failure', async () => {
  const request = { draftPlainText: 'Preserved original' };
  const result = await refineCoverLetter(request, { coverLetterRefinementPort: { async refine() { throw new Error('Synthetic failure'); } } });
  assert.equal(result.proposedDraft, '');
  assert.ok(result.error);
  assert.equal(request.draftPlainText, 'Preserved original');
});
