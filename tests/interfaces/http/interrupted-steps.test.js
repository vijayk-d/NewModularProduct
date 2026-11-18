import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createLocalServer} from '../../../src/interfaces/http/create-local-server.js';

test('a lookup job lost to a restart gets a clear message and code', async t => {
  const server = createLocalServer({recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const r = await fetch('http://127.0.0.1:' + server.address().port + '/api/email-domain-jobs/lost-in-restart');
  assert.equal(r.status, 404);
  const body = await r.json();
  assert.equal(body.code, 'EMAIL_DOMAIN_JOB_INTERRUPTED');
  assert.match(body.error, /restarted.*Find email domain/);
});

test('in-memory approvals explain that a restart also clears them', async () => {
  for (const [file, text] of [['src/application/confirmed-gmail-draft-service.js', 'Review the queue item again.'], ['src/application/gmail-send-service.js', 'Review the message again.'], ['src/application/unsent-letter-update-service.js', 'Preview the update again.']]) {
    const source = await readFile(new URL('../../../' + file, import.meta.url), 'utf8');
    assert.ok(source.includes('An app restart also clears it. ' + text), file);
  }
});
