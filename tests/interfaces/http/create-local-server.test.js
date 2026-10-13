import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createLocalServer } from '../../../src/interfaces/http/create-local-server.js';

function createPreparedApplication() {
  return {
    jobDescription: {
      role: 'Project Manager',
      location: 'London'
    },
    recommendation: {
      bestCv: {
        role_code: 'PM',
        role_name: 'Project Manager'
      },
      alternativeCv: {
        role_code: 'ADL',
        role_name: 'Agile Delivery Lead'
      },
      ats: {
        score: 82
      }
    },
    coverLetter: {
      subject: 'Project Manager application',
      plainText: 'Dear Hiring Manager,\nI am applying for the Project Manager role.'
    }
  };
}

async function startServer({
  prepareApplication = async () => createPreparedApplication(),
  researchOrganization = null,
  coverLetterRefinementPort = null,
  localDiagnosticsEnabled = false,
  diagnosticsWriter = null
} = {}) {
  const server = createLocalServer({
    prepareApplication,
    researchOrganization,
    coverLetterRefinementPort,
    localDiagnosticsEnabled,
    diagnosticsWriter: diagnosticsWriter || process.stdout
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function request(baseUrl, path = '/', options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);

  return {
    status: response.status,
    headers: response.headers,
    text: await response.text()
  };
}

function formBody(values) {
  return new URLSearchParams(values).toString();
}

function extractReviewId(html) {
  const match = html.match(
    /name="reviewId" value="([^"]+)"/
  );

  assert.ok(match, 'Expected a reviewId hidden form field.');
  return match[1];
}

async function prepareReview(baseUrl, values = {}) {
  const response = await request(baseUrl, '/applications', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      jobTitle: 'Project Manager',
      organisationName: 'Example Ltd',
      organisationUrl: 'https://example.test',
      jobDescriptionText: 'Delivery leadership',
      ...values
    })
  });

  assert.equal(response.status, 200);
  return response;
}

test('renders organisation URL before organisation name in the preparation form', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(baseUrl);

  assert.equal(response.status, 200);

  assert.ok(
    response.text.indexOf('name="organisationUrl"') <
      response.text.indexOf('name="organisationName"')
  );
  assert.match(response.text, /normalizeLinkedInCompanyUrl/);
  assert.match(
    response.text,
    /normalizeLinkedInCompanyUrl/
  );
  assert.match(
    response.text,
    /https:\/\/www\.linkedin\.com\/company\//
  );
});

test('serves the application preparation form at the root route', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(baseUrl);

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get('content-type') || '',
    /^text\/html; charset=utf-8$/i
  );
  assert.match(response.text, /<h1>Application preparation<\/h1>/);
  assert.match(
  response.text,
  /<form[^>]*method="post"[^>]*action="\/applications"/
);
  assert.match(response.text, /name="jobTitle"/);
  assert.match(response.text, /name="jobDescriptionText"/);
  assert.match(
    response.text,
    /<button type="submit">Generate application<\/button>/
  );
  assert.match(
    response.text,
    /This local tool does not send email\. Review and send manually\./
  );
});

