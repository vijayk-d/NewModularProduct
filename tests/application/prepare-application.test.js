import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareApplication } from '../../src/application/prepare-application.js';

const template = `Dear {{firstname}},

I am applying for the {{role}} opportunity.

Key requirements: {{jdKeywords}}.

{{evidence}}

LinkedIn: <a href="{{jobAdvertLink}}" target="_blank" rel="noreferrer">Job advert</a>

Warm regards,
{{recipient}}`;

test('prepares a complete in-memory application from JD to selected CV and cover letter', () => {
  const result = prepareApplication({
    jobDescriptionText: [
      'Release Train Engineer',
      'SAFe PI Planning and cloud transformation in London.',
      'SC clearance required.'
    ].join('\n'),
    inventory: {
      cv_inventory: {
        cvs: [
          {
            role_code: 'RTE',
            role_name: 'Release Train Engineer',
            local_path: 'D:\\CVs\\RTE.pdf',
            tags: ['safe', 'pi-planning', 'cloud'],
            use_cases: [
              'SAFe ART facilitation',
              'PI Planning coordination'
            ],
            priority: 'very-high'
          },
          {
            role_code: 'PM',
            role_name: 'Project Manager',
            local_path: 'D:\\CVs\\PM.pdf',
            tags: ['waterfall'],
            use_cases: ['PMO reporting'],
            priority: 'medium'
          }
        ]
      }
    },
    selectedCvPaths: [
      'D:\\CVs\\PM.pdf',
      'D:\\CVs\\RTE.pdf'
    ],
    preferredRoleCodes: ['RTE', 'PM'],
    coverLetterTemplate: template,
    candidateProfile: {
      displayName: 'Test Candidate',
      clearanceNote:
        'I would be pleased to discuss verified clearance eligibility and status.'
    },
    recruiterName: 'James',
    jobAdvertLink: 'https://example.test/jobs/rte-123',
    jobReference: 'RTE-123'
  });

  assert.equal(
    result.jobDescription.role,
    'Release Train Engineer'
  );

  assert.equal(
    result.selectedInventory.cv_inventory.cvs.length,
    2
  );

  assert.deepEqual(
    result.selectedInventory.cv_inventory.cvs.map((cv) => cv.role_code),
    ['PM', 'RTE']
  );

  assert.equal(result.rankedCvs[0].cv.role_code, 'RTE');
  assert.equal(result.recommendation.bestCv.role_code, 'RTE');
  assert.equal(result.recommendation.alternativeCv.role_code, 'PM');

  assert.equal(
    result.recommendation.ats.components.priorityRecency,
    10
  );

  assert.match(result.coverLetter.plainText, /Dear James,/);
  assert.match(
    result.coverLetter.plainText,
    /SAFe ART facilitation, PI Planning coordination/
  );
  assert.match(
    result.coverLetter.plainText,
    /https:\/\/example\.test\/jobs\/rte-123/
  );
  assert.match(result.coverLetter.subject, /RTE-123/);
  assert.match(result.coverLetter.subject, /Test Candidate$/);
  assert.equal(result.coverLetter.validation.valid, true);
});

test('creates synthetic CV metadata for an explicitly selected unknown path', () => {
  const result = prepareApplication({
    jobDescriptionText: 'Agile Delivery Lead for Scrum delivery',
    inventory: {
      cv_inventory: {
        cvs: []
      }
    },
    selectedCvPaths: [
      'D:\\Selected\\Agile Delivery\\Candidate_ADL.pdf'
    ],
    coverLetterTemplate: template,
    candidateProfile: {
      displayName: 'Test Candidate'
    },
    jobAdvertLink: 'https://example.test/jobs/adl-1'
  });

  assert.equal(
    result.selectedInventory.cv_inventory.cvs[0].role_code,
    'CUSTOM-1'
  );

  assert.equal(
    result.recommendation.bestCv.role_code,
    'CUSTOM-1'
  );

  assert.match(
    result.coverLetter.plainText,
    /Candidate ADL/
  );

  assert.equal(result.coverLetter.validation.valid, true);
});
