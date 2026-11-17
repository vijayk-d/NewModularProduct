import test from 'node:test';
import assert from 'node:assert/strict';
import {draftTailoredCv, checkTailoredCv, figuresIn} from '../../../src/domain/cv/cv-tailoring-policy.js';

const base = {
  profile: ['Delivery leader across programmes.', 'Works with senior stakeholders.'],
  achievements: ['Cut costs by 10% through vendor consolidation.', 'Led a 40-person Agile programme.', 'Introduced risk reporting for the board.'],
  selected: ['Delivered an AI fraud MVP on AWS with an 18% loss reduction.'],
  keywords: ['agile', 'aws', 'risk', 'kubernetes']
};

test('draft keeps the profile and ranks existing evidence by job relevance', () => {
  const d = draftTailoredCv(base);
  assert.deepEqual(d.profile, base.profile);
  assert.equal(d.achievements.length, 3);
  assert.equal(d.achievements[0].source, 'selected');
  assert.ok(d.achievements.map(a => a.text).includes('Led a 40-person Agile programme.'));
  assert.equal(d.suggestions.length, 1);
  assert.ok(d.keywordGaps.includes('kubernetes'), 'unevidenced keywords are gaps, not added');
  for (const a of [...d.achievements, ...d.suggestions]) assert.ok([...base.achievements, ...base.selected].includes(a.text), 'never invents a line');
});

test('duplicates are removed and short CVs still get at least three bullets', () => {
  const d = draftTailoredCv({profile: ['P.'], achievements: ['A one.', 'a ONE.'], selected: ['B two.', 'C three.'], keywords: []});
  assert.equal(d.achievements.length, 3);
  assert.equal(new Set(d.achievements.map(a => a.text.toLowerCase())).size, 3);
});

test('figures are compared with the evidence, with or without a currency sign', () => {
  assert.deepEqual(figuresIn('£1.1M saved, 18% fewer losses, 40-person team'), ['£1.1m', '18%', '40']);
  const sources = ['Saved £1.1M and cut losses by 18%.'];
  assert.equal(checkTailoredCv({profile: ['Leader.'], achievements: ['Saved 1.1M and cut losses by 18%.'], sources}).ok, true);
  const bad = checkTailoredCv({profile: ['Leader.'], achievements: ['Cut losses by 25% saving £2M.'], sources});
  assert.equal(bad.ok, false);
  assert.match(bad.problems.join(' '), /25%, £2m/);
});

test('empty, oversized, markup and placeholder content is refused', () => {
  const sources = [];
  assert.equal(checkTailoredCv({profile: [], achievements: ['a'], sources}).ok, false);
  assert.equal(checkTailoredCv({profile: ['a'], achievements: Array(13).fill('b'), sources}).ok, false);
  assert.equal(checkTailoredCv({profile: ['x'.repeat(1201)], achievements: ['b'], sources}).ok, false);
  assert.equal(checkTailoredCv({profile: ['<b>x</b>'], achievements: ['b'], sources}).ok, false);
  assert.equal(checkTailoredCv({profile: ['Hi {{firstname}}'], achievements: ['b'], sources}).ok, false);
  assert.equal(checkTailoredCv({profile: 'text', achievements: ['b'], sources}).ok, false);
});
