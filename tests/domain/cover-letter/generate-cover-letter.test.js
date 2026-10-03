import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobDescription } from '../../../src/domain/job-description/parse-job-description.js';
import { generateCoverLetter } from '../../../src/domain/cover-letter/generate-cover-letter.js';

const template = `Dear {{firstname}},

I am applying for the {{role}} opportunity.

Key requirements: {{jdKeywords}}.

{{evidence}}

{{refinedCoverLetter}}

LinkedIn: <a href="{{jobAdvertLink}}" target="_blank" rel="noreferrer">Job advert</a>

Warm regards,
Candidate`;

test('uses recruiter greeting, grounded CV evidence, and rich-text highlights', () => {
  const jobDescription = parseJobDescription(
    'Scrum Master role requiring Scrum, Kanban, PMO and stakeholder management in London.',
    {
      role: 'Scrum Master',
      location: 'London'
    }
  );

  const letter = generateCoverLetter({
    template,
    jobDescription,
    cv: {
      role_name: 'Scrum Master',
      tags: ['scrum', 'kanban', 'pmo'],
      use_cases: ['Scrum facilitation', 'PMO operations']
    },
    candidateProfile: {
      displayName: 'Test Candidate'
    },
    recruiterName: 'James',
    jobAdvertLink: 'https://www.linkedin.com/jobs/view/123'
  });

  assert.match(letter.plainText, /Dear James,/);
  assert.match(
    letter.plainText,
    /LinkedIn: <a href="https:\/\/www\.linkedin\.com\/jobs\/view\/123"/
  );
  assert.match(letter.plainText, /Scrum facilitation, PMO operations/);
  assert.match(letter.richText, /data-highlight="true"[^>]*>kanban<\/span>/i);
  assert.match(
    letter.richText,
    /data-highlight="true"[^>]*>stakeholder management<\/span>/i
  );
  assert.doesNotMatch(letter.plainText, /background-color/i);
  assert.equal(letter.validation.valid, true);
  assert.match(letter.subject, /Test Candidate$/);
});

test('retains the firstname token when recruiter name is not supplied', () => {
  const letter = generateCoverLetter({
    template,
    jobDescription: parseJobDescription(
      'Agile Delivery Lead for Scrum delivery'
    ),
    cv: {
      role_name: 'Agile Delivery Lead',
      tags: ['agile'],
      use_cases: []
    }
  });

  assert.match(letter.plainText, /Dear {{firstname}},/);
});

test('adds the ATS paragraph before a refined-letter sign-off', () => {
  const letter = generateCoverLetter({
    template,
    jobDescription: parseJobDescription(
      'Agile Delivery Lead for Scrum delivery'
    ),
    cv: {
      role_name: 'Agile Delivery Lead',
      tags: ['agile'],
      use_cases: []
    },
    recruiterName: 'James',
    refinedCoverLetter:
      'Dear James,\n\nRefined cover letter text.\n\nThank you for considering my application.\n\nWarm regards,\nCandidate'
  });

  assert.match(
    letter.plainText,
    /I appreciate the convenience of ATS-based applications/
  );
  assert.match(letter.plainText, /Refined cover letter text\./);
  assert.ok(
    letter.plainText.indexOf(
      'I appreciate the convenience of ATS-based applications'
    ) <
    letter.plainText.indexOf('Thank you for considering my application.')
  );
});

test('removes citation markers from refined cover-letter text', () => {
  const letter = generateCoverLetter({
    template,
    jobDescription: parseJobDescription(
      'Agile Delivery Lead for Scrum delivery'
    ),
    cv: {
      role_name: 'Agile Delivery Lead',
      tags: ['agile'],
      use_cases: []
    },
    recruiterName: 'James',
    refinedCoverLetter:
      'Dear James,\n\nExample portfolios at SGS.[1][2], resonates with the way I work.[1][2].\n\nWarm regards,\nCandidate'
  });

  assert.doesNotMatch(letter.plainText, /\[\d+\]/);
  assert.match(
    letter.plainText,
    /Example portfolios at SGS, resonates with the way I work\./
  );
});

test('uses supplied highlight phrases from a refinement step', () => {
  const letter = generateCoverLetter({
    template,
    jobDescription: parseJobDescription(
      'Agile Delivery Lead for Scrum delivery'
    ),
    cv: {
      role_name: 'Agile Delivery Lead',
      tags: ['agile'],
      use_cases: []
    },
    recruiterName: 'James',
    refinedCoverLetter:
      'Dear James,\n\nMy project delivery and stakeholder management experience is directly relevant.\n\nWarm regards,\nCandidate',
    highlightPhrases: [
      'project delivery',
      'stakeholder management'
    ]
  });

  assert.match(
    letter.richText,
    /data-highlight="true"[^>]*>project delivery<\/span>/i
  );
  assert.match(
    letter.richText,
    /data-highlight="true"[^>]*>stakeholder management<\/span>/i
  );
});

test('requires an explicit non-empty template', () => {
  assert.throws(
    () => generateCoverLetter({
      jobDescription: parseJobDescription('Scrum Master'),
      cv: {}
    }),
    { message: 'A non-empty cover-letter template is required.' }
  );
});


test('uses the recruiter for the greeting and candidate for the sign-off', () => {
  const letter = generateCoverLetter({
    template: `Dear {{firstname}},

Warm regards,
{{recipient}}`,
    jobDescription: parseJobDescription('Scrum Master role'),
    cv: {
      role_name: 'Scrum Master',
      tags: ['scrum'],
      use_cases: []
    },
    recruiterName: 'James',
    candidateProfile: {
      name: 'Vijay Dafal'
    }
  });

  assert.match(letter.plainText, /^Dear James,/);
  assert.match(letter.subject, /\| Vijay Dafal$/);
});

test('uses ASCII punctuation in the ATS redirection paragraph', () => {
  const letter = generateCoverLetter({
    template,
    jobDescription: parseJobDescription(
      'Scrum Master role requiring Agile delivery'
    ),
    cv: {
      role_name: 'Scrum Master',
      tags: ['scrum'],
      use_cases: []
    }
  });

  assert.match(letter.plainText, /client's needs/);
});
