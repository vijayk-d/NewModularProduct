import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOutreachRepository } from '../../src/infrastructure/outreach/sqlite-outreach-repository.js';
import { createOutreachHttpHandler } from '../../src/interfaces/http/outreach-queue-http.js';

const TOTAL = 3000;
async function fixture(t) {
  const repository = createOutreachRepository({ filePath: ':memory:' });
  const rows = Array.from({ length: TOTAL }, (_, i) => ({ applicationKey: 'app' + (i % 2), reviewId: i % 2 ? 'r2' : 'r1', contactId: 'c' + i,
    email: `person${i}@example.test`, fullName: 'Person ' + String(i).padStart(4, '0'), role: i % 10 === 0 ? 'Head of Delivery' : 'Engineer',
    subject: 'Application', bodyPlainText: 'Synthetic letter.', application: { organisationName: i % 2 ? 'Beta Ltd' : 'Alpha plc' } }));
  repository.addMany(rows);
  const review = { refinementHistory: [{ appliedAt: '2026-11-20T10:00:00Z' }], formData: {} };
  // Counts how many rows are enriched, to prove a page request does not enrich the whole queue.
  let enriched = 0;
  const gmailSendPort = { getStatus: () => ({ configuredMailbox: 'sender@example.test', sendingEnabled: false }),
    eligibility: item => { enriched++; return { eligible: item.reviewId === 'r1', mode: 'new', label: 'Send' }; } };
  const handler = createOutreachHttpHandler({ repository, gmailSendPort, contactStore: {}, getReview: id => ['r1', 'r2'].includes(id) ? review : null });
  const server = createServer((request, response) => {
    handler(request, response, new URL(request.url, 'http://localhost')).then(handled => { if (!handled) { response.writeHead(404); response.end(); } });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); repository.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, body) {
    const response = await fetch(base + route, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  }
  return { request, repository, get enriched() { return enriched; }, reset() { enriched = 0; } };
}

test('a paged request returns one page with totals and enriches only that page', async t => {
  const f = await fixture(t);
  const { status, data } = await f.request('/api/outreach-queue?limit=50&offset=100');
  assert.equal(status, 200);
  assert.equal(data.items.length, 50); assert.equal(data.total, TOTAL); assert.equal(data.scopeTotal, TOTAL);
  assert.equal(data.offset, 100); assert.equal(data.limit, 50);
  assert.equal(data.items[0].fullName, 'Person 0100');
  assert.ok(data.items.every(item => item.sendAction && item.letterGate), 'page rows are enriched as before');
  assert.equal(f.enriched, 50);
  assert.deepEqual(data.statuses, ['new']);
});

test('without limit the API still returns every row, for bulk actions and older callers', async t => {
  const f = await fixture(t);
  const { data } = await f.request('/api/outreach-queue');
  assert.equal(data.items.length, TOTAL); assert.equal(data.total, TOTAL); assert.equal(data.limit, null);
});

test('search, scope and sort apply before paging', async t => {
  const f = await fixture(t);
  const searched = (await f.request('/api/outreach-queue?limit=25&q=head%20of%20delivery')).data;
  assert.equal(searched.total, TOTAL / 10); assert.equal(searched.items.length, 25);
  assert.ok(searched.items.every(item => item.role === 'Head of Delivery'));
  const scoped = (await f.request('/api/outreach-queue?reviewId=r2&limit=10&q=beta')).data;
  assert.equal(scoped.total, TOTAL / 2); assert.equal(scoped.scopeTotal, TOTAL / 2);
  assert.ok(scoped.items.every(item => item.reviewId === 'r2'));
  const newest = (await f.request('/api/outreach-queue?limit=1&sort=newest')).data;
  assert.equal(newest.items[0].fullName, 'Person 2999');
  const none = (await f.request('/api/outreach-queue?limit=50&status=sent')).data;
  assert.equal(none.total, 0); assert.deepEqual(none.items, []);
});

test('the schedulable filter applies before paging', async t => {
  const f = await fixture(t);
  const { data } = await f.request('/api/outreach-queue?limit=50&offset=0&filter=schedulable');
  assert.equal(data.total, TOTAL / 2);
  assert.ok(data.items.every(item => item.reviewId === 'r1' && item.sendAction.eligible));
});

test('an offset past the end returns the last page; bad paging values are refused', async t => {
  const f = await fixture(t);
  const last = (await f.request('/api/outreach-queue?limit=200&offset=999999')).data;
  assert.equal(last.offset, 2800); assert.equal(last.items.length, 200);
  for (const query of ['limit=0', 'limit=1000', 'offset=-5', 'sort=nope', 'filter=bad']) {
    const response = await f.request('/api/outreach-queue?' + query);
    assert.equal(response.status, 400, query); assert.equal(response.data.ok, false);
  }
  assert.equal((await f.request('/api/outreach-queue?reviewId=missing&limit=50')).status, 404);
});

test('rows ticked on other pages can be re-read by id; removed rows drop out', async t => {
  const f = await fixture(t);
  const ids = f.repository.list().slice(0, 3).map(item => item.id);
  f.reset();
  const { status, data } = await f.request('/api/outreach-queue/items', { ids: [...ids, 'gone'] });
  assert.equal(status, 200);
  assert.deepEqual(data.items.map(item => item.id), ids);
  assert.ok(data.items.every(item => item.sendAction));
  assert.equal(f.enriched, 3);
  assert.equal((await f.request('/api/outreach-queue/items', { ids: 'nope' })).status, 400);
  assert.equal((await f.request('/api/outreach-queue/items', { ids: [1] })).status, 400);
});