test('prepares and renders a local application review from form data', async (t) => {
  let receivedRequest;

  const { server, baseUrl } = await startServer({
    async prepareApplication(request) {
      receivedRequest = request;
      return createPreparedApplication();
    }
  });
  t.after(() => server.close());

  const response = await request(baseUrl, '/applications', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      jobTitle: 'Project Manager',
      recruiterName: 'Hiring Manager',
      jobAdvertLink: 'https://example.test/jobs/project-manager',
      jobReference: 'PM-42',
      preferredRoleCodes: ' PM, ADL ,, ',
      jobDescriptionText:
        'Lead delivery, stakeholder management, and programme governance.',
      cvHighlights:
        'Led complex delivery\nImproved stakeholder reporting\n'
    })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(receivedRequest, {
    jobDescriptionText:
      'Lead delivery, stakeholder management, and programme governance.',
    jobDescriptionOverrides: {
      role: 'Project Manager'
    },
    recruiterName: 'Hiring Manager',
    jobAdvertLink: 'https://example.test/jobs/project-manager',
    jobReference: 'PM-42',
    preferredRoleCodes: ['PM', 'ADL'],
    cvHighlights: [
      'Led complex delivery',
      'Improved stakeholder reporting'
    ]
  });
  assert.match(response.text, /<title>Application review<\/title>/);
  assert.match(response.text, /<h1>Application review<\/h1>/);
  assert.match(response.text, /Recommended CV:<\/strong> Project Manager/);
  assert.match(response.text, /Alternative CV:<\/strong> Agile Delivery Lead/);
  assert.match(response.text, /ATS score:<\/strong> 82/);
  assert.match(response.text, /Project Manager application/);
  assert.match(response.text, /Dear Hiring Manager,/);
  assert.match(
    response.text,
    /This local tool does not send email\. Review and send manually\./
  );
});

test('returns a validation page without preparing when required form data is missing', async (t) => {
  let preparationCalls = 0;

  const { server, baseUrl } = await startServer({
    async prepareApplication() {
      preparationCalls += 1;
      return createPreparedApplication();
    }
  });
  t.after(() => server.close());

  const response = await request(baseUrl, '/applications', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      jobTitle: '',
      recruiterName: 'Hiring Manager',
      jobDescriptionText: ''
    })
  });

  assert.equal(response.status, 400);
  assert.equal(preparationCalls, 0);
  assert.match(response.text, /Please correct the following:/);
  assert.match(response.text, /Job title is required\./);
  assert.match(response.text, /Job description is required\./);
  assert.match(response.text, /value="Hiring Manager"/);
  assert.match(
    response.text,
    /This local tool does not send email\. Review and send manually\./
  );
});

test('escapes generated values before rendering a review page', async (t) => {
  const { server, baseUrl } = await startServer({
    async prepareApplication() {
      return {
        jobDescription: {
          role: '<script>role()</script>',
          location: '<b>London</b>'
        },
        recommendation: {
          bestCv: {
            role_name: '<img src=x onerror=alert(1)>'
          },
          alternativeCv: null,
          ats: {
            score: 72
          }
        },
        coverLetter: {
          subject: '<script>subject()</script>',
          plainText: '<img src=x onerror=alert(1)>'
        }
      };
    }
  });
  t.after(() => server.close());

  const response = await request(baseUrl, '/applications', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      jobTitle: 'Project Manager',
      jobDescriptionText: 'Delivery leadership'
    })
  });

  assert.equal(response.status, 200);
  assert.doesNotMatch(response.text, /<script>role\(\)<\/script>/);
  assert.doesNotMatch(response.text, /<img src=x onerror=alert\(1\)>/);
  assert.match(response.text, /&lt;script&gt;role\(\)&lt;\/script&gt;/);
  assert.match(
    response.text,
    /&lt;img src=x onerror=alert\(1\)&gt;/
  );
});

test('rejects unsupported application form media types', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(baseUrl, '/applications', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: '{"jobTitle":"Project Manager"}'
  });

  assert.equal(response.status, 415);
  assert.equal(response.text, 'Unsupported Media Type');
});

test('returns a safe preparation error page', async (t) => {
  const { server, baseUrl } = await startServer({
    async prepareApplication() {
      throw new Error('D:\\private\\inventory.json should not be exposed');
    }
  });
  t.after(() => server.close());

  const response = await request(baseUrl, '/applications', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      jobTitle: 'Project Manager',
      jobDescriptionText: 'Delivery leadership'
    })
  });

  assert.equal(response.status, 500);
  assert.match(
    response.text,
    /The local application could not be prepared\. Check the local server terminal for a diagnostic message, then try again\./
  );
  assert.doesNotMatch(response.text, /private\\inventory\.json/);
});

test('returns 404 for an unknown route', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(baseUrl, '/missing');

  assert.equal(response.status, 404);
  assert.equal(response.text, 'Not Found');
});

