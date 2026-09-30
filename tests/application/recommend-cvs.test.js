import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendCvs } from '../../src/application/recommend-cvs.js';

test('returns a parsed JD and ranks CVs from highest to lowest score', () => {
  const result = recommendCvs({
    jobDescriptionText:
      'Agile Delivery Lead with Scrum and SAFe transformation experience',
    cvs: [
      {
        id: 'generalist',
        role_name: 'Project Coordinator',
        tags: ['planning'],
        use_cases: [],
        priority: 'low'
      },
      {
        id: 'specialist',
        role_name: 'Agile Delivery Lead',
        text: 'Scrum SAFe agile transformation delivery',
        tags: ['agile', 'scrum', 'safe'],
        use_cases: ['SAFe transformation'],
        priority: 'very-high'
      }
    ]
  });

  assert.equal(result.jobDescription.role, 'Agile Delivery Lead with Scrum and SAFe transformation experience');
  assert.equal(result.rankedCvs[0].cv.id, 'specialist');
  assert.ok(
    result.rankedCvs[0].assessment.score >
    result.rankedCvs[1].assessment.score
  );
});

test('preserves input order when candidates receive the same score', () => {
  const result = recommendCvs({
    jobDescriptionText: 'Unrelated role',
    cvs: [
      { id: 'first', role_name: 'Candidate', priority: 'low' },
      { id: 'second', role_name: 'Candidate', priority: 'low' }
    ]
  });

  assert.deepEqual(
    result.rankedCvs.map(({ cv }) => cv.id),
    ['first', 'second']
  );
});