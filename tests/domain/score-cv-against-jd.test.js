import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobDescription } from '../../src/domain/job-description/parse-job-description.js';
import { scoreCvAgainstJd } from '../../src/domain/cv/score-cv-against-jd.js';

test('scores keyword and priority alignment', () => {
  const jd = parseJobDescription(
    'Agile Delivery Lead with SAFe enterprise transformation'
  );

  const result = scoreCvAgainstJd(jd, {
    role_name: 'Agile Delivery Lead',
    tags: ['agile', 'safe', 'enterprise-agile'],
    use_cases: ['Enterprise Agile Transformation'],
    priority: 'very-high'
  });

  assert.ok(result.score >= 40);
  assert.equal(result.components.priorityRecency, 10);
});

test('scores actual CV text when it is available', () => {
  const jd = parseJobDescription(
    'Agile delivery lead for Scrum and Kanban transformation'
  );

  const withoutText = scoreCvAgainstJd(jd, {
    role_name: 'Candidate',
    role_code: 'CV',
    tags: [],
    use_cases: [],
    priority: 'medium'
  });

  const withText = scoreCvAgainstJd(jd, {
    role_name: 'Candidate',
    role_code: 'CV',
    text: 'Agile delivery lead Scrum Kanban transformation',
    tags: [],
    use_cases: [],
    priority: 'medium'
  });

  assert.ok(withText.score > withoutText.score);
});

test('adds clearance guidance only when the JD requires clearance', () => {
  const jd = parseJobDescription(
    'Delivery Lead\nSC clearance required'
  );

  const result = scoreCvAgainstJd(jd, {
    role_name: 'Candidate',
    priority: 'low'
  });

  assert.ok(
    result.suggestions.some((suggestion) =>
      suggestion.includes('SC/security clearance')
    )
  );
});