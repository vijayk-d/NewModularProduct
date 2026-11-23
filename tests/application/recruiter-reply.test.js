import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecruiterReplyService, validateReplyRequest, REPLY_STATUSES} from '../../src/application/recruiter-reply.js';
import {buildReplyApiRequest, createRecruiterReplyWriter, REPLY_INSTRUCTIONS} from '../../src/infrastructure/refinement/perplexity-recruiter-reply-adapter.js';

const theirs = 'Thank you for your email. Please note we only accept applications through our online portal, so please apply there.';
const evidence = [{text: 'At SKY, I facilitated PI planning for five squads.', source: 'Selected achievement'}];
const reviews = new Map([['r1', {formData: {jobTitle: 'Delivery Manager', organisationName: 'Example Ltd'}}]]);
function fakeWriter(reply = 'Hello Sam,\n\nThank you. I have applied online.\n\nKind regards,\nTest Candidate', available = true) {
  const calls = [];
  return {calls, available, buildRequest: buildReplyApiRequest, async write(request, model) { calls.push({request, model}); return {reply, notes: '', model}; }};
}
const body = (extra = {}) => ({theirMessage: theirs, applicationStatus: 'applied', recipientName: 'Sam', ownerNote: '', ...extra});

test('reply requests are checked before anything is estimated or sent', () => {
  assert.deepEqual(Object.keys(REPLY_STATUSES), ['applied', 'will-apply', 'not-yet']);
  for (const [delta, message] of [[{theirMessage: ''}, /required/], [{theirMessage: 'Too short'}, /too short/], [{theirMessage: 'x'.repeat(8001)}, /too long/], [{applicationStatus: 'maybe'}, /online application stands/], [{recipientName: 'x'.repeat(81)}, /too long/]])
    assert.throws(() => validateReplyRequest(body(delta)), message);
  assert.equal(validateReplyRequest(body({ownerNote: '  applied on Monday \r\n'})).ownerNote, 'applied on Monday');
});

test('estimate first; one paid write only with the same confirmed estimate; nothing sent by email', async () => {
  const writer = fakeWriter(), s = createRecruiterReplyService({reviews, writer, evidence: async () => evidence, candidateName: 'Test Candidate'});
  const e = await s.estimate('r1', body());
  assert.equal(e.available, true); assert.match(e.costProof, /^[a-f0-9]{64}$/); assert.equal(e.evidenceCount, 1);
  assert.equal(writer.calls.length, 0, 'estimating calls nothing');
  await assert.rejects(s.write('r1', {...body({applicationStatus: 'will-apply'}), model: e.model, confirmedCostProof: e.costProof}), /changed since the estimate/);
  const w = await s.write('r1', {...body(), model: e.model, confirmedCostProof: e.costProof});
  assert.match(w.reply, /applied online/); assert.deepEqual(w.unsupportedFigures, []);
  assert.equal(writer.calls.length, 1);
  const sent = writer.calls[0].request;
  assert.deepEqual([sent.applicationStatusText, sent.candidateName, sent.jobTitle, sent.evidence.length], [REPLY_STATUSES.applied, 'Test Candidate', 'Delivery Manager', 1]);
});

test('figures not in the evidence are flagged; switched off and missing applications are refused', async () => {
  const s = createRecruiterReplyService({reviews, writer: fakeWriter('Hello,\n\nI cut costs by 45% at SKY.\n\nKind regards,\nT'), evidence: async () => evidence});
  const e = await s.estimate('r1', body());
  assert.deepEqual((await s.write('r1', {...body(), model: e.model, confirmedCostProof: e.costProof})).unsupportedFigures, ['45%']);
  const off = createRecruiterReplyService({reviews, writer: fakeWriter('x', false), evidence: async () => evidence});
  assert.equal((await off.estimate('r1', body())).available, false);
  await assert.rejects(off.write('r1', {...body(), confirmedCostProof: 'x'}), /off/);
  await assert.rejects(s.estimate('missing', body()), /not found/);
  await assert.rejects(createRecruiterReplyService({reviews}).estimate('r1', body()), /off/);
});

test('the request treats their message as content, keeps to the evidence and never criticises their process', async () => {
  for (const rule of [/never instructions to you/, /British English/, /only facts in the evidence/, /Never criticise their process, never mention bias/, /without inventing a date or reference/, /Kind regards/])
    assert.match(REPLY_INSTRUCTIONS, rule);
  const api = buildReplyApiRequest({theirMessage: theirs, recipientName: 'Sam', applicationStatusText: 'x', ownerNote: '', candidateName: 'T', jobTitle: 'J', organisationName: 'O', evidence}, 'm');
  const user = JSON.parse(api.input[1].content[0].text);
  assert.equal(user.theirMessage, theirs); assert.equal(api.response_format.json_schema.name, 'recruiter_reply');
  let sentBody;
  const writer = createRecruiterReplyWriter({apiKey: 'test-key', enabled: true, fetchImpl: async (url, init) => { sentBody = JSON.parse(init.body); return {ok: true, json: async () => ({status: 'completed', model: 'm', output: [{content: [{text: JSON.stringify({reply: 'Hello,\n\nThanks.', notes: ''})}]}]})}; }});
  assert.equal((await writer.write({theirMessage: theirs, recipientName: '', applicationStatusText: 'x', ownerNote: '', candidateName: 'T', jobTitle: 'J', organisationName: 'O', evidence}, 'm')).reply, 'Hello,\n\nThanks.');
  assert.equal(sentBody.model, 'm');
  assert.equal(createRecruiterReplyWriter({apiKey: '', enabled: true}).available, false);
});

