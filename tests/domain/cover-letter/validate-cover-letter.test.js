import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCoverLetter } from '../../../src/domain/cover-letter/validate-cover-letter.js';

test('accepts supported unresolved template tokens', () => {
  const validation = validateCoverLetter({
    plainText:
      'Dear {{firstname}},\n\nI am keen to apply for the {{role}} opportunity.',
    richText:
      '<p>Dear {{firstname}},</p><p>I am keen to apply for the {{role}} opportunity.</p><a href="https://example.test">Job advert</a>'
  });

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
  assert.ok(validation.wordCount > 0);
});

test('rejects unsupported unresolved template tokens', () => {
  const validation = validateCoverLetter({
    plainText: 'Dear {{firstname}}, {{unknown}}.',
    richText: '<a href="https://example.test">Job advert</a>'
  });

  assert.equal(validation.valid, false);
  assert.match(
    validation.errors.join(' '),
    /Unresolved template tokens: unknown\./i
  );
});

test('requires an embedded advert hyperlink in rich text', () => {
  const validation = validateCoverLetter({
    plainText: 'Dear {{firstname}},',
    richText: '<p>Dear {{firstname}},</p>'
  });

  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.includes(
      'The advert hyperlink is not embedded in rich text.'
    )
  );
});
