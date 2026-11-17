import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createCvTailoringService, wordPathFor} from '../../src/application/cv-tailoring.js';
import {createCvTailoringStore} from '../../src/infrastructure/applications/sqlite-cv-tailoring-store.js';
import {createCvTailoringHandler} from '../../src/interfaces/http/cv-tailoring-http.js';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {fakeWorker, reviewFixture, SHA} from '../fixtures/cv-tailoring-fixtures.js';

const library = async () => [{role_code: 'PM', local_path: 'PM/PM_CV.pdf'}];

test('word path is the DOCX next to the library PDF', () => {
  assert.equal(wordPathFor('PM/PM_CV.pdf'), 'PM/PM_CV.docx');
  assert.equal(wordPathFor('PM/PM_CV.DOCX'), 'PM/PM_CV.DOCX');
  assert.equal(wordPathFor('PM/notes.txt'), '');
});

test('draft, check and build new versions without touching the base CV', async () => {
  const calls = [], store = createCvTailoringStore({filePath: ':memory:'});
  const service = createCvTailoringService({reviews: reviewFixture(), store, worker: fakeWorker(calls), cvFolder: 'C:/cv', cvLibrary: library});
  const draft = await service.draft('r1');
  assert.equal(draft.ready, true);
  assert.equal(draft.roleCode, 'PM');
  assert.equal(draft.achievements[0].text, 'Introduced risk reporting for the board.');
  assert.deepEqual(calls[0], {root: 'C:/cv', action: 'sections', relativePath: 'PM/PM_CV.docx', expectedHash: null});

  const request = {profile: ['Delivery leader for Agile programmes.'], achievements: ['Cut costs by 10% through vendor consolidation.'], expectedSha256: SHA, expectedRoleCode: 'PM'};
  await assert.rejects(service.build('r1', {...request, achievements: ['Cut costs by 30%.']}), e => e.statusCode === 400 && /30%/.test(e.message));
  await assert.rejects(service.build('r1', {...request, expectedSha256: 'b'.repeat(64)}), e => e.statusCode === 409);
  await assert.rejects(service.build('r1', {...request, expectedRoleCode: 'DM'}), e => e.statusCode === 409);
  const v1 = await service.build('r1', request);
  const v2 = await service.build('r1', request);
  assert.deepEqual([v1.version, v2.version], [1, 2]);
  assert.equal(calls.filter(c => c.action === 'tailor').at(-1).expectedHash, SHA, 'build pins the checked file');
  assert.equal(service.latest('r1').version, 2);
  assert.match(service.file('r1', 1).bytes.toString(), /^PK/);
  assert.ok(calls.every(c => ['sections', 'tailor'].includes(c.action)), 'no write action exists');
});

test('a CV without recognisable sections is reported, not built', async () => {
  const service = createCvTailoringService({reviews: reviewFixture(), store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker([], {sections: {profile: null, achievements: null}}), cvFolder: 'C:/cv', cvLibrary: library});
  const draft = await service.draft('r1');
  assert.equal(draft.ready, false);
  assert.match(draft.message, /Profile/);
  await assert.rejects(service.build('r1', {profile: ['a'], achievements: ['b'], expectedSha256: SHA, expectedRoleCode: 'PM'}), e => e.statusCode === 409);
});

const customCv = payload => payload.profileHeading === 'About My Work' && payload.achievementsHeading === 'Impact Delivered'
  ? {headings: ['About My Work', 'Impact Delivered'], profile: {heading: 'About My Work', paragraphs: ['Custom profile.'], bullets: 0, supported: true}, achievements: {heading: 'Impact Delivered', paragraphs: ['Led a 40-person Agile programme.'], bullets: 1, supported: true}}
  : {headings: ['About My Work', 'Impact Delivered'], profile: null, achievements: {heading: 'Achievements', paragraphs: [], bullets: 0, supported: false}};

test('unrecognised headings are listed, and chosen headings are used for draft and build', async () => {
  const calls = [];
  const service = createCvTailoringService({reviews: reviewFixture(), store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker(calls, {sections: customCv}), cvFolder: 'C:/cv', cvLibrary: library});
  const first = await service.draft('r1');
  assert.equal(first.ready, false);
  assert.deepEqual(first.headings, ['About My Work', 'Impact Delivered']);
  assert.match(first.message, /No Profile or Summary heading was recognised\. Found "Achievements" but no text directly under it/);
  const chosen = {profileHeading: ' About My Work ', achievementsHeading: 'Impact Delivered'};
  const second = await service.draft('r1', chosen);
  assert.equal(second.ready, true);
  assert.deepEqual(second.chosen, {profileHeading: 'About My Work', achievementsHeading: 'Impact Delivered'});
  await service.build('r1', {profile: ['P.'], achievements: ['Led a 40-person Agile programme.'], expectedSha256: SHA, expectedRoleCode: 'PM', ...chosen});
  assert.equal(calls.at(-1).action, 'tailor');
  assert.equal(calls.at(-1).profileHeading, 'About My Work');
  await assert.rejects(service.draft('r1', {profileHeading: 'Same', achievementsHeading: 'same'}), /two different headings/);
  await assert.rejects(service.draft('r1', {profileHeading: 'x'.repeat(81)}), /80 characters/);
});