test('returns 405 for unsupported request methods', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(baseUrl, '/', {
    method: 'PUT'
  });

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, POST');
  assert.equal(response.text, 'Method Not Allowed');
});

test('rejects oversized application form submissions', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(baseUrl, '/applications', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: `jobTitle=Project+Manager&jobDescriptionText=${'x'.repeat(64 * 1024)}`
  });

  assert.equal(response.status, 413);
  assert.equal(response.text, 'Payload Too Large');
});

test('renders review details, a safe advert link, and local copy controls', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(baseUrl, '/applications', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      jobTitle: 'Project Manager',
      recruiterName: 'Hiring Manager',
      jobAdvertLink: 'https://example.test/jobs/project-manager',
      jobReference: 'PM-42',
      jobDescriptionText: 'Delivery leadership'
    })
  });

  assert.equal(response.status, 200);
  assert.match(response.text, /<h2>Vacancy details<\/h2>/);
  assert.match(
    response.text,
    /Stakeholder source:<\/strong> Hiring Manager/
  );
  assert.match(response.text, /Vacancy reference:<\/strong> PM-42/);
  assert.match(
    response.text,
    /<a href="https:\/\/example\.test\/jobs\/project-manager" target="_blank" rel="noreferrer noopener">https:\/\/example\.test\/jobs\/project-manager<\/a>/
  );
  assert.match(
    response.text,
    /id="cover-letter-draft"[\s\S]*contenteditable="true"/
  );
  assert.match(
    response.text,
    /<button id="copy-cover-letter" type="button">Copy rich text<\/button>/
  );
  assert.match(
    response.text,
    /<span id="copy-status" role="status" aria-live="polite"><\/span>/
  );
  assert.match(
    response.text,
    /navigator\.clipboard\.writeText\(draft\.value\)/
  );
  assert.match(
  response.text,
  /<div class="rich-editor-toolbar"[^>]*data-editor-target="cover-letter-draft"/
  );

assert.doesNotMatch(
  response.text,
  /data-editor-target="proposed-cover-letter"/
);
});

test('renders unsafe advert URLs as escaped plain text rather than links', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(baseUrl, '/applications', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      jobTitle: 'Project Manager',
      jobAdvertLink: 'javascript:alert(1)',
      jobDescriptionText: 'Delivery leadership'
    })
  });

  assert.equal(response.status, 200);
  assert.match(
    response.text,
    /Job advert:<\/strong> javascript:alert\(1\)<\/p>/
  );
  assert.doesNotMatch(
    response.text,
    /href="javascript:alert\(1\)"/
  );
});

test('allows only the nonce-marked local copy script in the review CSP', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(baseUrl, '/applications', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      jobTitle: 'Project Manager',
      jobDescriptionText: 'Delivery leadership'
    })
  });

  assert.equal(response.status, 200);

  const contentSecurityPolicy =
    response.headers.get('content-security-policy') || '';

  const nonceMatch = contentSecurityPolicy.match(
    /script-src 'nonce-([a-f0-9]+)'/
  );

  assert.ok(nonceMatch);
  assert.match(
    response.text,
    new RegExp(`<script nonce="${nonceMatch[1]}">`)
  );
  assert.doesNotMatch(
    contentSecurityPolicy,
    /script-src[^;]*'unsafe-inline'/
  );
});
test('includes a local review ID in the organisation research form', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await prepareReview(baseUrl);

  assert.match(
    response.text,
    /<form method="post" action="\/organisation-research">/
  );
  assert.match(
    response.text,
    /<input type="hidden" name="reviewId" value="[^"]+">/
  );
});

