import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {countWords, countCharacters, validateQuestion, draftAnswer, checkAnswer, trimToLimit, questionTerms} from '../../src/domain/questions/answer-policy.js';
import {createApplicationQuestionsService} from '../../src/application/application-questions.js';
import {createApplicationAnswersStore} from '../../src/infrastructure/applications/sqlite-application-answers-store.js';
import {buildAnswerApiRequest} from '../../src/infrastructure/refinement/perplexity-question-answer-adapter.js';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

const evidence = [
  {text: 'At SKY, I facilitated PI planning for five distributed squads.', source: 'Tailored CV bullet'},
  {text: 'At ARABIA INSURANCE, I cut fraud losses by 18% with an AI fraud-detection MVP', source: 'Selected achievement'},
  {text: 'At BP, I built in-house Agile and OKR capability.', source: 'Tailored CV bullet'}
];

test('words and characters are counted the way portals count them', () => {
  assert.equal(countWords('  Led   delivery\nacross teams. '), 4);
  assert.equal(countCharacters(' Led delivery. '), 13);
  assert.deepEqual(validateQuestion({question: '  Describe a time you managed risk.  ', unit: 'characters', limit: '500'}), {question: 'Describe a time you managed risk.', unit: 'characters', limit: 500});
  for (const bad of [{question: 'Hi', limit: 100}, {question: 'Describe risk.', unit: 'lines', limit: 100}, {question: 'Describe risk.', unit: 'words', limit: 5}, {question: 'Describe risk.', unit: 'words', limit: 2.5}]) assert.throws(() => validateQuestion(bad), e => e.statusCode === 400);
  assert.ok(!questionTerms('Tell us about a time you improved fraud detection').includes('about'));
});

test('the free draft uses only evidence lines, best match first, in whole sentences within the limit', () => {
  const d = draftAnswer({question: 'Give an example of reducing fraud losses with AI.', evidence, unit: 'words', limit: 25});
  assert.equal(d.used[0].source, 'Selected achievement');
  assert.ok(d.answer.startsWith('At ARABIA INSURANCE, I cut fraud losses by 18% with an AI fraud-detection MVP.'));
  assert.ok(countWords(d.answer) <= 25);
  for (const sentence of d.answer.split(/(?<=\.)\s/)) assert.ok(evidence.some(e => sentence.startsWith(e.text.replace(/\.$/, ''))), 'never invents: ' + sentence);
  const tiny = draftAnswer({question: 'Fraud?', evidence, unit: 'characters', limit: 50});
  assert.equal(tiny.answer, '', 'no sentence is cut to fit');
});

test('the check flags figures not in the evidence, and trimming keeps whole sentences', () => {
  const c = checkAnswer({answer: 'I cut fraud losses by 18% and saved £3M.', unit: 'words', limit: 5, evidence});
  assert.equal(c.within, false);
  assert.deepEqual(c.unsupportedFigures, ['£3m']);
  assert.equal(trimToLimit('One two three. Four five six. Seven.', 'words', 6), 'One two three. Four five six.');
});

function service({writer = null} = {}) {
  const reviews = reviewFixture(), store = createApplicationAnswersStore({filePath: ':memory:'});
  return {store, s: createApplicationQuestionsService({reviews, store, writer,
    tailoredLatest: () => ({profile: ['Agile delivery leader.'], achievements: {achievements: null, roles: [['At SKY, I facilitated PI planning for five distributed squads.']]}}),
    scenarioEvidence: () => [{text: 'I resolved a programme risk by re-planning the release train.', source: 'Approved scenario (ACME)'}]})};
}

test('evidence comes from selected achievements, the tailored CV and approved scenarios; answers are saved and removed', async () => {
  const {s} = service();
  const o = await s.overview('r1');
  assert.equal(o.evidenceCount, 4);
  assert.deepEqual(o.sources, ['Selected achievement', 'Tailored CV summary', 'Tailored CV bullet', 'Approved scenario (ACME)']);
  const d = await s.draft('r1', {question: 'Describe how you managed a programme risk.', unit: 'words', limit: 60});
  assert.match(d.answer, /re-planning the release train/);
  const saved = await s.save('r1', {question: 'Describe risk.', unit: 'words', limit: 60, answer: d.answer, origin: 'evidence'});
  assert.equal((await s.overview('r1')).saved.length, 1);
  assert.deepEqual(s.remove('r1', saved.id), []);
  await assert.rejects(s.save('r1', {question: 'Describe risk.', unit: 'words', limit: 60, answer: '  '}), /Write or draft/);
});

test('writing with AI needs the confirmed estimate, makes one request and checks the result', async () => {
  const calls = [];
  const writer = {available: true, buildRequest: buildAnswerApiRequest, write: async (request, model) => { calls.push({request, model}); return {answer: 'I re-planned the release train, saving £9M.', notes: '', model}; }};
  const {s} = service({writer});
  const body = {question: 'Describe how you managed a programme risk.', unit: 'words', limit: 100};
  const e = await s.estimate('r1', body);
  assert.equal(calls.length, 0, 'estimating sends nothing');
  await assert.rejects(s.write('r1', {...body, confirmedCostProof: 'stale'}), e => e.code === 'ANSWER_ESTIMATE_STALE');
  const w = await s.write('r1', {...body, model: e.model, confirmedCostProof: e.costProof});
  assert.equal(calls.length, 1);
  assert.deepEqual(w.check.unsupportedFigures, ['£9m']);
  const sent = JSON.stringify(calls[0].request);
  assert.ok(sent.includes('release train') && !sent.includes('PERPLEXITY'));
});

test('with AI off the estimate says how to switch it on, and the routes work through the local server', async t => {
  const {s} = service({writer: {available: false, buildRequest: buildAnswerApiRequest}});
  assert.match((await s.estimate('r1', {question: 'Describe risk management.', unit: 'words', limit: 100})).message, /ENABLE_COVER_LETTER_REFINEMENT/);
  const reviews = reviewFixture(), answersStore = createApplicationAnswersStore({filePath: ':memory:'});
  const server = createLocalServer({applicationReviewStore: reviews, answersStore, recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const api = 'http://127.0.0.1:' + server.address().port + '/api/reviews/r1/questions';
  const post = (path, body) => fetch(api + path, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  assert.equal((await (await fetch(api)).json()).evidenceCount, 1);
  const d = await (await post('/draft', {question: 'How did you introduce risk reporting?', unit: 'words', limit: 50})).json();
  assert.equal(d.answer, 'Introduced risk reporting for the board.');
  assert.equal((await post('/write', {question: 'How did you introduce risk reporting?', unit: 'words', limit: 50})).status, 503);
  assert.equal((await post('/save', {question: 'How?', unit: 'words', limit: 50, answer: 'x'})).status, 400);
  assert.equal((await fetch(api, {method: 'POST', headers: {'content-type': 'application/json', origin: 'https://evil.test'}, body: '{}'})).status, 403);
});
