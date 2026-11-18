import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateOutcome, currentOutcome, hasResponse, OUTCOMES} from '../../src/domain/insights/application-outcome.js';
import {createApplicationInsightsStore} from '../../src/infrastructure/applications/sqlite-application-insights-store.js';
import {buildHistoryDashboard, followUpsDue} from '../../src/application/history-dashboard.js';
import {readHistorySnapshot} from '../../src/infrastructure/applications/history-dashboard-reader.js';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

const now = new Date('2026-11-18T12:00:00Z');

test('outcomes are checked: known choice, real past date, short plain note', () => {
  assert.deepEqual(validateOutcome({outcome: 'interview', occurredOn: '2026-11-17', note: '  First   round '}, {now}), {outcome: 'interview', occurredOn: '2026-11-17', note: 'First round'});
  for (const bad of [{outcome: 'hired', occurredOn: '2026-11-17'}, {outcome: 'offer', occurredOn: '2026-11-19'}, {outcome: 'offer', occurredOn: '2026-02-30'}, {outcome: 'offer', occurredOn: '17/11/2026'},
    {outcome: 'offer', occurredOn: '2026-11-17', note: 'x'.repeat(301)}, {outcome: 'offer', occurredOn: '2026-11-17', note: '<b>hi</b>'}]) {
    assert.throws(() => validateOutcome(bad, {now}), e => e.statusCode === 400, JSON.stringify(bad));
  }
  assert.equal(OUTCOMES.length, 6);
});

test('the current outcome is the latest by date, then by when it was recorded', () => {
  const events = [{id: 1, outcome: 'interview', occurredOn: '2026-11-10', recordedAt: 5}, {id: 2, outcome: 'no_reply', occurredOn: '2026-11-01', recordedAt: 9}, {id: 3, outcome: 'rejected', occurredOn: '2026-11-10', recordedAt: 7}];
  assert.equal(currentOutcome(events).outcome, 'rejected');
  assert.equal(currentOutcome([]), null);
  assert.equal(hasResponse({outcome: 'no_reply'}), false);
  assert.equal(hasResponse({outcome: 'recruiter_replied'}), true);
});

test('the store keeps every entry, removes one only for its application, and refuses unknown databases', () => {
  let t = 1000;
  const store = createApplicationInsightsStore({filePath: ':memory:', clock: () => t++});
  const a = store.record('r1', {outcome: 'no_reply', occurredOn: '2026-11-10', note: ''});
  store.record('r1', {outcome: 'interview', occurredOn: '2026-11-15', note: 'Panel'});
  store.record('r2', {outcome: 'offer', occurredOn: '2026-11-16', note: ''});
  assert.deepEqual(store.history('r1').map(e => e.outcome), ['no_reply', 'interview']);
  assert.equal(store.history('r1')[1].note, 'Panel');
  assert.equal(store.remove('r2', a.id), false, 'cannot remove another application\'s entry');
  assert.equal(store.remove('r1', a.id), true);
  assert.deepEqual(store.history('r1').map(e => e.outcome), ['interview']);
  assert.throws(() => createApplicationInsightsStore({}), /path required/);
});

test('the dashboard shows each vacancy\'s outcome and leaves responded applications out of follow-ups', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'insights-')); t.after(() => rmSync(dir, {recursive: true, force: true}));
  const store = createApplicationInsightsStore({filePath: path.join(dir, 'application-insights-v1.db')});
  store.record('r1', {outcome: 'recruiter_replied', occurredOn: '2026-11-12', note: 'secret note text'});
  store.close();
  const snapshot = await readHistorySnapshot(dir, 'development');
  assert.equal(snapshot.coverage.outcomes.status, 'available');
  assert.equal(snapshot.outcomes[0].reviewId, 'r1');
  assert.equal(snapshot.outcomes[0].outcome, 'recruiter_replied');
  assert.doesNotMatch(JSON.stringify(snapshot), /secret note text/, 'notes never reach the dashboard');
  const view = buildHistoryDashboard({source: 'development', coverage: {}, reviews: [{id: 'r1', formData: {organisationName: 'Example', jobTitle: 'Delivery Lead'}, createdAt: Date.parse('2026-11-01')}], outcomes: snapshot.outcomes}, {now: now.getTime()});
  const row = view.rows.find(r => r.organisation === 'Example');
  assert.deepEqual(row.outcome, {outcome: 'recruiter_replied', label: 'Recruiter replied', occurredOn: '2026-11-12'});
  assert.equal(view.outcomeCounts.find(c => c.id === 'recruiter_replied').count, 1);
  assert.equal(view.outcomesRecorded, 1);
  const rows = [{kinds: ['email_sent'], lastActivity: '2026-11-01T00:00:00Z', organisation: 'A', outcome: null}, {kinds: ['email_sent'], lastActivity: '2026-11-01T00:00:00Z', organisation: 'B', outcome: {outcome: 'interview'}}, {kinds: ['email_sent'], lastActivity: '2026-11-01T00:00:00Z', organisation: 'C', outcome: {outcome: 'no_reply'}}];
  assert.deepEqual(followUpsDue(rows, {now: now.getTime()}).map(r => r.organisation), ['A', 'C']);
});

test('record, read and remove through the local server; the saved list shows the outcome', async t => {
  const reviews = reviewFixture(), insightsStore = createApplicationInsightsStore({filePath: ':memory:'});
  const server = createLocalServer({applicationReviewStore: reviews, insightsStore, recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port, api = base + '/api/reviews/r1/outcomes';
  const post = (url, body) => fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  assert.equal((await (await fetch(api)).json()).current, null);
  assert.equal((await post(api, {outcome: 'interview', occurredOn: '2099-01-01'})).status, 400);
  const saved = await (await post(api, {outcome: 'interview', occurredOn: '2026-11-17', note: 'Panel'})).json();
  assert.equal(saved.current.label, 'Interview');
  assert.match(await (await fetch(base + '/applications')).text(), /<td data-outcome-cell>Interview \(2026-11-17\)<\/td>/);
  const removed = await (await post(api + '/' + saved.current.id + '/remove', {})).json();
  assert.equal(removed.current, null);
  assert.equal((await fetch(base + '/api/reviews/unknown/outcomes')).status, 404);
  assert.equal((await post(api, {outcome: 'offer', occurredOn: '2026-11-17'}).then(r => r)).status, 200);
  assert.equal((await fetch(api, {method: 'POST', headers: {'content-type': 'application/json', origin: 'https://evil.test'}, body: '{}'})).status, 403);
});
