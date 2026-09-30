import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobDescription } from '../../src/domain/job-description/parse-job-description.js';
import {
  rankCvCandidates,
  selectCv
} from '../../src/domain/cv/select-cv.js';

test('selects the specialist CV over a weak alternative', () => {
  const jobDescription = parseJobDescription(
    'Release Train Engineer for SAFe PI Planning and cloud transformation'
  );

  const result = selectCv(jobDescription, {
    cv_inventory: {
      cvs: [
        {
          role_code: 'RTE',
          role_name: 'Release Train Engineer',
          tags: ['safe', 'pi-planning', 'cloud'],
          use_cases: ['SAFe ART facilitation'],
          priority: 'very-high'
        },
        {
          role_code: 'PM',
          role_name: 'Project Manager',
          tags: ['waterfall'],
          use_cases: ['PMO'],
          priority: 'medium'
        }
      ]
    }
  });

  assert.equal(result.bestCv.role_code, 'RTE');
  assert.equal(result.alternativeCv.role_code, 'PM');
  assert.ok(result.ats.score > 0);
});

test('accepts the direct cvs inventory shape', () => {
  const jobDescription = parseJobDescription('Agile Delivery Lead');

  const ranked = rankCvCandidates(jobDescription, {
    cvs: [
      {
        role_code: 'ADL',
        role_name: 'Agile Delivery Lead',
        tags: ['agile'],
        priority: 'high'
      }
    ]
  });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].cv.role_code, 'ADL');
});

test('throws a meaningful error when no CV candidates exist', () => {
  const jobDescription = parseJobDescription('Agile Delivery Lead');

  assert.throws(
    () => rankCvCandidates(jobDescription, { cvs: [] }),
    { message: 'CV inventory contains no CV entries.' }
  );
});

test('uses preferred role codes only as a score-tie breaker', () => {
  const jobDescription = parseJobDescription('Unrelated role');

  const ranked = rankCvCandidates(
    jobDescription,
    {
      cvs: [
        {
          role_code: 'GENERAL',
          role_name: 'Candidate',
          priority: 'low'
        },
        {
          role_code: 'RTE',
          role_name: 'Candidate',
          priority: 'low'
        },
        {
          role_code: 'PM',
          role_name: 'Candidate',
          priority: 'low'
        }
      ]
    },
    ['PM', 'RTE']
  );

  assert.deepEqual(
    ranked.map(({ cv }) => cv.role_code),
    ['PM', 'RTE', 'GENERAL']
  );
});

test('preserves original order for candidates with identical score and preference', () => {
  const jobDescription = parseJobDescription('Unrelated role');

  const ranked = rankCvCandidates(jobDescription, {
    cvs: [
      {
        role_code: 'FIRST',
        role_name: 'Candidate',
        priority: 'low'
      },
      {
        role_code: 'SECOND',
        role_name: 'Candidate',
        priority: 'low'
      }
    ]
  });

  assert.deepEqual(
    ranked.map(({ cv }) => cv.role_code),
    ['FIRST', 'SECOND']
  );
});

test('returns null as the alternative when only one CV is available', () => {
  const jobDescription = parseJobDescription('Agile Delivery Lead');

  const result = selectCv(jobDescription, {
    cvs: [
      {
        role_code: 'ADL',
        role_name: 'Agile Delivery Lead',
        priority: 'high'
      }
    ]
  });

  assert.equal(result.bestCv.role_code, 'ADL');
  assert.equal(result.alternativeCv, null);
});
