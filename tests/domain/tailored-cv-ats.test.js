import test from 'node:test';
import assert from 'node:assert/strict';
import {compareTailoredAts, keywordMatch, tailoredCvText} from '../../src/domain/cv/tailored-cv-ats.js';

test('keyword match counts each job keyword once, case-insensitively', () => {
  assert.deepEqual(keywordMatch(['Agile', 'agile', 'Risk', 'Budget'], 'Led AGILE teams and risk reviews.'), {total: 3, matched: ['agile', 'risk'], missing: ['budget'], score: 67});
  assert.equal(keywordMatch([], 'x').score, 0);
});

test('only the tailored section lines are swapped; every other CV line stays', () => {
  const base = ['Name', 'Profile line.', 'Skills: Jira, budget control', 'Old bullet.'];
  assert.equal(tailoredCvText(base, ['Profile line.', 'Old bullet.'], ['New profile.', 'New bullet.']), 'Name\nSkills: Jira, budget control\nNew profile.\nNew bullet.');
});

test('the comparison shows gained, lost, evidence-backed and unsupported keywords', () => {
  const r = compareTailoredAts({keywords: ['agile', 'risk', 'budget', 'stakeholder', 'kubernetes'],
    baseLines: ['Skills: budget', 'Profile about stakeholder work.', 'Led Agile delivery.'],
    originalLines: ['Profile about stakeholder work.', 'Led Agile delivery.'],
    tailoredLines: ['Profile for this job.', 'Led Agile delivery and risk reviews.'],
    evidence: ['Managed stakeholder groups.']});
  assert.deepEqual(r.before, {score: 60, matched: 3});
  assert.deepEqual(r.after, {score: 60, matched: 3});
  assert.deepEqual(r.gained, ['risk']);
  assert.deepEqual(r.lost, ['stakeholder']);
  assert.deepEqual(r.workIn, ['stakeholder']);
  assert.deepEqual(r.noEvidence, ['kubernetes']);
});
