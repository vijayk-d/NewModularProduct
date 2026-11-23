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