test('re-renders an application review with inline organisation research', async (t) => {
  const researchCalls = [];

  const { server, baseUrl } = await startServer({
    async researchOrganization(request) {
      researchCalls.push(request);

      return {
        status: 'found',
        provider: 'fake-research',
        researchedAt: '2026-10-05T12:00:00.000Z',
        summary: 'Example Ltd values delivery excellence.',
        companyValues: ['Delivery excellence', 'Collaboration'],
        sources: [
          {
            title: 'Example Ltd',
            url: 'https://example.test'
          },
          {
            title: 'Independent profile',
            url: 'https://directory.test/example-ltd'
          }
        ]
      };
    }
  });
  t.after(() => server.close());

  const review = await prepareReview(baseUrl, {
    jobTitle: 'Programme Manager',
    organisationName: 'Example Ltd',
    organisationUrl: 'https://example.test'
  });

  const reviewId = extractReviewId(review.text);

  const response = await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({ reviewId })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(researchCalls, [{
    companyName: 'Example Ltd',
    companyUrl: 'https://example.test',
    jobDescriptionSummary: 'Programme Manager',
    forceRefresh: false
  }]);
  assert.match(response.text, /<title>Application review<\/title>/);
  assert.match(response.text, /<h1>Application review<\/h1>/);
  assert.match(response.text, /<summary>Research result<\/summary>/);
  assert.match(response.text, /Provider:<\/strong> fake-research/);
  assert.match(response.text, /Example Ltd values delivery excellence\./);
  assert.match(response.text, /Delivery excellence/);
  assert.match(response.text, /Collaboration/);
  assert.match(
    response.text,
    /href="https:\/\/example\.test\/" target="_blank" rel="noreferrer noopener">Example Ltd/
  );
  assert.match(response.text, /Additional sources \(1\)/);
  assert.match(response.text, /Dear Hiring Manager,/);

  assert.ok(
    response.text.indexOf('Research result') <
      response.text.indexOf('Current cover letter draft')
  );
});

test('escapes provider-supplied organisation research before rendering', async (t) => {
  const { server, baseUrl } = await startServer({
    async researchOrganization() {
      return {
        status: 'found',
        provider: '<script>provider()</script>',
        researchedAt: '2026-10-05T12:00:00.000Z',
        summary: '<img src=x onerror=alert(1)>',
        companyValues: ['<script>value()</script>'],
        sources: [{
          title: '<script>source()</script>',
          url: 'javascript:alert(1)'
        }]
      };
    }
  });
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  const response = await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({ reviewId })
  });

  assert.equal(response.status, 200);
  assert.doesNotMatch(response.text, /<script>provider\(\)<\/script>/);
  assert.doesNotMatch(response.text, /<img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(response.text, /href="javascript:alert\(1\)"/);
  assert.match(
    response.text,
    /&lt;script&gt;provider\(\)&lt;\/script&gt;/
  );
  assert.match(
    response.text,
    /&lt;img src=x onerror=alert\(1\)&gt;/
  );
  assert.match(
    response.text,
    /&lt;script&gt;value\(\)&lt;\/script&gt;/
  );
  assert.match(
    response.text,
    /&lt;script&gt;source\(\)&lt;\/script&gt;/
  );
});

test('returns 410 when organisation research has no active review', async (t) => {
  const { server, baseUrl } = await startServer({
    async researchOrganization() {
      throw new Error('Research should not be called.');
    }
  });
  t.after(() => server.close());

  const response = await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      reviewId: 'missing-review'
    })
  });

  assert.equal(response.status, 410);
  assert.match(
    response.text,
    /This application review is no longer available\. Please prepare the application again\./
  );
});

test('renders an inline error when organisation research is disabled', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  const response = await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({ reviewId })
  });

  assert.equal(response.status, 503);
  assert.match(response.text, /<title>Application review<\/title>/);
  assert.match(response.text, /<h1>Application review<\/h1>/);
  assert.match(
    response.text,
    /Organisation research is disabled\. Set ENABLE_PERPLEXITY_RESEARCH=true and restart the local server\./
  );
  assert.match(response.text, /Dear Hiring Manager,/);
});

