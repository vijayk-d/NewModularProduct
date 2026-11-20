import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { polishGate, assertPolished } from '../../src/application/polish-gate.js';
import { createOutreachRepository } from '../../src/infrastructure/outreach/sqlite-outreach-repository.js';
import { createOutreachHttpHandler } from '../../src/interfaces/http/outreach-queue-http.js';
import { createLetterGateHandler } from '../../src/interfaces/http/letter-gate-http.js';

test('polish gate: blocked until a proposal is applied or the owner overrides', () => {
  assert.equal(polishGate({}).allowed, false);
  assert.match(polishGate({}).message, /has not been polished/);
  const pending = polishGate({ refinementProposal: { proposedDraft: 'Better letter' } });
  assert.equal(pending.allowed, false); assert.equal(pending.pending, true);
  assert.match(pending.message, /Use proposal as current draft/);
  assert.equal(polishGate({ refinementHistory: [{ proposedDraft: 'x' }] }).allowed, false, 'a proposal that was never applied does not count');
  assert.equal(polishGate({ refinementHistory: [{ appliedAt: '2026-11-20T10:00:00Z' }] }).allowed, true);
  assert.equal(polishGate({ sendWithoutPolish: true }).overridden, true);
  assert.equal(polishGate(null).allowed, false);
  assert.throws(() => assertPolished({}), error => error.statusCode === 409 && error.code === 'LETTER_NOT_POLISHED');
});

async function serve(t, handler) {
  const server = createServer((request, response) => {
    handler(request, response, new URL(request.url, 'http://localhost')).then(handled => {
      if (!handled) { response.writeHead(404); response.end(); }
    }).catch(() => { response.writeHead(500); response.end(); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (route, body) => {
    const response = await fetch(base + route, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
}

async function queueFixture(t, review) {
  const repository = createOutreachRepository({ filePath: ':memory:' });
  t.after(() => repository.close());
  const contact = { id: 'c1', fullName: 'Test Person', selectedEmail: 'test@company.test', emailCandidates: [], emailSource: 'inferred', verified: false };
  const handler = createOutreachHttpHandler({ repository, contactStore: { async listByReview() { return [contact]; } }, getReview: id => id === 'r1' ? review : null });
  return { repository, request: await serve(t, handler) };
}
const payload = () => ({ reviewId: 'r1', recipients: [{ contactId: 'c1', email: 'test@company.test' }], bodyPlainText: 'Letter.', subject: 'Application' });
const base = () => ({ formData: { jobTitle: 'Delivery lead', organisationName: 'Company', jobAdvertLink: 'https://company.test/job/1' }, prepared: { coverLetter: { subject: 'Application' } } });

test('an unpolished letter cannot be queued; the override or an applied proposal lets it in', async t => {
  const review = { ...base(), refinementProposal: { proposedDraft: 'Polished' } };
  const f = await queueFixture(t, review);
  const refused = await f.request('/api/outreach-queue/add', payload());
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /Use proposal as current draft/);
  assert.equal(f.repository.list().length, 0);
  review.sendWithoutPolish = true;
  assert.equal((await f.request('/api/outreach-queue/add', payload())).status, 200);
});

test('queued letters lose Draft and Send eligibility when the polish is withdrawn, and drafting is refused', async t => {
  const review = { ...base(), refinementHistory: [{ appliedAt: '2026-11-20T10:00:00Z' }] };
  const f = await queueFixture(t, review);
  const added = await f.request('/api/outreach-queue/add', payload());
  const id = added.data.items[0].id;
  let item = (await f.request('/api/outreach-queue')).data.items[0];
  assert.equal(item.letterGate.allowed, true);
  review.refinementHistory = [];
  item = (await f.request('/api/outreach-queue')).data.items[0];
  assert.equal(item.letterGate.allowed, false);
  assert.equal(item.sendAction.eligible, false);
  assert.match(item.sendAction.reason, /not been polished/);
  for (const route of ['/api/outreach-queue/draft-one', '/api/outreach-queue/gmail-draft-preview', '/api/outreach-queue/send-prepare']) {
    const result = await f.request(route, { queueId: id });
    assert.equal(result.status, 409, route);
  }
});

test('letter gate route reads and sets "Send without polishing" for one application', async t => {
  const reviews = new Map([['r1', { formData: {} }]]);
  const sendJson = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const request = await serve(t, createLetterGateHandler({ reviewStore: { get: id => reviews.get(id), set: (id, value) => reviews.set(id, value) }, sendJson, sendText() {} }));
  assert.equal((await request('/api/reviews/r1/letter-gate')).data.allowed, false);
  const set = await request('/api/reviews/r1/letter-gate', { sendWithoutPolish: true });
  assert.equal(set.data.allowed, true); assert.equal(set.data.overridden, true);
  assert.equal(reviews.get('r1').sendWithoutPolish, true);
  assert.equal((await request('/api/reviews/r1/letter-gate', { sendWithoutPolish: 'yes' })).status, 400);
  assert.equal((await request('/api/reviews/missing/letter-gate')).status, 404);
});
