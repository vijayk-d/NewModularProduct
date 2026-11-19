import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {buildApplicationFeatures, roleFamily, seniority, FEATURE_COLUMNS} from '../../src/domain/insights/application-features.js';
import {createInsightsSnapshot} from '../../src/application/insights-snapshot.js';
import {createApplicationInsightsStore} from '../../src/infrastructure/applications/sqlite-application-insights-store.js';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

const day = d => Date.parse(d + 'T09:00:00Z');

test('role family and level come from the job title', () => {
  assert.equal(roleFamily('Senior Agile Delivery Manager'), 'delivery');
  assert.equal(roleFamily('SAFe Release Train Engineer'), 'release-train-engineer');
  assert.equal(roleFamily('Enterprise Agile Coach'), 'agile-coach');
  assert.equal(roleFamily('Chef'), 'other');
  assert.equal(seniority('Head of Delivery'), 'director');
  assert.equal(seniority('Lead Scrum Master'), 'senior');
  assert.equal(seniority('Scrum Master'), 'mid');
});

test('one row of facts per application, with channel, timing and the latest outcome, and no letter text', () => {
  const review = {createdAt: day('2026-11-03'), formData: {jobTitle: 'Senior Delivery Manager', organisationName: 'Example', jobImportId: '4242', advertiserRelationship: 'recruitment-intermediary', cvHighlights: ['a', 'b']},
    prepared: {recommendation: {bestCv: {role_code: 'DM'}, ats: {score: 71.6}}, coverLetter: {plainText: 'Original letter text'}}, currentDraftPlainText: 'Edited letter text here', letterTone: 'consultative',
    currentLetterLengthMode: 'custom-400', polishingModel: 'm', research: {status: 'found', automatic: true}, polishingScenarios: {references: [{id: 's1'}]}};
  const f = buildApplicationFeatures({reviewId: 'r1', review, importedJob: {receivedAt: '2026-11-01T08:00:00Z'},
    portalExports: [{reviewId: 'r1', exportedAt: day('2026-11-05')}], sentEmails: [{reviewId: 'r1', sentAt: '2026-11-04T10:00:00Z'}, {reviewId: 'other', sentAt: '2026-11-02T10:00:00Z'}],
    tailored: {version: 3}, outcomes: [{id: 1, outcome: 'no_reply', occurredOn: '2026-11-10', recordedAt: 1}, {id: 2, outcome: 'interview', occurredOn: '2026-11-14', recordedAt: 2}]});
  assert.deepEqual({family: f.roleFamily, level: f.seniority, source: f.advertSource, daysAdvert: f.daysAdvertToApplication, rel: f.advertiserRelationship, cv: f.cvCode, ats: f.atsScore},
    {family: 'delivery', level: 'senior', source: 'linkedin', daysAdvert: 2, rel: 'recruitment-intermediary', cv: 'DM', ats: 72});
  assert.deepEqual({tailored: f.cvTailored, versions: f.tailoredVersions, edited: f.letterEdited, words: f.letterWords, ach: f.achievementsSelected, sc: f.scenariosSelected, research: f.research},
    {tailored: true, versions: 3, edited: true, words: 4, ach: 2, sc: 1, research: 'automatic'});
  assert.deepEqual({channel: f.channel, applied: f.appliedAt.slice(0, 10), outcome: f.outcome, responded: f.responded, daysToOutcome: f.daysToOutcome},
    {channel: 'both', applied: '2026-11-04', outcome: 'interview', responded: true, daysToOutcome: 9});
  assert.doesNotMatch(JSON.stringify(f), /letter text/i, 'no letter text in the row');
  assert.deepEqual(Object.keys(f).filter(k => k !== 'reviewId').sort(), [...FEATURE_COLUMNS].sort());
});

test('the snapshot rebuilds every saved application, replaces the previous one and skips unreadable ones', async () => {
  const reviews = reviewFixture(), store = createApplicationInsightsStore({filePath: ':memory:'}), logs = [];
  reviews.set('r2', {formData: {jobTitle: 'Scrum Master', organisationName: 'Other'}, createdAt: Date.now()});
  store.record('r1', {outcome: 'offer', occurredOn: '2026-11-18', note: 'private'});
  const original = reviews.get.bind(reviews);
  const flaky = {summaries: o => reviews.summaries(o), get: id => { if (id === 'r2' && flaky.fail) throw new Error('unreadable'); return original(id); }, fail: false};
  const snapshot = createInsightsSnapshot({reviews: flaky, store, log: m => logs.push(m)});
  const first = await snapshot.rebuild();
  assert.deepEqual([first.status, first.count, first.problems], ['built', 2, 0]);
  const rows = snapshot.read().rows;
  assert.equal(rows.find(r => r.reviewId === 'r1').outcome, 'offer');
  assert.doesNotMatch(JSON.stringify(rows), /private/, 'outcome notes are not copied');
  flaky.fail = true;
  const second = await snapshot.rebuild();
  assert.deepEqual([second.count, second.problems], [1, 1]);
  assert.match(logs[0], /SNAPSHOT_SKIPPED 1/);
  assert.equal(snapshot.read().rows.length, 1, 'replaced, not appended');
  const [a, b] = [snapshot.rebuild(), snapshot.rebuild()];
  assert.equal(a, b, 'one rebuild at a time');
  await a;
});

test('the page shows the snapshot, Rebuild now refreshes it, and recording an outcome schedules a rebuild', async t => {
  const reviews = reviewFixture(), insightsStore = createApplicationInsightsStore({filePath: ':memory:'});
  const snapshot = createInsightsSnapshot({reviews, store: insightsStore});
  let scheduled = 0;
  const insightsSnapshot = {...snapshot, read: () => snapshot.read(), rebuild: () => snapshot.rebuild(), schedule: () => { scheduled++; }};
  const server = createLocalServer({applicationReviewStore: reviews, insightsStore, insightsSnapshot, recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.match(await (await fetch(base + '/insights/data')).text(), /0 applications in the snapshot/);
  const r = await fetch(base + '/insights/rebuild', {method: 'POST', redirect: 'manual'});
  assert.equal(r.status, 303);
  const html = await (await fetch(base + '/insights/data')).text();
  assert.match(html, /1 application in the snapshot, 0 with an outcome/);
  assert.match(html, /<td>Delivery Manager<\/td><td>delivery<\/td>/);
  assert.match(html, /href="\/insights\/data"/, 'listed in the menu');
  await fetch(base + '/api/reviews/r1/outcomes', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({outcome: 'interview', occurredOn: '2026-11-17'})});
  assert.equal(scheduled, 1);
  assert.equal((await (await fetch(base + '/api/insights/features')).json()).rows.length, 1);
});
