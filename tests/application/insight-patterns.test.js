import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {insightPatterns, atsBand, MIN_GROUP_OUTCOMES} from '../../src/domain/insights/insight-patterns.js';
import {createApplicationInsightsStore} from '../../src/infrastructure/applications/sqlite-application-insights-store.js';
import {createEvidenceLearning} from '../../src/application/evidence-learning.js';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';

// PM CV: 12 with an outcome (6 responses, 3 interviews). SM CV: 4 with an outcome. Plus 2 without an outcome.
function rows() {
  const out = [];
  for (let i = 0; i < 12; i++) out.push({reviewId: 'pm' + i, cvCode: 'PM', roleFamily: 'project', seniority: 'senior', letterTone: 'professional', letterLength: 'standard', cvTailored: i % 2 === 0,
    atsScore: 80, channel: 'email', advertiserRelationship: 'direct-employer', outcome: i < 3 ? 'interview' : i < 6 ? 'recruiter_replied' : 'no_reply', evidenceKeys: i < 3 ? ['ach:proven', 'scn:s1'] : ['ach:other']});
  for (let i = 0; i < 4; i++) out.push({reviewId: 'sm' + i, cvCode: 'SM', roleFamily: 'scrum-master', seniority: 'mid', letterTone: 'warm', letterLength: 'short', cvTailored: false,
    atsScore: null, channel: 'portal', advertiserRelationship: 'recruitment-intermediary', outcome: 'no_reply', evidenceKeys: []});
  out.push({reviewId: 'x1', cvCode: 'SM', outcome: '', evidenceKeys: ['ach:proven']}, {reviewId: 'x2', cvCode: '', outcome: ''});
  return out;
}

test('ATS bands', () => {
  assert.deepEqual([atsBand(90), atsBand(85), atsBand(70), atsBand(55), atsBand(10), atsBand(null)], ['85 and above', '85 and above', '70–84', '50–69', 'Below 50', 'Not scored']);
});

test('rates show only for groups with enough outcomes; smaller groups say how many more are needed', () => {
  const p = insightPatterns(rows());
  assert.equal(MIN_GROUP_OUTCOMES, 10);
  assert.deepEqual([p.overall.applications, p.overall.decided, p.overall.ready], [18, 16, true]);
  assert.equal(Math.round(p.overall.responseRate * 100), 38);
  const cv = p.dimensions.find(d => d.id === 'cv');
  const pm = cv.groups.find(g => g.value === 'PM'), sm = cv.groups.find(g => g.value === 'SM'), none = cv.groups.find(g => g.value === 'Not recorded');
  assert.deepEqual([pm.decided, pm.ready, Math.round(pm.responseRate * 100), Math.round(pm.interviewRate * 100), pm.versusOverall], [12, true, 50, 25, 13]);
  assert.deepEqual([sm.applications, sm.decided, sm.ready, sm.responseRate, sm.needed, sm.versusOverall], [5, 4, false, null, 6, null]);
  assert.equal(none.applications, 1);
  assert.equal(cv.groups[0].value, 'PM', 'largest decided group first');
  assert.equal(p.dimensions.find(d => d.id === 'tailored').groups.find(g => g.value === 'Not tailored').applications, 12);
  assert.deepEqual(p.interviewEvidence, [{key: 'ach:proven', interviews: 3}, {key: 'scn:s1', interviews: 3}]);
  assert.equal(insightPatterns([]).overall.needed, 10);
});

test('the Insights page labels patterns as correlations, hides small-group rates and is in the menu', async t => {
  const store = createApplicationInsightsStore({filePath: ':memory:'});
  store.replaceFeatures(rows());
  store.replaceEvidenceItems([{key: 'ach:proven', kind: 'achievement', label: 'At SKY, I facilitated PI planning for five squads.'}]);
  const server = createLocalServer({insightsSnapshot: {read: () => store.features(), rebuild: async () => ({}), schedule() {}}, evidenceLearning: createEvidenceLearning({store}),
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const html = await (await fetch(base + '/insights')).text();
  assert.match(html, /<title>Insights<\/title>/);
  assert.match(html, /18 applications, 16 with an outcome\. Overall: 38% got a response, 19% reached interview\./);
  assert.match(html, /not causes/);
  assert.match(html, /<tr data-group="PM" data-ready="true"><td>PM<\/td><td>12<\/td><td>12<\/td><td>50%<\/td><td>25%<\/td><td><span class="up">\+13 pts<\/span><\/td><\/tr>/);
  assert.match(html, /<tr data-group="SM" data-ready="false">[^]*?needs 6 more/);
  assert.match(html, /At SKY, I facilitated PI planning for five squads\.<\/td><td>3<\/td>/);
  assert.match(html, /href="\/insights"/);
  const json = await (await fetch(base + '/api/insights/patterns')).json();
  assert.equal(json.ok, true); assert.equal(json.minGroupOutcomes, 10);
  assert.equal((await fetch(base + '/insights', {headers: {origin: 'https://evil.test'}})).status, 403);
});