test('retains the review and shows an inline error when research throws', async (t) => {
  const { server, baseUrl } = await startServer({
    async researchOrganization() {
      throw new Error('Provider connection failed');
    }
  });
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  const response = await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({ reviewId })
  });

  assert.equal(response.status, 200);
  assert.match(response.text, /<title>Application review<\/title>/);
  assert.match(response.text, /<summary>Research result<\/summary>/);
  assert.match(response.text, /Provider connection failed/);
  assert.match(response.text, /Dear Hiring Manager,/);
});


test('renders refinement value selection after successful organisation research', async (t) => {
  const { server, baseUrl } = await startServer({
    researchOrganization: async () => ({
      status: 'found',
      provider: 'fake-research',
      researchedAt: '2026-10-05T12:00:00.000Z',
      summary: 'Example Ltd values delivery excellence.',
      companyValues: ['Delivery excellence', 'Collaboration'],
      sources: [{
        title: 'Example Ltd',
        url: 'https://example.test'
      }]
    })
  });
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  const response = await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({ reviewId })
  });

  assert.equal(response.status, 200);
  assert.match(
    response.text,
    /<form method="post" action="\/cover-letter-refinement">/
  );
  assert.match(response.text, /name="selectedResearchPointIds"/);
  assert.match(response.text, /value="company-value-1"/);
  assert.match(response.text, /Delivery excellence/);
  assert.match(response.text, /Collaboration/);
  assert.match(response.text, /Polish cover letter/);
});

test('returns a refinement proposal without changing the current draft', async (t) => {
  const refinementCalls = [];

  const { server, baseUrl } = await startServer({
    researchOrganization: async () => ({
      status: 'found',
      provider: 'fake-research',
      researchedAt: '2026-10-05T12:00:00.000Z',
      summary: 'Example Ltd values delivery excellence.',
      companyValues: ['Delivery excellence'],
      sources: [{
        title: 'Example Ltd',
        url: 'https://example.test'
      }]
    }),
    coverLetterRefinementPort: {
      async refine(request) {
        refinementCalls.push(request);

        return {
          proposedDraft: 'Proposed refined draft',
          warnings: [],
          appliedResearchPointIds: ['company-value-1'],
          provider: 'fake-refinement'
        };
      }
    }
  });
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  const researched = await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({ reviewId })
  });

  assert.equal(researched.status, 200);

  const refined = await request(baseUrl, '/cover-letter-refinement', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      reviewId,
      selectedResearchPointIds: 'company-value-1'
    })
  });

  assert.equal(refined.status, 200);
  assert.deepEqual(refinementCalls, [{
  letterTone: 'professional',
  excludedEmployers: ['micro1'],
  jobDescriptionText: 'Delivery leadership',
  draftPlainText: "Dear Hiring Manager,\nI am applying for the Project Manager role.", jobDescriptionSummary: "Project Manager",
  selectedCvHighlights: [],
  companyValues: ["Delivery excellence"],
  selectedResearchPoints: [
    {
      id: "company-value-1",
      type: "value",
      text: "Delivery excellence",
      sourceUrl: ""
    }
  ],
  organisationName: "Example Ltd",
  organisationUrl: "https://example.test",
  researchSources: [
    {
      title: "Example Ltd",
      url: "https://example.test"
    }
  ],
  instructions: "",
  maxWords: 450
  }]);
  assert.match(refined.text, /Proposed refined draft/);
  assert.match(
    refined.text,
    /This proposal has not changed the current draft\./
  );
  assert.match(refined.text, /Dear Hiring Manager,/);
  assert.ok(
    refined.text.indexOf('Proposed refined draft') <
      refined.text.indexOf('Current cover letter draft')
  );
});

