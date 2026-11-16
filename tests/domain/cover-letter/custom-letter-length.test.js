import test from 'node:test';
import assert from 'node:assert/strict';
import {lengthPolicy, normalizeLengthMode, assessLetterQuality, assertLetterLength, customLengthMode} from '../../../src/domain/cover-letter/letter-quality-policy.js';
import {coverLetterBudget} from '../../../src/application/cover-letter-budget.js';

test('standard and extended policies are unchanged apart from a readable label', () => {
  assert.deepEqual(lengthPolicy('standard', 500), {version: 'senior-cover-letter-quality-v1', mode: 'standard', label: 'Standard senior', maximumWords: 400, targetMinimum: 300});
  assert.deepEqual(lengthPolicy('extended', 500), {version: 'senior-cover-letter-quality-v1', mode: 'extended', label: 'Extended strategic', maximumWords: 500, targetMinimum: 450});
});

test('custom length sets the maximum and an 85% target floor', () => {
  const p = lengthPolicy(customLengthMode(250), 500);
  assert.equal(p.mode, 'custom-250');
  assert.equal(p.maximumWords, 250);
  assert.equal(p.targetMinimum, 215);
  assert.equal(p.label, 'Custom 250 words');
});

test('the .env cap still wins over a larger custom length', () => {
  assert.equal(lengthPolicy('custom-600', 500).maximumWords, 500);
  assert.equal(lengthPolicy('custom-600', 700).maximumWords, 600);
});

test('only 150-700 in steps of 25 are accepted', () => {
  for (const ok of ['custom-150', 'custom-425', 'custom-700']) assert.equal(normalizeLengthMode(ok), ok);
  for (const bad of ['custom-125', 'custom-260', 'custom-725', 'custom-', 'custom-abc', 'long', 'custom-0450'])
    assert.throws(() => normalizeLengthMode(bad), e => e.code === 'REFINEMENT_LENGTH_INVALID', bad);
});

test('quality check and hard limit use the custom maximum, with no truncation', () => {
  const letter = 'Dear Hiring Manager,\n\n' + Array.from({length: 3}, () => 'word '.repeat(100).trim()).join('\n\n') + '\n\nKind regards,\nTest';
  const q = assessLetterQuality(letter, {mode: 'custom-275', maxWords: 500});
  assert.equal(q.withinLimit, false);
  assert.match(q.warnings.join(' '), /Above the 275-word custom-275 limit/);
  assert.throws(() => assertLetterLength(letter, {mode: 'custom-275', maxWords: 500}), e => e.code === 'REFINEMENT_LENGTH_EXCEEDED' && /selected custom-275 limit is 275/.test(e.message));
  assert.equal(assertLetterLength(letter, {mode: 'custom-350', maxWords: 500}).withinLimit, true);
});

test('the polishing budget follows the custom maximum', () => {
  const b = coverLetterBudget({letterLengthMode: 'custom-300', maxWords: 500, draftPlainText: 'Dear Hiring Manager,\n\nBody.\n\nKind regards,\nTest'});
  assert.equal(b.maximumWords, 300);
  assert.equal(b.mode, 'custom-300');
});
