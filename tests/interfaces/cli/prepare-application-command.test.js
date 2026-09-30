import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatJsonResponse,
  parseJsonRequest,
  runPrepareApplicationCommand
} from '../../../src/interfaces/cli/prepare-application-command.js';

const template = `Dear {{firstname}},

I am applying for the {{role}} opportunity.

Key requirements: {{jdKeywords}}.

{{evidence}}

LinkedIn: <a href="{{jobAdvertLink}}" target="_blank" rel="noreferrer">Job advert</a>

Warm regards,
{{recipient}}`;

function createRequest() {
  return {
    jobDescriptionText: [
      'Release Train Engineer',
      'SAFe PI Planning and cloud transformation in London.'
    ].join('\n'),
    inventory: {
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
            use_cases: ['PMO reporting'],
            priority: 'medium'
          }
        ]
      }
    },
    preferredRoleCodes: ['RTE', 'PM'],
    coverLetterTemplate: template,
    candidateProfile: {
      displayName: 'Test Candidate'
    },
    recruiterName: 'James',
    jobAdvertLink: 'https://example.test/jobs/rte-1'
  };
}

test('parses a JSON request', () => {
  const request = createRequest();

  assert.deepEqual(
    parseJsonRequest(JSON.stringify(request)),
    request
  );
});

test('rejects empty standard input', () => {
  assert.throws(
    () => parseJsonRequest('   '),
    { message: 'Expected a JSON application request on standard input.' }
  );
});

test('rejects invalid JSON input', () => {
  assert.throws(
    () => parseJsonRequest('{ invalid json }'),
    { message: 'Standard input must contain valid JSON.' }
  );
});

test('runs the complete application workflow from JSON input', () => {
  const result = runPrepareApplicationCommand(
    JSON.stringify(createRequest())
  );

  assert.equal(result.recommendation.bestCv.role_code, 'RTE');
  assert.equal(result.recommendation.alternativeCv.role_code, 'PM');
  assert.match(result.coverLetter.plainText, /Dear James,/);
  assert.equal(result.coverLetter.validation.valid, true);
});

test('formats exactly one JSON response with a final newline', () => {
  const output = formatJsonResponse({
    status: 'ok',
    count: 1
  });

  assert.equal(
    output,
    '{\n  "status": "ok",\n  "count": 1\n}\n'
  );
});
