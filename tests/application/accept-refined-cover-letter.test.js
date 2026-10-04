import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acceptRefinedCoverLetter
} from '../../src/application/accept-refined-cover-letter.js';

test('requires an original draft', () => {
  assert.throws(
    () => acceptRefinedCoverLetter({
      proposedDraftPlainText: 'Proposed draft',
      accepted: true
    }),
    /An original cover-letter draft is required\./
  );
});

test('requires a proposed draft', () => {
  assert.throws(
    () => acceptRefinedCoverLetter({
      originalDraftPlainText: 'Original draft',
      accepted: true
    }),
    /A proposed cover-letter draft is required\./
  );
});

test('keeps the original draft when acceptance is not explicit', () => {
  const result = acceptRefinedCoverLetter({
    originalDraftPlainText: 'Original draft',
    proposedDraftPlainText: 'Proposed draft'
  });

  assert.deepEqual(result, {
    accepted: false,
    finalDraftPlainText: 'Original draft',
    reason: 'The proposed draft was not accepted.'
  });
});

test('rejects any acceptance value other than true', () => {
  const result = acceptRefinedCoverLetter({
    originalDraftPlainText: 'Original draft',
    proposedDraftPlainText: 'Proposed draft',
    accepted: 'yes'
  });

  assert.equal(result.accepted, false);
  assert.equal(result.finalDraftPlainText, 'Original draft');
});

test('uses the proposed draft only after explicit acceptance', () => {
  const result = acceptRefinedCoverLetter({
    originalDraftPlainText: 'Original draft',
    proposedDraftPlainText: 'Proposed draft',
    accepted: true
  });

  assert.deepEqual(result, {
    accepted: true,
    finalDraftPlainText: 'Proposed draft',
    reason: 'The proposed draft was accepted.'
  });
});

test('does not mutate the supplied inputs', () => {
  const request = {
    originalDraftPlainText: 'Original draft',
    proposedDraftPlainText: 'Proposed draft',
    accepted: true
  };

  acceptRefinedCoverLetter(request);

  assert.equal(request.originalDraftPlainText, 'Original draft');
  assert.equal(request.proposedDraftPlainText, 'Proposed draft');
});