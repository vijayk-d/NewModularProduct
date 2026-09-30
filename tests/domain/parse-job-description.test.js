import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobDescription } from '../../src/domain/job-description/parse-job-description.js';

test('parses role, methods, location and clearance', () => {
  const jd = parseJobDescription(
    'Senior Release Train Engineer\nSAFe and Scrum delivery in London\nSC clearance required'
  );

  assert.equal(jd.role, 'Senior Release Train Engineer');
  assert.ok(jd.methodologies.includes('safe'));
  assert.ok(jd.methodologies.includes('scrum'));
  assert.ok(jd.location.includes('london'));
  assert.equal(jd.scClearanceRequired, true);
});

test('removes common filler words but retains meaningful keywords', () => {
  const jd = parseJobDescription(
    'The Scrum and Agile role in the London team'
  );

  assert.ok(!jd.keywords.includes('the'));
  assert.ok(jd.keywords.includes('scrum'));
  assert.ok(jd.keywords.includes('agile'));
});

test('accepts explicit role and location overrides', () => {
  const jd = parseJobDescription(
    'Delivery professional\nRemote engagement',
    {
      role: 'Technical Programme Manager',
      location: 'London; Hybrid'
    }
  );

  assert.equal(jd.role, 'Technical Programme Manager');
  assert.deepEqual(jd.location, ['London', 'Hybrid']);
});