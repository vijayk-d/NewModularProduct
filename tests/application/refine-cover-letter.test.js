import test from 'node:test';
import assert from 'node:assert/strict';

import { refineCoverLetter } from '../../src/application/refine-cover-letter.js';
import {
  createFakeCoverLetterRefinementAdapter
} from '../../src/infrastructure/refinement/fake-cover-letter-refinement-adapter.js';

test('requires a non-empty draft', async () => {
  const adapter = createFakeCoverLetterRefinementAdapter();

  await assert.rejects(
    () => refineCoverLetter({}, { coverLetterRefinementPort: adapter }),
    /A non-empty cover-letter draft is required\./
  );
});

test('requires an injected refinement port', async () => {
  await assert.rejects(
    () => refineCoverLetter({ draftPlainText: 'Draft' }, {}),
    /A coverLetterRefinementPort with a refine function is required\./
  );
});

test('sends a normalized request and returns a proposal without changing the draft', async () => {
  const calls = [];
  const adapter = createFakeCoverLetterRefinementAdapter({
    calls,
    result: {
      review: {
        strengths: [' Clear evidence '],
        risks: [' Unverified claim '],
        unsupportedClaims: [],
        suggestedChanges: [' Add measurable outcome ']
      },
      proposedDraft: 'Proposed draft',
      citations: [],
      provider: 'fake-cover-letter-refinement'
    }
  });

  const request = {
    draftPlainText: '  Original draft  ',
    jobDescriptionSummary: ' Delivery role ',
    selectedCvHighlights: [' Delivery ', ''],
    companyValues: [' Customer value '],
    instructions: ' Improve clarity '
  };

  const result = await refineCoverLetter(request, {
    coverLetterRefinementPort: adapter
  });

  assert.deepEqual(calls, [{
    draftPlainText: 'Original draft',
    jobDescriptionSummary: 'Delivery role',
    selectedCvHighlights: ['Delivery'],
    companyValues: ['Customer value'],
    instructions: 'Improve clarity'
  }]);

  assert.equal(result.proposedDraft, 'Proposed draft');
  assert.equal(request.draftPlainText, '  Original draft  ');
  assert.deepEqual(result.review.strengths, ['Clear evidence']);
  assert.deepEqual(result.review.risks, ['Unverified claim']);
  assert.deepEqual(result.citations, []);
  assert.equal(result.provider, 'fake-cover-letter-refinement');
});

test('converts an adapter failure into a controlled refinement error', async () => {
  const adapter = createFakeCoverLetterRefinementAdapter({
    error: new Error('Provider unavailable')
  });

  const result = await refineCoverLetter(
    { draftPlainText: 'Draft' },
    { coverLetterRefinementPort: adapter }
  );

  assert.deepEqual(result.review, {
    strengths: [],
    risks: [],
    unsupportedClaims: [],
    suggestedChanges: []
  });
  assert.equal(result.proposedDraft, '');
  assert.deepEqual(result.citations, []);
  assert.equal(result.provider, '');
  assert.equal(
    result.error,
    'Cover-letter refinement is currently unavailable.'
  );
});
