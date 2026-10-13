import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerplexityCoverLetterRefinementAdapter } from '../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
function adapterFor(proposedDraft) {
  return createPerplexityCoverLetterRefinementAdapter({ apiKey: 'synthetic', async fetchImpl() {
    return { ok: true, async json() { return { output_parsed: { proposedDraft,
      highlightPhrases: [], warnings: [], appliedResearchPointIds: [], omittedResearchPointIds: [], suggestedResearchPoints: [] } }; } };
  } });
}
const request = { draftPlainText: 'Original', candidateDisplayName: 'Vijay DAFAL', maxWords: 450 };
test('candidate token becomes literal configured name and firstname stays unresolved', async () => {
  const result = await adapterFor('Dear {{firstname}},\n\nDelivery experience.\n\nWarm regards,\n{{candidateDisplayName}}').refine(request);
  assert.ok(result.proposedDraft.endsWith('Vijay DAFAL'));
  assert.ok(result.proposedDraft.startsWith('Dear {{firstname}},'));
  assert.ok(!result.proposedDraft.includes('candidateDisplayName'));
});
test('correct literal signoff is retained', async () => {
  const result = await adapterFor('Dear {{firstname}},\n\nDelivery experience.\n\nWarm regards,\nVijay DAFAL').refine(request);
  assert.ok(result.proposedDraft.endsWith('Vijay DAFAL'));
});
test('unknown internal tokens are rejected', async () => {
  await assert.rejects(adapterFor('Dear {{firstname}},\n{{internalField}}\nWarm regards,\nVijay DAFAL').refine(request), /unresolved internal placeholder/);
});
test('incorrect candidate signoff is rejected', async () => {
  await assert.rejects(adapterFor('Dear {{firstname}},\nDelivery experience.\nWarm regards,\nCandidate').refine(request), /configured candidate name/);
});
