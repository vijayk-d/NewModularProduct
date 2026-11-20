import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {evidenceKey, evidenceUsed, learnFromApplications, learnedBonus, learningNote, MIN_USES_FOR_RATE} from '../../src/domain/insights/evidence-learning.js';
import {createEvidenceLearning} from '../../src/application/evidence-learning.js';
import {createInsightsSnapshot} from '../../src/application/insights-snapshot.js';
import {createApplicationInsightsStore} from '../../src/infrastructure/applications/sqlite-application-insights-store.js';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

const A = 'At SKY, I facilitated PI planning for five squads.', B = 'At BP, I built in-house Agile and OKR capability.';

test('evidence keys are stable across spacing and case, and an application lists achievements and scenarios once', () => {
  assert.equal(evidenceKey(A), evidenceKey('  at sky,  I facilitated PI planning for five squads. '));
  assert.notEqual(evidenceKey(A), evidenceKey(B));
  const used = evidenceUsed({formData: {cvHighlights: [A, A, 'null', B]}, polishingScenarios: {references: [{assignmentId: 'a1', scenarioId: 's1', proof: 'x'}]}});
  assert.deepEqual(used.map(u => u.kind), ['achievement', 'achievement', 'scenario']);
  assert.equal(used[2].key, 'scn:s1');
});

function rows() {
  const out = [];
  // A: used 6 times, 4 responses (2 interviews). B: used 5 times, no responses. Term "budget" asked 4 times, missing 3.
  for (let i = 0; i < 6; i++) out.push({evidenceKeys: [evidenceKey(A)], outcome: ['interview', 'recruiter_replied', 'offer', 'rejected', 'no_reply', 'no_reply'][i], appliedAt: '2026-11-0' + (i + 1), jobTerms: ['budget', 'agile'], missingTerms: i < 3 ? ['budget'] : []});
  for (let i = 0; i < 5; i++) out.push({evidenceKeys: [evidenceKey(B)], outcome: 'no_reply', createdAt: '2026-10-1' + i, jobTerms: ['okr'], missingTerms: []});
  out.push({evidenceKeys: [evidenceKey(B)], outcome: '', jobTerms: [], missingTerms: []});
  return out;
}

test('learning: response and interview rates per item once there are enough outcomes, and repeated gaps', () => {
  const l = learnFromApplications(rows());
  const a = l.evidence.find(e => e.key === evidenceKey(A)), b = l.evidence.find(e => e.key === evidenceKey(B));
  assert.deepEqual([a.uses, a.decided, a.responded, a.interviews], [6, 6, 4, 2]);
  assert.equal(Math.round(a.responseRate * 100), 67);
  assert.deepEqual([b.uses, b.decided, b.responseRate], [6, 5, 0]);
  assert.equal(l.evidence[0].key, evidenceKey(A), 'proven evidence first');
  assert.deepEqual(l.gaps.map(g => [g.term, g.adverts, g.missing]), [['budget', 6, 3]]);
  assert.equal(learnedBonus(a), 2);
  assert.equal(learnedBonus(b), -2);
  assert.equal(learnedBonus({responseRate: null}), 0, 'no nudge until there is enough evidence');
  assert.match(learningNote(a), /Used in 6 applications · 67% got a response · 2 interviews/);
  assert.match(learningNote({uses: 2, decided: 1, responseRate: null}), new RegExp(`from ${MIN_USES_FOR_RATE}`));
});

test('the snapshot records evidence keys and labels; the checklist is annotated with what was learned', async () => {
  const reviews = reviewFixture(), store = createApplicationInsightsStore({filePath: ':memory:'});
  const base = reviews.get('r1');
  for (let i = 0; i < 6; i++) {
    const id = 'app' + i;
    reviews.set(id, {...base, formData: {...base.formData, cvHighlights: [A]}, polishingScenarios: {references: [{assignmentId: 'a1', scenarioId: 's1', proof: 'p'}]}});
    store.record(id, {outcome: i < 4 ? 'interview' : 'no_reply', occurredOn: '2026-11-1' + i, note: ''});
  }
  const snapshot = createInsightsSnapshot({reviews, store, scenarioLabel: (sid, aid) => sid === 's1' && aid === 'a1' ? 'Rescued a late release' : ''});
  await snapshot.rebuild();
  const row = store.features().rows.find(r => r.reviewId === 'app0');
  assert.deepEqual(row.evidenceKeys, [evidenceKey(A), 'scn:s1']);
  assert.ok(!JSON.stringify(row).includes('PI planning'), 'the snapshot row holds keys, not text');
  const learning = createEvidenceLearning({store});
  const summary = learning.summary();
  assert.equal(summary.evidence.find(e => e.key === 'scn:s1').label, 'Rescued a late release');
  assert.equal(summary.evidence.find(e => e.key === evidenceKey(A)).label, A);
  const annotated = learning.annotate({candidates: [{id: 'x', text: A, relevance: 1}, {id: 'y', text: B, relevance: 3}]});
  assert.equal(annotated.candidates[0].learning.bonus, 2);
  assert.match(annotated.candidates[0].learning.note, /67% got a response|got a response/);
  assert.equal(annotated.candidates[1].learning, undefined, 'never used: no note, no nudge');
});

test('the Evidence learning page lists proven evidence and gaps, and is in the menu', async t => {
  const store = createApplicationInsightsStore({filePath: ':memory:'});
  store.replaceFeatures(rows().map((r, i) => ({reviewId: 'r' + i, ...r})));
  store.replaceEvidenceItems([{key: evidenceKey(A), kind: 'achievement', label: A}]);
  const server = createLocalServer({insightsSnapshot: {read: () => store.features(), rebuild: async () => ({}), schedule() {}}, evidenceLearning: createEvidenceLearning({store}),
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const html = await (await fetch(base + '/insights/evidence')).text();
  assert.match(html, /<title>Evidence learning<\/title>/);
  assert.match(html, /12 applications in the snapshot, 11 with an outcome; 2 evidence items used/);
  assert.match(html, /At SKY, I facilitated PI planning/);
  assert.match(html, /data-gap="budget"/);
  assert.match(html, /href="\/insights\/evidence"/);
  assert.equal((await (await fetch(base + '/api/insights/evidence')).json()).gaps[0].term, 'budget');
});