test("returns a refinement proposal when no research value is selected", async (t) => {
  const { server, baseUrl } = await startServer({
    researchOrganization: async () => ({
      status: "found",
      companyValues: ["Delivery excellence"],
      summary: "Summary",
      sources: []
    }),
    coverLetterRefinementPort: {
      async refine() {
        return {
          proposedDraft: "Refined cover letter",
          appliedResearchPointIds: [],
          omittedResearchPointIds: [],
          suggestedResearchPoints: [],
          warnings: []
        };
      }
    }
  });

  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  await request(baseUrl, "/organisation-research", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: formBody({ reviewId })
  });

  const response = await request(baseUrl, "/cover-letter-refinement", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: formBody({ reviewId })
  });

  assert.equal(response.status, 200);
  assert.match(response.text, /Refined cover letter/);
});
test('retains the review when refinement is disabled', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  const response = await request(baseUrl, '/cover-letter-refinement', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      reviewId,
      selectedResearchPointIds: 'company-value-1'
    })
  });

  assert.equal(response.status, 503);
  assert.match(
    response.text,
    /Cover-letter refinement is disabled/
  );
  assert.match(response.text, /Dear Hiring Manager,/);
});


test('applies a refinement proposal only through the explicit local apply route', async (t) => {
  let refinementCalls = 0;

  const { server, baseUrl } = await startServer({
    researchOrganization: async () => ({
      status: 'found',
      companyValues: ['Delivery excellence'],
      summary: 'Summary',
      sources: []
    }),
    coverLetterRefinementPort: {
      async refine() {
        refinementCalls += 1;

        return {
          proposedDraft:
            'Dear Hiring Manager,\n\nThis is the approved refined draft.',
          warnings: []
        };
      }
    }
  });
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({ reviewId })
  });

  const proposed = await request(baseUrl, '/cover-letter-refinement', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      reviewId,
      selectedResearchPointIds: 'company-value-1'
    })
  });

  assert.equal(proposed.status, 200);
  assert.equal(refinementCalls, 1);
  assert.match(
    proposed.text,
    /Use proposal as current draft/
  );
  assert.match(
    proposed.text,
    /Dear Hiring Manager,[\s\S]*I am applying for the Project Manager role\./
  );
  assert.match(
    proposed.text,
    /<div class="rich-editor-toolbar"[^>]*data-editor-target="proposed-cover-letter"/
  );

  const applied = await request(
    baseUrl,
    '/cover-letter-refinement/apply',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: formBody({ reviewId })
    }
  );

  assert.equal(applied.status, 200);
  assert.equal(refinementCalls, 1);
  assert.match(
    applied.text,
    /Current draft updated from your approved refinement proposal\./
  );
  assert.match(
    applied.text,
    /Dear Hiring Manager,[\s\S]*This is the approved refined draft\./
  );
  assert.doesNotMatch(
    applied.text,
    /data-editor-target="proposed-cover-letter"/
  );
  assert.doesNotMatch(
    applied.text,
    /id="proposed-cover-letter"[\s\S]*contenteditable="true"/
  );
  assert.doesNotMatch(
    applied.text,
    /Use proposal as current draft/
  );
});

test('does not apply a refinement when no proposal exists', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  const response = await request(
    baseUrl,
    '/cover-letter-refinement/apply',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: formBody({ reviewId })
    }
  );

  assert.equal(response.status, 400);
  assert.match(
    response.text,
    /There is no refinement proposal available to apply\./
  );
  assert.match(
    response.text,
    /Dear Hiring Manager,[\s\S]*I am applying for the Project Manager role\./
  );
});

test('returns 410 when applying a refinement for an expired review', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(
    baseUrl,
    '/cover-letter-refinement/apply',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: formBody({
        reviewId: 'missing-review'
      })
    }
  );

  assert.equal(response.status, 410);
  assert.match(
    response.text,
    /This application review is no longer available\. Please prepare the application again\./
  );
});


test('emits safe verbose diagnostics when enabled', async (t) => {
  const lines = [];
  const diagnosticsWriter = {
    write(line) {
      lines.push(line);
    }
  };

  const { server, baseUrl } = await startServer({
    localDiagnosticsEnabled: true,
    diagnosticsWriter
  });
  t.after(() => server.close());

  const response = await request(baseUrl, '/applications', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      jobTitle: 'Project Manager',
      jobDescriptionText: 'Private job description that must not be logged.'
    })
  });

  assert.equal(response.status, 200);

  const output = lines.join('');

  assert.match(output, /event="request_received"|event=request_received/);
  assert.match(output, /event="application_prepare_started"|event=application_prepare_started/);
  assert.match(output, /event="application_prepare_completed"|event=application_prepare_completed/);
  assert.match(output, /jobDescriptionCharacters=/);
  assert.doesNotMatch(
    output,
    /Private job description that must not be logged/
  );
  assert.doesNotMatch(output, /Dear Hiring Manager,/);
});