const experienceCv = {headings: ['SUMMARY', 'EXPERIENCE'], profile: {heading: 'SUMMARY', paragraphs: ['Agile delivery leader.'], bullets: 0, supported: true}, achievements: null,
  experience: {heading: 'EXPERIENCE', supported: true, roles: [
    {title: 'ACME BANK — Delivery Lead', bullets: ['Built a CoE.', 'Cut risk incidents by 30% through agile risk reviews.']},
    {title: 'OTHER CO — Scrum Master', bullets: ['Coached 5 teams.']}]}};

test('a CV with Summary and Experience: bullets ranked within each employer, figures stay with their employer', async () => {
  const calls = [];
  const service = createCvTailoringService({reviews: reviewFixture(), store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker(calls, {sections: experienceCv}), cvFolder: 'C:/cv', cvLibrary: library});
  const draft = await service.draft('r1');
  assert.equal(draft.ready, true);
  assert.equal(draft.achievements, null);
  assert.deepEqual(draft.roles.map(r => r.title), ['ACME BANK — Delivery Lead', 'OTHER CO — Scrum Master']);
  assert.equal(draft.roles[0].bullets[0].text, 'Cut risk incidents by 30% through agile risk reviews.', 'most relevant first within the employer');
  const request = {profile: ['Agile delivery leader.'], roles: [['Cut risk incidents by 30% through agile risk reviews.', 'Built a CoE.'], ['Coached 5 teams.']], expectedSha256: SHA, expectedRoleCode: 'PM'};
  await assert.rejects(service.build('r1', {...request, roles: [['Built a CoE.'], ['Coached teams, cutting incidents by 30%.']]}), e => e.statusCode === 400 && /OTHER CO — Scrum Master: figures 30%/.test(e.message));
  await assert.rejects(service.build('r1', {...request, roles: [['Built a CoE.']]}), /employers in your CV changed/);
  await assert.rejects(service.build('r1', {...request, roles: [['Built a CoE.'], []]}), /needs at least one line/);
  const built = await service.build('r1', request);
  assert.equal(built.version, 1);
  const call = calls.at(-1);
  assert.deepEqual(call.roles, request.roles);
  assert.equal('achievements' in call, false);
  assert.deepEqual(service.latest('r1').achievements.roles, request.roles);
});

test('a missing Word file is named, with the folder it was expected in', async () => {
  const worker = async () => { throw Object.assign(new Error('x'), {code: 'CV_FILE_NOT_FOUND'}); };
  const service = createCvTailoringService({reviews: reviewFixture(), store: createCvTailoringStore({filePath: ':memory:'}), worker, cvFolder: 'C:/cv',
    cvLibrary: async () => [{role_code: 'PM', local_path: 'Enterprise_Lead-Public Sector/Example CV (Public Sector) .pdf'}]});
  await assert.rejects(service.draft('r1'), e => e.statusCode === 409 && e.code === 'CV_FILE_NOT_FOUND'
    && e.message.includes('No Word file named "Example CV (Public Sector) .docx" was found in "Enterprise_Lead-Public Sector"'));
});

test('the store refuses an unrecognised database', () => {
  assert.throws(() => createCvTailoringStore({}), /path required/);
});

test('HTTP routes draft, build and download through the local server', async t => {
  const reviews = reviewFixture();
  const service = createCvTailoringService({reviews, store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker(), cvFolder: 'C:/cv', cvLibrary: library});
  const server = createLocalServer({applicationReviewStore: reviews, cvTailoringService: service, candidateDisplayName: 'Test Candidate',
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const url = base + '/api/reviews/r1/tailored-cv';
  const draft = await (await fetch(url)).json();
  assert.equal(draft.ok, true);
  const post = body => fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  assert.equal((await post({profile: ['P.'], achievements: ['Saved £9M.'], expectedSha256: draft.baseSha256, expectedRoleCode: 'PM'})).status, 400);
  const built = await (await post({profile: ['P.'], achievements: ['Led a 40-person Agile programme.'], expectedSha256: draft.baseSha256, expectedRoleCode: 'PM'})).json();
  assert.equal(built.tailored.version, 1);
  const file = await fetch(url + '/1.docx');
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-disposition'), /Test_Candidate_Delivery_Manager_CV\.docx/);
  assert.equal((await fetch(url + '/9.docx')).status, 404);
  assert.equal((await fetch(url, {headers: {origin: 'https://evil.test'}})).status, 403);
  assert.match(await (await fetch(base + '/tailored-cv-controls.js')).text(), /attachTailoredCvControls/);
});

test('the handler reports a disabled feature clearly', async () => {
  let sent;
  const handler = createCvTailoringHandler({service: null, sendJson: (res, status, body) => { sent = {status, body}; }, sendText() {}});
  assert.equal(await handler({method: 'GET', headers: {host: 'x'}}, {}, new URL('http://x/api/reviews/r1/tailored-cv')), true);
  assert.equal(sent.status, 503);
});
