import test from 'node:test';
import assert from 'node:assert/strict';
import {executeBulkSchedule, staggeredTimes, SCHEDULE_MAX, SCHEDULE_SPACING_MS} from '../../src/interfaces/http/outreach-schedule.js';

const now = Date.parse('2026-11-21T09:00:00Z'), due = '2026-11-21T10:00:00.000Z';
const items = Array.from({length: 23}, (_, i) => ({id: 'q' + i, applicationKey: 'app' + i, email: `r${i}@example.test`, status: 'new', sendAction: {eligible: true, mode: 'new'}}));

function fakeApi(prepares, commits) {
  return async (path, body) => {
    if (path.endsWith('/prepare')) { prepares.push(body); return {approval: 'a-' + body.queueId, mode: 'new', dueAt: body.dueAt, timeZone: body.timeZone, expiresAt: now + 300000}; }
    if (path.endsWith('/commit')) { commits.push(body); return {job: {id: 'job-' + commits.length, status: 'AWAITING_CLOUD'}}; }
    return {};
  };
}

test('staggered times are one minute apart from the chosen time', () => {
  assert.deepEqual(staggeredTimes(due, 3, SCHEDULE_SPACING_MS), ['2026-11-21T10:00:00.000Z', '2026-11-21T10:01:00.000Z', '2026-11-21T10:02:00.000Z']);
  assert.deepEqual(staggeredTimes(due, 2, 0), [due, due]);
});

test('more than 20 eligible: the first 20 are prepared and approved, the rest are deferred, each with its own minute', async () => {
  const prepares = [], commits = [];
  let shown;
  const result = await executeBulkSchedule({items, ids: items.map(i => i.id), dueAt: due, timeZone: 'Europe/London', api: fakeApi(prepares, commits), save: async () => {},
    confirm: async data => { shown = data; return true; }, now: () => now, spacingMs: SCHEDULE_SPACING_MS});
  assert.equal(SCHEDULE_MAX, 20);
  assert.equal(prepares.length, 20); assert.equal(commits.length, 20);
  assert.deepEqual(result.deferred, ['q20', 'q21', 'q22']);
  assert.equal(shown.deferred, 3);
  assert.equal(prepares[0].dueAt, due); assert.equal(prepares[19].dueAt, '2026-11-21T10:19:00.000Z');
  assert.equal(result.results.filter(r => r.kind === 'awaiting_cloud').length, 20);
});

test('a cancelled approval commits nothing and still reports the deferred rows', async () => {
  const prepares = [], commits = [];
  const result = await executeBulkSchedule({items: items.slice(0, 21), ids: items.slice(0, 21).map(i => i.id), dueAt: due, timeZone: 'Europe/London', api: fakeApi(prepares, commits), save: async () => {},
    confirm: async () => false, now: () => now});
  assert.equal(commits.length, 0); assert.equal(result.confirmed, false);
  assert.deepEqual(result.deferred, ['q20']);
  assert.equal(new Set(prepares.map(p => p.dueAt)).size, 1, 'without spacing every email shares the chosen time');
});