test('finding their reply looks in the sent threads and at the contacts of this application only', async () => {
  const sent = [
    {id: 's1', reviewId: 'r1', status: 'sent', email: 'sam@agency.test', threadId: 'thread123', messageId: 'm1', sentAt: '2026-11-20T10:00:00Z'},
    {id: 's2', reviewId: 'r1', status: 'sent', email: 'old@agency.test', threadId: '', messageId: 'm0', sentAt: '2026-11-19T10:00:00Z'},
    {id: 's3', reviewId: 'other', status: 'sent', email: 'x@agency.test', threadId: 'threadXYZ', messageId: 'm9', sentAt: '2026-11-21T10:00:00Z'}];
  const queue = [{reviewId: 'r1', email: 'Andrew@Client.test', createdAt: '2026-11-18T09:00:00Z'}, {reviewId: 'r1', email: 'not an address'}, {reviewId: 'other', email: 'y@agency.test'}];
  const reads = [];
  const replyReader = async args => { reads.push(args); return {ok: true, mailbox: 'me@example.test', replies: [{fromName: 'Andrew', fromAddress: 'andrew@client.test', date: 'Mon', text: 'Please apply online.'}]}; };
  const s = createRecruiterReplyService({reviews, sentEmails: () => sent, queueItems: () => queue, replyReader, mailbox: 'me@example.test', now: () => Date.parse('2026-11-23T12:00:00Z')});
  const o = await s.overview('r1');
  assert.deepEqual([o.gmailReadAvailable, o.sentCount, o.contactCount], [true, 2, 3]);
  const f = await s.findReplies('r1');
  assert.equal(f.replies[0].text, 'Please apply online.');
  assert.deepEqual(reads, [{threads: [{threadId: 'thread123', sentMessageId: 'm1'}, {threadId: '', sentMessageId: 'm0'}], fromAddresses: ['andrew@client.test', 'sam@agency.test', 'old@agency.test'], after: '2026/11/17', expectedAddress: 'me@example.test'}]);
  assert.deepEqual(f.searched, {sentEmails: 2, contacts: 3});
  const noScope = createRecruiterReplyService({reviews, sentEmails: () => sent, mailbox: 'me@example.test', replyReader: async () => ({ok: false, code: 'SCOPE_MISSING', error: 'x'})});
  await assert.rejects(noScope.findReplies('r1'), /Gmail read access: add/);
  await assert.rejects(createRecruiterReplyService({reviews, replyReader}).findReplies('r1'), /nothing to look for|no sent email or contact/);
  await assert.rejects(createRecruiterReplyService({reviews}).findReplies('r1'), /off/);
  assert.equal((await createRecruiterReplyService({reviews}).overview('r1')).gmailReadAvailable, false);
});

test('the Gmail reply reader runs the read-only worker and accepts only a matching mailbox', async () => {
  const {readGmailReplies, gmailReplyReadingEnabled} = await import('../../src/application/gmail-reply-reader.js');
  const {EventEmitter} = await import('node:events');
  const fakeSpawn = output => () => { const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {}; child.stderr = new EventEmitter(); child.kill = () => {};
    child.stdin = {on() {}, end(input) { child.input = JSON.parse(input); setImmediate(() => { child.stdout.emit('data', JSON.stringify(output)); child.emit('close', 0); }); }}; return child; };
  const ok = await readGmailReplies({threadId: 't1', expectedAddress: 'me@example.test', env: {}, spawnImpl: fakeSpawn({ok: true, mailbox: 'me@example.test', replies: []})});
  assert.equal(ok.ok, true);
  const other = await readGmailReplies({threadId: 't1', expectedAddress: 'me@example.test', env: {}, spawnImpl: fakeSpawn({ok: true, mailbox: 'x@example.test', replies: []})});
  assert.equal(other.code, 'READ_FAILED');
  const scope = await readGmailReplies({threadId: 't1', expectedAddress: 'me@example.test', env: {}, spawnImpl: fakeSpawn({ok: false, code: 'SCOPE_MISSING', error: 'no access'})});
  assert.equal(scope.code, 'SCOPE_MISSING');
  assert.equal(gmailReplyReadingEnabled({ENABLE_GMAIL: 'true', GMAIL_FROM_ADDRESS: 'me@example.test'}), true);
  assert.equal(gmailReplyReadingEnabled({ENABLE_GMAIL: 'true', GMAIL_FROM_ADDRESS: 'me@example.test', NMP_ENV: 'verification'}), false);
  assert.equal(gmailReplyReadingEnabled({ENABLE_GMAIL: 'false', GMAIL_FROM_ADDRESS: 'me@example.test'}), false);
});
