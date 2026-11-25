import test from 'node:test';
import assert from 'node:assert/strict';
import {detectTopics, ownPart, responsePatterns, RESPONSE_TOPICS} from '../../src/domain/replies/recruiter-response-topics.js';
import {createRecruiterReplyService, replyTopics} from '../../src/application/recruiter-reply.js';
import {createReplyThreadsStore} from '../../src/infrastructure/applications/sqlite-reply-threads-store.js';
import {buildReplyApiRequest, REPLY_INSTRUCTIONS} from '../../src/infrastructure/refinement/perplexity-recruiter-reply-adapter.js';

test('a recruiter reply is read for what it asks, not only "apply online"', () => {
  assert.deepEqual(detectTopics('Thanks. Before I share your profile, what are your salary expectations and notice period?'), ['salary', 'notice']);
  assert.deepEqual(detectTopics('Please apply online via our careers page so we can consider you.'), ['apply-online']);
  assert.deepEqual(detectTopics('Are you free for a quick call on Teams tomorrow? Also, do you need visa sponsorship?'), ['right-to-work', 'call']);
  assert.deepEqual(detectTopics('Unfortunately the position has been filled. We will keep your details on file.'), ['not-progressing']);
  assert.deepEqual(detectTopics('The role is hybrid, three days a week in the London office. Could you send an updated CV?'), ['location', 'cv']);
  assert.deepEqual(detectTopics('Thanks, I have passed your details to the hiring manager and will be in touch.'), ['forwarded']);
  assert.deepEqual(detectTopics(''), []);
});

test('quoted earlier messages are not read as theirs', () => {
  const msg = 'Thanks, received.\n\nOn Mon, 23 Nov 2026 at 10:00, Test Candidate wrote:\n> My salary expectation is flexible and I can start on short notice.';
  assert.equal(ownPart(msg).trim(), 'Thanks, received.');
  assert.deepEqual(detectTopics(msg), []);
  assert.deepEqual(detectTopics('Noted.\n> Please apply online'), []);
});

test('patterns across saved replies count each topic once per reply, most frequent first', () => {
  const p = responsePatterns(['Please apply online.', 'What is your salary expectation? Please also apply online.', 'Unfortunately we will not be progressing.', '', 'Thanks!']);
  assert.equal(p.total, 4);
  assert.deepEqual(p.topics.map(t => [t.id, t.count]), [['apply-online', 2], ['salary', 1], ['not-progressing', 1]]);
});

test('topics sent for a reply are known ones only, once each, with your answer kept as typed', () => {
  assert.deepEqual(replyTopics([{id: 'salary', answer: ' £80,000 base '}, {id: 'salary', answer: 'x'}, {id: 'nonsense'}, {id: 'call'}]), [{id: 'salary', answer: '£80,000 base'}, {id: 'call', answer: ''}]);
  assert.deepEqual(replyTopics(undefined), []);
  assert.throws(() => replyTopics('salary'), /must be a list/);
  assert.throws(() => replyTopics([{id: 'salary', answer: 'x'.repeat(301)}]), /too long/);
});

test('the writer is told to answer each topic from your answer, and the overview summarises past replies', async () => {
  const store = createReplyThreadsStore({filePath: ':memory:'});
  store.addFound('r1', [{messageId: 'a', text: 'What are your salary expectations?'}]);
  store.addFound('r2', [{messageId: 'b', text: 'Please apply online.'}, {messageId: 'c', text: 'Could you share your salary expectation and notice period?'}]);
  const calls = [];
  const writer = {available: true, buildRequest: buildReplyApiRequest, async write(request, model) { calls.push(request); return {reply: 'Hello,\n\nThanks.\n\nKind regards,\nT', notes: '', model}; }};
  const reviews = new Map([['r1', {formData: {jobTitle: 'Delivery Manager', organisationName: 'Example Ltd'}}]]);
  const s = createRecruiterReplyService({reviews, writer, replyStore: store, evidence: async () => []});
  const o = await s.overview('r1');
  assert.equal(o.topics.length, RESPONSE_TOPICS.length);
  assert.deepEqual([o.patterns.total, o.patterns.topics[0]], [3, {id: 'salary', label: 'Salary or rate expectation', count: 2}]);
  assert.deepEqual((await s.topics('r1', {theirMessage: 'Your notice period please?'})).topics, ['notice']);
  const body = {theirMessage: 'What are your salary expectations for this role?', applicationStatus: 'none', topics: [{id: 'salary', answer: '£80,000 base'}], ownerNote: 'I am flexible for the right role.'};
  const e = await s.estimate('r1', body);
  await s.write('r1', {...body, model: e.model, confirmedCostProof: e.costProof});
  assert.deepEqual(calls[0].topics, [{topic: 'Salary or rate expectation', yourAnswer: '£80,000 base'}]);
  const user = JSON.parse(buildReplyApiRequest(calls[0], 'm').input[1].content[0].text);
  assert.deepEqual([user.topics, user.ownerNote], [[{topic: 'Salary or rate expectation', yourAnswer: '£80,000 base'}], 'I am flexible for the right role.']);
  for (const rule of [/using yourAnswer exactly/, /will confirm it shortly/, /do not mention the online application/, /candidate’s own message/, /do not argue or re-pitch/]) assert.match(REPLY_INSTRUCTIONS, rule);
  assert.notEqual((await s.estimate('r1', {...body, topics: [{id: 'salary', answer: '£90,000'}]})).costProof, e.costProof, 'a changed answer needs a new estimate');
});