test('does not emit verbose diagnostics when disabled', async (t) => {
  const lines = [];
  const diagnosticsWriter = {
    write(line) {
      lines.push(line);
    }
  };

  const { server, baseUrl } = await startServer({
    localDiagnosticsEnabled: false,
    diagnosticsWriter
  });
  t.after(() => server.close());

  const response = await request(baseUrl);

  assert.equal(response.status, 200);
  assert.deepEqual(lines, []);
});


test('renders ranked CV candidates and preserves the cover letter after selection', async (t) => {
  const prepared = createPreparedApplication();

  prepared.rankedCvs = [
    {
      cv: {
        role_code: 'PM',
        role_name: 'Project Manager'
      },
      ats: {
        score: 82,
        matchedKeywords: ['delivery', 'stakeholder'],
        missingKeywords: ['programme'],
        suggestions: ['Add measurable delivery outcomes.']
      }
    },
    {
      cv: {
        role_code: 'ADL',
        role_name: 'Agile Delivery Lead'
      },
      ats: {
        score: 61,
        matchedKeywords: ['delivery'],
        missingKeywords: ['stakeholder'],
        suggestions: []
      }
    }
  ];

  const { server, baseUrl } = await startServer({
    prepareApplication: async () => prepared
  });
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  assert.match(review.text, /CV selection and ATS comparison/);
  assert.match(review.text, /Project Manager/);
  assert.match(review.text, /Agile Delivery Lead/);
  assert.match(review.text, /Matched keywords/);
  assert.match(review.text, /Missing keywords/);
  assert.match(review.text, /Add measurable delivery outcomes/);
  assert.match(review.text, /value="PM"[^>]*checked/);

  const response = await request(baseUrl, '/review-cv-selection', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      reviewId,
      selectedCvRoleCode: 'ADL'
    })
  });

  assert.equal(response.status, 200);
  assert.match(
    response.text,
    /Selected CV updated\. The current cover letter has not changed\./
  );
  assert.match(response.text, /value="ADL"[^>]*checked/);
  assert.match(
    response.text,
    /Dear Hiring Manager,[\s\S]*I am applying for the Project Manager role\./
  );

  assert.match(
    response.text,
    /id="cover-letter-draft"[\s\S]*contenteditable="true"/
  );

  assert.match(
    response.text,
    /Formatting and text edits remain in this browser until a later explicit save action is added\./
  );
});

test('rejects an unknown CV selection without changing the active CV', async (t) => {
  const prepared = createPreparedApplication();

  prepared.rankedCvs = [{
    cv: {
      role_code: 'PM',
      role_name: 'Project Manager'
    },
    ats: {
      score: 82,
      matchedKeywords: [],
      missingKeywords: [],
      suggestions: []
    }
  }];

  const { server, baseUrl } = await startServer({
    prepareApplication: async () => prepared
  });
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  const response = await request(baseUrl, '/review-cv-selection', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      reviewId,
      selectedCvRoleCode: 'UNKNOWN'
    })
  });

  assert.equal(response.status, 400);
  assert.match(
    response.text,
    /Select a CV from the available ranked candidates\./
  );
  assert.match(response.text, /value="PM"[^>]*checked/);
});

test('returns 410 when selecting a CV for an expired review', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(baseUrl, '/review-cv-selection', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      reviewId: 'missing-review',
      selectedCvRoleCode: 'PM'
    })
  });

  assert.equal(response.status, 410);
  assert.match(
    response.text,
    /This application review is no longer available\. Please prepare the application again\./
  );
});





