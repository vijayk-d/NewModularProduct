import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createCvTailoringService} from '../../src/application/cv-tailoring.js';
import {createCvTailoringStore} from '../../src/infrastructure/applications/sqlite-cv-tailoring-store.js';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {fakeWorker, reviewFixture, SHA} from '../fixtures/cv-tailoring-fixtures.js';

test('the service scores the whole CV before and after, using the wording on the page', async () => {
  const lines = ['Test Candidate', 'Profile', 'Delivery leader across programmes.', 'Key Achievements', 'Cut costs by 10% through vendor consolidation.', 'Led a 40-person Agile programme.', 'Skills', 'Budget control'];
  const base = fakeWorker([]);
  const worker = async payload => { const r = await base(payload); return payload.action === 'sections' ? {...r, sections: {...r.sections, lines}} : r; };
  const service = createCvTailoringService({reviews: reviewFixture(), store: createCvTailoringStore({filePath: ':memory:'}), worker, cvFolder: 'C:/cv', cvLibrary: async () => [{role_code: 'PM', local_path: 'PM/PM_CV.pdf'}]});
  // Job terms for 'Agile delivery and risk management.' are the phrases 'agile delivery' and 'risk management'.
  const body = {profile: ['Agile delivery leader across programmes.'], achievements: ['Introduced risk management for the board.', 'Cut costs by 10% through vendor consolidation.'], expectedSha256: SHA, expectedRoleCode: 'PM'};
  const r = await service.atsMatch('r1', body);
  assert.equal(r.wholeCv, true);
  assert.deepEqual(r.gained, ['agile delivery', 'risk management']);
  assert.deepEqual(r.lost, []);
  assert.equal(r.after.score, 100);
  assert.ok(r.before.score < r.after.score);
  const back = await service.atsMatch('r1', {...body, profile: ['Delivery leader across programmes.'], achievements: ['Cut costs by 10% through vendor consolidation.']});
  assert.deepEqual(back.workIn, [], 'agile and delivery appear apart in the CV, so the phrase is not claimed');
  assert.ok(back.noEvidence.includes('risk management'));
  await assert.rejects(service.atsMatch('r1', {...body, expectedSha256: 'b'.repeat(64)}), e => e.statusCode === 409);
});

test('the ATS route is local-only and makes no paid call', async t => {
  const service = createCvTailoringService({reviews: reviewFixture(), store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker([]), cvFolder: 'C:/cv', cvLibrary: async () => [{role_code: 'PM', local_path: 'PM/PM_CV.pdf'}]});
  const server = createLocalServer({applicationReviewStore: reviewFixture(), cvTailoringService: service});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections?.(); await new Promise(r => server.close(r)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = {profile: ['Delivery leader across programmes.'], achievements: ['Led a 40-person Agile programme.'], expectedSha256: SHA, expectedRoleCode: 'PM'};
  const post = origin => fetch(base + '/api/reviews/r1/tailored-cv/ats', {method: 'POST', headers: {'content-type': 'application/json', ...(origin ? {origin} : {})}, body: JSON.stringify(body)});
  assert.equal((await post('https://evil.test')).status, 403);
  const r = await (await post(base)).json();
  assert.equal(r.ok, true);
  assert.equal(r.wholeCv, false);
  assert.equal(r.total, 2);
});

test('a build returns the ATS match of exactly what was built', async () => {
  const service = createCvTailoringService({reviews: reviewFixture(), store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker([]), cvFolder: 'C:/cv', cvLibrary: async () => [{role_code: 'PM', local_path: 'PM/PM_CV.pdf'}]});
  const built = await service.build('r1', {profile: ['Delivery leader across programmes.'], achievements: ['Introduced risk management for the board.', 'Led Agile delivery for a 40-person programme.'], expectedSha256: SHA, expectedRoleCode: 'PM'});
  assert.equal(built.version, 1);
  assert.deepEqual(built.ats.after, {score: 100, matched: 2});
  assert.ok(built.ats.before.score < 100);
  assert.ok(Array.isArray(built.ats.eligibility));
});