test('replies move the Outcome forward only, once per reply, with who replied and what they asked', async () => {
  const {createApplicationInsightsStore} = await import('../../src/infrastructure/applications/sqlite-application-insights-store.js');
  const {replyMovesOutcome, replyOutcomeId} = await import('../../src/domain/insights/application-outcome.js');
  assert.equal(replyOutcomeId(['salary']), 'recruiter_replied');
  assert.equal(replyOutcomeId(['apply-online', 'not-progressing']), 'rejected');
  assert.equal(replyMovesOutcome(null, 'recruiter_replied'), true);
  assert.equal(replyMovesOutcome({outcome: 'no_reply'}, 'recruiter_replied'), true);
  assert.equal(replyMovesOutcome({outcome: 'recruiter_replied'}, 'rejected'), true);
  assert.equal(replyMovesOutcome({outcome: 'recruiter_replied'}, 'recruiter_replied'), false);
  assert.equal(replyMovesOutcome({outcome: 'interview'}, 'rejected'), false);

  const outcomes = createApplicationInsightsStore({filePath: ':memory:'}), store = createReplyThreadsStore({filePath: ':memory:'});
  const now = Date.parse('2026-11-25T12:00:00Z'); let replies = [], changed = 0;
  const reviews = new Map([['r1', {formData: {jobTitle: 'Delivery Manager'}}]]);
  const calls = [];
  const writer = {available: true, buildRequest: buildReplyApiRequest, async write(request, model) { calls.push(request); return {reply: 'Hello,\n\nThanks.', notes: '', model}; }};
  const s = createRecruiterReplyService({reviews, writer, replyStore: store, outcomes, onOutcome: () => changed++, now: () => now, evidence: async () => [],
    sentEmails: () => [{reviewId: 'r1', status: 'sent', email: 'sam@agency.test', threadId: 't1', messageId: 'm0', sentAt: '2026-11-20T10:00:00Z'}],
    replyReader: async () => ({ok: true, replies})});
  replies = [{messageId: 'a', fromName: 'Sam Recruiter', internalDate: Date.parse('2026-11-23T09:00:00Z'), text: 'Thanks. What are your salary expectations?'}];
  const first = await s.findReplies('r1');
  assert.deepEqual(first.outcome, {outcome: 'recruiter_replied', label: 'Recruiter replied', occurredOn: '2026-11-23'});
  assert.equal(outcomes.history('r1')[0].note, 'Reply assistant: Sam Recruiter replied (Salary or rate expectation)');
  assert.equal((await s.findReplies('r1')).outcome, null, 'finding the same reply again records nothing');
  replies = [...replies, {messageId: 'b', fromName: 'Sam Recruiter', internalDate: Date.parse('2026-11-24T09:00:00Z'), text: 'Unfortunately we will not be progressing your application.'}];
  assert.equal((await s.findReplies('r1')).outcome.outcome, 'rejected');
  assert.deepEqual(outcomes.history('r1').map(e => e.outcome), ['recruiter_replied', 'rejected']);
  assert.equal(changed, 2);
  // A pasted reply updates the Outcome when the reply is written; a Gmail one (messageId) does not do it twice.
  const pasted = {theirMessage: 'Thanks for your note, could we arrange a call on Teams?', applicationStatus: 'none'};
  reviews.set('r2', {formData: {jobTitle: 'PM'}});
  const e = await s.estimate('r2', pasted);
  assert.equal((await s.write('r2', {...pasted, model: e.model, confirmedCostProof: e.costProof})).outcome.occurredOn, '2026-11-25');
  const e2 = await s.estimate('r1', pasted);
  assert.equal((await s.write('r1', {...pasted, messageId: 'a', model: e2.model, confirmedCostProof: e2.costProof})).outcome, null);
});
