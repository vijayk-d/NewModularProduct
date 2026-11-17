// Tailored CV part 2: the paid Polish step. Fake polisher and fake fetch only; no network call.
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createCvTailoringService} from '../../src/application/cv-tailoring.js';
import {createCvTailoringStore} from '../../src/infrastructure/applications/sqlite-cv-tailoring-store.js';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {buildCvPolishApiRequest, createCvPolisher, CV_POLISH_SCHEMA} from '../../src/infrastructure/refinement/perplexity-cv-polishing-adapter.js';
import {fakeWorker, reviewFixture, SHA} from '../fixtures/cv-tailoring-fixtures.js';

const library = async () => [{role_code: 'PM', local_path: 'PM/PM_CV.pdf'}];
const experience = {headings: ['SUMMARY', 'EXPERIENCE'], profile: {heading: 'SUMMARY', paragraphs: ['Agile delivery leader.'], bullets: 0, supported: true}, achievements: null,
  experience: {heading: 'EXPERIENCE', supported: true, roles: [
    {title: 'ACME BANK — Delivery Lead', bullets: ['Built a CoE.', 'Cut risk incidents by 30% through agile risk reviews.']},
    {title: 'OTHER CO — Scrum Master', bullets: ['Coached 5 teams.']}]}};

function fakePolisher(result, {available = true} = {}) {
  const calls = [];
  return {calls, available, buildRequest: buildCvPolishApiRequest,
    async polish(request, model) { calls.push({request, model}); if (result instanceof Error) throw result; return {result, response: {model, usage: {input_tokens: 900, output_tokens: 300, cost: {total_cost: 0.0004}}}, durationMs: 5}; }};
}
function service(polisher, sections) {
  return createCvTailoringService({reviews: reviewFixture(), store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker([], {sections}), cvFolder: 'C:/cv', cvLibrary: library, polisher});
}
const body = {profile: ['Delivery leader across programmes.'], achievements: ['Cut costs by 10% through vendor consolidation.', 'Led a 40-person Agile programme.'], expectedSha256: SHA, expectedRoleCode: 'PM'};

test('estimate is free, lists models with costs and ties the proof to the exact request', async () => {
  const polisher = fakePolisher({}), s = service(polisher);
  const a = await s.polishEstimate('r1', body);
  assert.equal(a.available, true);
  assert.equal(polisher.calls.length, 0);
  assert.ok(a.models.length > 1 && a.models.every(m => m.estimatedTokenCostUsd >= 0));
  assert.match(a.costProof, /^[0-9a-f]{64}$/);
  const b = await s.polishEstimate('r1', {...body, model: a.models.at(-1).id});
  assert.notEqual(b.costProof, a.costProof);
  const c = await s.polishEstimate('r1', {...body, profile: ['Changed wording.']});
  assert.notEqual(c.costProof, a.costProof);
  assert.equal((await s.draft('r1')).polishAvailable, true);
});

test('the request sends no web search and only the CV wording, CV lines and selected evidence', () => {
  const api = buildCvPolishApiRequest({jobTitle: 'Delivery Manager', organisationName: 'Example', keywords: ['agile'], jobDescriptionText: 'x'.repeat(9000), profile: ['P'], achievements: null,
    roles: [{title: 'ACME', bullets: ['B'], originalBullets: ['B0']}], originalProfile: ['P0'], originalAchievements: null, selectedEvidence: ['E']}, 'anthropic/claude-haiku-5-5');
  assert.equal(api.tools, undefined);
  assert.equal(api.model, 'anthropic/claude-haiku-5-5');
  assert.equal(api.response_format.json_schema.schema, CV_POLISH_SCHEMA);
  const user = JSON.parse(api.input[1].content[0].text);
  assert.equal(user.job.description.length, 6000);
  assert.deepEqual(user.originalCv.employers, [{employer: 'ACME', bullets: ['B0']}]);
  assert.match(api.input[0].content[0].text, /British English/);
});

test('polish needs the confirmed estimate, sends one request and only returns wording to review', async () => {
  const polisher = fakePolisher({summary: ['Agile delivery leader for complex programmes.'], keyAchievements: ['Led a 40-person Agile programme.', 'Cut costs by 10% through vendor consolidation.'], employers: [], notes: 'Kept all figures.'});
  const s = service(polisher), estimate = await s.polishEstimate('r1', body);
  await assert.rejects(s.polish('r1', {...body, confirmedCostProof: 'f'.repeat(64)}), e => e.code === 'CV_POLISH_ESTIMATE_STALE');
  assert.equal(polisher.calls.length, 0);
  const result = await s.polish('r1', {...body, confirmedCostProof: estimate.costProof});
  assert.equal(polisher.calls.length, 1);
  assert.equal(polisher.calls[0].model, estimate.model);
  assert.deepEqual(result.proposal.profile, ['Agile delivery leader for complex programmes.']);
  assert.deepEqual(result.problems, []);
  assert.equal(result.notes, 'Kept all figures.');
  assert.equal(result.attempt.providerReportedCostUsd, 0.0004);
});

