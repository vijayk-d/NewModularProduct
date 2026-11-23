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

test('normalizes manual research selections and returns a proposal without changing the draft', async () => {
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
      appliedResearchPointIds: [' value-excellence '],
      omittedResearchPointIds: [],
      suggestedResearchPoints: [{
        id: 'suggested-fact',
        type: 'fact',
        text: ' Official fact ',
        sourceUrl: 'https://example.test/about'
      }],
      citations: [],
      provider: 'fake-cover-letter-refinement',
      model: 'fake-model'
    }
  });

  const request = {
    draftPlainText: '  Original draft  ',
    jobDescriptionSummary: ' Delivery role ',
    selectedCvHighlights: [' Delivery ', ''],
    companyValues: [' Customer value '],
    selectedResearchPoints: [{
      id: ' value-excellence ',
      type: ' value ',
      text: ' Technical excellence ',
      sourceUrl: 'https://example.test/careers'
    }],
    organisationUrl: 'https://example.test',
    instructions: ' Improve clarity ',
    maxWords: 999
  };

  const result = await refineCoverLetter(request, {
    coverLetterRefinementPort: adapter
  });

  assert.deepEqual(calls, [{
    applicationJobTitle: '',
    organisationName: '',
    advertiserRelationship:'direct-employer',candidateProfessionalValues:'',allowUnknownOrganisation:false,
    jobAdvertLink: '',
    protectOutreachStructure: false,
    researchSources: [],
    letterTone: 'professional',
    excludedEmployers: ['micro1'],
    draftPlainText: 'Original draft',
    jobDescriptionSummary: 'Delivery role',
    selectedCvHighlights: ['Delivery'],
    companyValues: ['Customer value'],
    selectedResearchPoints: [{
      id: 'value-excellence',
      type: 'value',
      text: 'Technical excellence',
      sourceUrl: 'https://example.test/careers'
    }],
    organisationUrl: 'https://example.test/',
    instructions: 'Improve clarity',
    letterLengthMode:'standard',
    maxWords: 400
  }]);

  assert.equal(result.proposedDraft, 'Proposed draft');
  assert.equal(request.draftPlainText, '  Original draft  ');
  assert.deepEqual(result.review.strengths, ['Clear evidence']);
  assert.deepEqual(result.review.risks, ['Unverified claim']);
  assert.deepEqual(result.appliedResearchPointIds, ['value-excellence']);
  assert.deepEqual(result.suggestedResearchPoints, [{
    id: 'suggested-fact',
    type: 'fact',
    text: 'Official fact',
    sourceUrl: 'https://example.test/about'
  }]);
  assert.equal(result.provider, 'fake-cover-letter-refinement');
  assert.equal(result.model, 'fake-model');
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
  assert.deepEqual(result.appliedResearchPointIds, []);
  assert.deepEqual(result.omittedResearchPointIds, []);
  assert.deepEqual(result.suggestedResearchPoints, []);
  assert.deepEqual(result.citations, []);
  assert.equal(result.provider, '');
  assert.equal(result.model, '');
  assert.equal(
    result.error,
    '[REFINEMENT_FAILED] Cover-letter refinement is currently unavailable. Details: Maintenance, "Recent polishing and letter errors".'
  );
  assert.equal(result.errorCode, 'REFINEMENT_FAILED');
});
