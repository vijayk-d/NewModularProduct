import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQueuePageQuery, filterQueueItems, sortQueueItems, pageQueueItems, isSchedulableQueueItem, queueStatuses } from '../../src/application/outreach-queue-page.js';

const rows = Array.from({ length: 120 }, (_, i) => ({ id: 'q' + i, fullName: 'Person ' + String(i).padStart(3, '0'),
  email: `p${i}@example.test`, status: i % 3 === 0 ? 'sent' : 'new', application: { organisationName: i % 2 ? 'Beta Ltd' : 'Alpha plc' } }));
const params = query => new URLSearchParams(query);

test('page query: limit is optional, so callers without paging still get every row', () => {
  assert.deepEqual(parseQueuePageQuery(params('')), { q: '', status: '', sort: 'queued', filter: '', limit: null, offset: 0 });
  assert.deepEqual(parseQueuePageQuery(params('limit=50&offset=100&q=%20Alpha%20&status=new&sort=name&filter=schedulable')),
    { q: 'alpha', status: 'new', sort: 'name', filter: 'schedulable', limit: 50, offset: 100 });
});

test('page query rejects bad limits, offsets, sorts and filters with 400', () => {
  for (const query of ['limit=0', 'limit=501', 'limit=abc', 'limit=2.5', 'offset=-1', 'offset=x', 'sort=random', 'filter=everything']) {
    assert.throws(() => parseQueuePageQuery(params(query)), error => error.statusCode === 400, query);
  }
});

test('paging cuts one page and reports the total of all matching rows', () => {
  const page = pageQueueItems(rows, { limit: 50, offset: 50 });
  assert.equal(page.items.length, 50); assert.equal(page.items[0].id, 'q50'); assert.equal(page.total, 120); assert.equal(page.offset, 50);
  const last = pageQueueItems(rows, { limit: 50, offset: 100 });
  assert.equal(last.items.length, 20); assert.equal(last.items.at(-1).id, 'q119');
  assert.equal(pageQueueItems(rows, { limit: null }).items.length, 120);
});

test('an offset past the end moves back to the last page; an empty list stays on page one', () => {
  const page = pageQueueItems(rows, { limit: 50, offset: 5000 });
  assert.equal(page.offset, 100); assert.equal(page.items.length, 20);
  assert.deepEqual(pageQueueItems([], { limit: 50, offset: 50 }), { items: [], total: 0, offset: 0, limit: 50 });
});

test('search and status filters apply to the whole list before paging', () => {
  const sentAlpha = filterQueueItems(rows, { q: 'alpha', status: 'sent' });
  assert.ok(sentAlpha.every(r => r.status === 'sent' && r.application.organisationName === 'Alpha plc'));
  assert.equal(sentAlpha.length, 20);
  assert.deepEqual(filterQueueItems(rows, { q: 'p119@' }).map(r => r.id), ['q119']);
  const page = pageQueueItems(filterQueueItems(rows, { status: 'sent' }), { limit: 10, offset: 30 });
  assert.equal(page.total, 40); assert.ok(page.items.every(r => r.status === 'sent'));
});

test('sorting is stable and newest first reverses queue order', () => {
  assert.equal(sortQueueItems(rows, 'newest')[0].id, 'q119');
  assert.equal(sortQueueItems(rows, 'queued')[0].id, 'q0');
  const byOrganisation = sortQueueItems(rows, 'organisation');
  assert.equal(byOrganisation[0].application.organisationName, 'Alpha plc'); assert.equal(byOrganisation[0].id, 'q0'); assert.equal(byOrganisation[1].id, 'q2');
  assert.equal(sortQueueItems([{ id: 'b', fullName: 'zed' }, { id: 'a', fullName: 'Amy' }], 'name')[0].id, 'a');
  assert.equal(rows[0].id, 'q0', 'the input is not mutated');
});

test('schedulable matches the bulk Send rule and statuses are listed once', () => {
  assert.equal(isSchedulableQueueItem({ status: 'drafted', sendAction: { eligible: true, mode: 'draft' } }), true);
  assert.equal(isSchedulableQueueItem({ status: 'new', sendAction: { eligible: true, mode: 'new' }, letterGate: { allowed: false } }), false);
  assert.equal(isSchedulableQueueItem({ status: 'sent', sendAction: { eligible: true, mode: 'repeat' } }), false);
  assert.equal(isSchedulableQueueItem({ status: 'new', sendAction: { eligible: false, mode: 'new' } }), false);
  assert.deepEqual(queueStatuses(rows), ['new', 'sent']);
});