test('invented figures and moved figures are flagged, not hidden', async () => {
  const polisher = fakePolisher({summary: ['Saved £5M a year.'], keyAchievements: [], employers: [{bullets: ['Built a CoE.', 'Coached 5 teams.']}, {bullets: ['Coached 5 teams.']}], notes: ''});
  const s = service(polisher, experience);
  const request = {profile: ['Agile delivery leader.'], roles: [['Built a CoE.', 'Cut risk incidents by 30% through agile risk reviews.'], ['Coached 5 teams.']], expectedSha256: SHA, expectedRoleCode: 'PM'};
  const estimate = await s.polishEstimate('r1', request);
  const result = await s.polish('r1', {...request, confirmedCostProof: estimate.costProof});
  assert.ok(result.problems.some(p => /£5m/i.test(p)));
  assert.ok(result.problems.some(p => /ACME BANK.*figures 5/.test(p)));
});

test('a changed employer count is refused; a failure is reported once with no retry', async () => {
  const wrong = fakePolisher({summary: ['S'], keyAchievements: [], employers: [{bullets: ['x']}], notes: ''}), s = service(wrong, experience);
  const request = {profile: ['Agile delivery leader.'], roles: [['Built a CoE.'], ['Coached 5 teams.']], expectedSha256: SHA, expectedRoleCode: 'PM'};
  let e = await s.polishEstimate('r1', request);
  await assert.rejects(s.polish('r1', {...request, confirmedCostProof: e.costProof}), err => err.code === 'CV_POLISH_INVALID_RESPONSE');
  const failing = fakePolisher(Object.assign(new Error('The polishing service could not be reached.'), {code: 'CV_POLISH_NETWORK_FAILED'})), t = service(failing, experience);
  e = await t.polishEstimate('r1', request);
  await assert.rejects(t.polish('r1', {...request, confirmedCostProof: e.costProof}), err => err.statusCode === 503 && /no retry/.test(err.message));
  assert.equal(failing.calls.length, 1);
});

test('when polishing is off the estimate explains the setting and polish sends nothing', async () => {
  const polisher = fakePolisher({}, {available: false}), s = service(polisher);
  const e = await s.polishEstimate('r1', body);
  assert.equal(e.available, false);
  assert.match(e.message, /ENABLE_COVER_LETTER_REFINEMENT/);
  await assert.rejects(s.polish('r1', {...body, confirmedCostProof: e.costProof}), err => err.code === 'CV_POLISH_DISABLED');
  assert.equal(polisher.calls.length, 0);
  await assert.rejects(service(null).polishEstimate('r1', body), err => err.statusCode === 503);
});

test('the adapter makes exactly one request and never retries a provider error', async () => {
  const seen = [];
  const ok = createCvPolisher({apiKey: 'test-key', enabled: true, fetchImpl: async (url, init) => { seen.push({url, body: JSON.parse(init.body)}); return {ok: true, status: 200, json: async () => ({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({summary: ['S'], keyAchievements: [], employers: [], notes: ''})}]}]})}; }});
  const out = await ok.polish({jobTitle: '', organisationName: '', keywords: [], jobDescriptionText: '', profile: ['P'], achievements: null, roles: [], originalProfile: [], originalAchievements: null, selectedEvidence: []}, 'anthropic/claude-haiku-5-5');
  assert.deepEqual(out.result.summary, ['S']);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://api.perplexity.ai/v1/agent');
  let count = 0;
  const bad = createCvPolisher({apiKey: 'test-key', enabled: true, fetchImpl: async () => { count++; return {ok: false, status: 500, json: async () => ({})}; }});
  await assert.rejects(bad.polish({profile: [], roles: []}, 'm'), e => e.code === 'CV_POLISH_PROVIDER_FAILED');
  assert.equal(count, 1);
  assert.equal(createCvPolisher({apiKey: 'test-key', enabled: false}).available, false);
  assert.equal(createCvPolisher({apiKey: '', enabled: true}).available, false);
});

test('polish routes refuse cross-origin or missing-origin calls', async t => {
  const polisher = fakePolisher({summary: ['S'], keyAchievements: ['A'], employers: [], notes: ''});
  const server = createLocalServer({applicationReviewStore: reviewFixture(), cvTailoringService: service(polisher)});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections?.(); await new Promise(r => server.close(r)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, payload, origin) => fetch(base + '/api/reviews/r1/tailored-cv/' + path, {method: 'POST', headers: {'content-type': 'application/json', ...(origin ? {origin} : {})}, body: JSON.stringify(payload)});
  for (const origin of ['https://evil.test', null]) assert.equal((await post('polish/estimate', body, origin)).status, 403);
  const estimate = await (await post('polish/estimate', body, base)).json();
  assert.equal(estimate.ok, true);
  assert.equal((await post('polish', {...body, confirmedCostProof: estimate.costProof}, 'https://evil.test')).status, 403);
  assert.equal(polisher.calls.length, 0);
  const done = await (await post('polish', {...body, confirmedCostProof: estimate.costProof}, base)).json();
  assert.equal(done.ok, true);
  assert.equal(polisher.calls.length, 1);
});

test('before/after rows mark unchanged, reworded, added and removed lines', async () => {
  const {compareLines, CHANGE_LABELS} = await import('../../src/interfaces/http/tailored-cv-controls.js');
  assert.deepEqual(compareLines(['A', 'B', 'C'], ['A', 'B2']).map(r => r.status), ['unchanged', 'changed', 'removed']);
  assert.deepEqual(compareLines(['A'], ['A', 'New']).map(r => [r.before, r.after, r.status]), [['A', 'A', 'unchanged'], ['', 'New', 'added']]);
  assert.equal(CHANGE_LABELS.changed, 'Reworded');
});
