import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createLocalServer } from '../../../src/interfaces/http/create-local-server.js';

async function startServer() {
  const server = createLocalServer();
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
  assert.match(response.text, /name="jobTitle"/);
  assert.match(response.text, /name="jobDescriptionText"/);
  assert.match(
    response.text,
    /This local tool does not send email\. Review and send manually\./
  );
});

test('returns 404 for an unknown route', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(baseUrl, '/missing');

  assert.equal(response.status, 404);
  assert.equal(response.text, 'Not Found');
});

test('returns 405 for a non-GET request', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(baseUrl, '/', {
    method: 'POST'
  });

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
  assert.equal(response.text, 'Method Not Allowed');
});
