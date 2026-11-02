import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJobKeywords } from '../../../src/domain/job-description/extract-job-keywords.js';
import { parseJobDescription } from '../../../src/domain/job-description/parse-job-description.js';

test('removes punctuation, filler words, and short fragments', () => {
  assert.deepEqual(
    extractJobKeywords(
      'programmes delivery deliver programme me you... t m team improvement.'
    ),
    ['programme', 'delivery', 'deliver', 'team', 'improvement']
  );
});

test('preserves meaningful short acronyms', () => {
  assert.deepEqual(
    extractJobKeywords('UK SC DV QA AI delivery'),
    ['uk', 'sc', 'dv', 'qa', 'ai', 'delivery']
  );
});

test('parses clean display keywords', () => {
  const jobDescription = parseJobDescription(
    'Scrum Master role requiring Agile delivery, facilitation, team coaching, and continuous improvement.'
  );

  assert.deepEqual(jobDescription.keywords, [
    'scrum',
    'master',
    'requiring',
    'agile',
    'delivery',
    'facilitation',
    'team',
    'coaching',
    'continuous',
    'improvement'
  ]);
});
