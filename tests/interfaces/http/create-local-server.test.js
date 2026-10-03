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
      plainText: 'Dear Hiring Manager,\n\nI am applying for the Project Manager role.'
    }
  };
}

async function startServer({
  prepareApplication = async () => createPreparedApplication()
} = {}) {
  const server = createLocalServer({
    prepareApplication
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
  assert.match(response.text, /<form method="post" action="\/applications">/);
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
    /The local application could not be prepared\. Check local configuration and try again\./
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
