import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOutreachRepository } from '../../src/infrastructure/outreach/sqlite-outreach-repository.js';
import { createOutreachHttpHandler } from '../../src/interfaces/http/outreach-queue-http.js';

async function fixture(t) {
  const repository = createOutreachRepository({ filePath: ':memory:' });
  let active = true;
  const contact = { id: 'c1', fullName: 'Test Person', selectedEmail: 'test@company.test',
    emailCandidates: ['other@company.test'], emailSource: 'inferred', verified: false };
  const review = { refinementHistory: [{appliedAt: '2026-11-20T10:00:00Z'}], formData: { jobTitle: 'Delivery lead', organisationName: 'Company', jobAdvertLink: 'https://company.test/job/1' },
    prepared: { coverLetter: { subject: 'Application for delivery lead' } } };
  const handler = createOutreachHttpHandler({ repository,
    contactStore: { async listByReview() { return [contact]; } },
    getReview: id => active && id === 'r1' ? review : null });
  const server = createServer((request, response) => {
    handler(request, response, new URL(request.url, 'http://localhost')).then(handled => {
      if (!handled) { response.writeHead(404); response.end(); }
    }).catch(() => { response.writeHead(500); response.end(); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); repository.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, body, headers = {}) {
    const response = await fetch(base + route, body === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  }
  return { request, repository, expire() { active = false; }, base };
}
const payload = () => ({ reviewId: 'r1', recipients: [{ contactId: 'c1', email: 'test@company.test' }], bodyPlainText: 'Local edited draft.' });
test('queue API captures submitted subject and draft, deduplicates, and lists after review expiry', async t => {
  const f = await fixture(t);
  const added = await f.request('/api/outreach-queue/add', { ...payload(), subject: 'Untrusted subject' });
  assert.equal(added.status, 200); assert.equal(added.data.added, 1);
  assert.equal(added.data.items[0].subject, 'Untrusted subject');
  assert.equal(added.data.items[0].bodyPlainText, 'Local edited draft.');
  const duplicate = await f.request('/api/outreach-queue/add', { ...payload(), bodyPlainText: 'Changed' });
  assert.equal(duplicate.data.duplicates, 1);
  f.expire();
  assert.equal((await f.request('/api/outreach-queue')).data.items.length, 1);
  assert.equal((await f.request('/api/outreach-queue/add', payload())).status, 410);
});
test('queue API rejects unlinked contacts and unlisted emails without inserts', async t => {
  const f = await fixture(t);
  for (const recipients of [[{ contactId: 'unknown', email: 'test@company.test' }], [{ contactId: 'c1', email: 'outsider@company.test' }]]) {
    assert.equal((await f.request('/api/outreach-queue/add', { ...payload(), recipients })).status, 400);
  }
  assert.equal(f.repository.list().length, 0);
});
test('queue deletion and confirmed clear leave sent history intact', async t => {
  const f = await fixture(t);
  const added = await f.request('/api/outreach-queue/add', payload());
  const id = added.data.items[0].id;
  f.repository.recordConfirmedSend({ queueId: id, sendingAccount: 'sender@company.test', messageId: 'gmail-test' });
  assert.equal((await f.request('/api/outreach-queue/clear', {})).status, 400);
  assert.equal((await f.request('/api/outreach-queue/delete', { ids: [id] })).data.deleted, 1);
  assert.equal(f.repository.listSentEmails().length, 1);
  await f.request('/api/outreach-queue/add', payload());
  assert.equal((await f.request('/api/outreach-queue/clear', { confirmed: true })).data.deleted, 1);
  assert.equal(f.repository.listSentEmails().length, 1);
});
test('queue writes reject cross-origin requests', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/outreach-queue/add', payload(), { origin: 'https://untrusted.test' })).status, 403);
  assert.equal(f.repository.list().length, 0);
});
test('standalone queue page and browser module are available', async t => {
  const f = await fixture(t);
  const page = await fetch(f.base + '/outreach-queue');
  assert.equal(page.status, 200); assert.match(await page.text(), /outreach-queue.js/);
  const script = await fetch(f.base + '/outreach-queue.js');
  assert.equal(script.status, 200);
  const scriptText = await script.text();
  assert.match(scriptText, /import\s*\{\s*attachSimpleContacts\s*\}\s*from\s*['"]\.\/outreach-simple-contacts\.js['"]/);
  assert.match(scriptText, /\battachSimpleContacts\(\)/);
  const contacts = await fetch(f.base + '/outreach-simple-contacts.js');
  assert.equal(contacts.status, 200);
  assert.match(await contacts.text(), /export function attachSimpleContacts\(/);
});
