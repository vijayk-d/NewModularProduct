import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplyThreadsStore} from '../../src/infrastructure/applications/sqlite-reply-threads-store.js';
import {createRecruiterReplyService, createReplyDraftPreparer} from '../../src/application/recruiter-reply.js';
import {createLinkTracker} from '../../src/application/link-tracking.js';
import {createMemoryLinkTrackingStore} from '../../src/infrastructure/link-tracking-file.js';
import {SIGNATURE_SEPARATOR, SIGNATURE_MARKER} from '../../src/domain/outreach/tracked-links.js';

// Synthetic keys, people and addresses only. No network: the signature reader and Gmail writer are fakes.
const BASE = 'https://jobapp-links.example.workers.dev';
const ADVERT = 'https://www.linkedin.com/jobs/view/4123456789/';
const trackEnv = {ENABLE_LINK_TRACKING: 'true', LINK_TRACKING_BASE_URL: BASE, LINK_TRACKING_SIGNING_KEY: 'test-signing-key-0123456789abcdef0123456789', LINK_TRACKING_PROFILE_URL: 'https://www.linkedin.com/in/test-candidate/'};
const sigEnv = {ENABLE_GMAIL_SIGNATURE: 'true'};
const signatureReader = async ({expectedAddress}) => ({ok: true, mailbox: expectedAddress, plainText: 'Test Candidate\nhttps://www.linkedin.com/in/test-candidate/', html: '<b>Test Candidate</b> <a href="https://www.linkedin.com/in/test-candidate/">LinkedIn</a>'});
const REPLY = {messageId: 'm2', threadId: 't1', fromName: 'Sam Recruiter', fromAddress: 'sam@agency.test', subject: 'Re: Application', date: 'Mon, 23 Nov 2026', internalDate: 2, text: 'Please apply online.'};

function setup({env, linkTracker = null}) {
  const store = createReplyThreadsStore({filePath: ':memory:'}), calls = [];
  store.addFound('r1', [REPLY]);
  const reviews = new Map([['r1', {formData: {jobAdvertLink: ADVERT}}]]);
  const draftWriter = async args => { calls.push(args); return {ok: true, draftId: args.draftId || 'd-new', updated: Boolean(args.draftId), subject: 'Re: Application'}; };
  const prepareDraft = createReplyDraftPreparer({mailbox: 'me@example.test', env, signatureReader, linkTracker});
  return {store, calls, s: createRecruiterReplyService({reviews, replyStore: store, draftWriter, prepareDraft, mailbox: 'me@example.test'})};
}
const body = {messageId: 'm2', bodyPlainText: 'Hello Sam,\n\nI have applied: ' + ADVERT + '\n\nKind regards'};

test('the Gmail reply draft gets your Gmail signature; the saved local copy stays as you wrote it', async () => {
  const {s, calls, store} = setup({env: sigEnv});
  const out = await s.createGmailDraft('r1', body);
  assert.ok(calls[0].bodyPlainText.includes(SIGNATURE_SEPARATOR + 'Test Candidate'));
  assert.ok(calls[0].bodyHtml.includes(SIGNATURE_MARKER) && calls[0].bodyHtml.includes('<b>Test Candidate</b>'));
  assert.deepEqual([out.signed, out.linksTracked], [true, false]);
  assert.ok(!store.get('r1', 'm2').draftText.includes('Test Candidate'), 'no signature in the local draft, so drafting again never doubles it');
  await s.createGmailDraft('r1', body);
  assert.equal(calls[1].bodyPlainText.split(SIGNATURE_SEPARATOR).length, 2, 'one signature after updating the draft');
});

test('with link tracking on, advert and profile links become tracked links with the footnote, filed under the application', async () => {
  const linkStore = createMemoryLinkTrackingStore();
  const linkTracker = createLinkTracker({env: trackEnv, store: linkStore});
  const {s, calls} = setup({env: {...sigEnv, ...trackEnv}, linkTracker});
  const out = await s.createGmailDraft('r1', body);
  assert.equal(out.linksTracked, true);
  assert.ok(!calls[0].bodyPlainText.includes(ADVERT) && calls[0].bodyPlainText.includes(BASE + '/c/'));
  assert.ok(calls[0].bodyHtml.includes('color:#9ca3af'), 'the disclosure footnote is added');
  const links = linkTracker.links();
  assert.deepEqual(links.map(l => [l.queueId, l.reviewId, l.email, l.linkKey]).sort(), [['reply-m2', 'r1', 'sam@agency.test', 'a-4123456789'], ['reply-m2', 'r1', 'sam@agency.test', 'p']]);
  await s.createGmailDraft('r1', body);
  assert.equal(linkTracker.links().length, 2, 'drafting again reuses the same link ids');
  assert.equal(calls[1].bodyPlainText, calls[0].bodyPlainText);
});

test('without a signature nothing is tracked, opted-out people are never tracked, and a signature failure makes no draft', async () => {
  const linkTracker = createLinkTracker({env: trackEnv, store: createMemoryLinkTrackingStore()});
  const unsigned = setup({env: trackEnv, linkTracker});
  const out = await unsigned.s.createGmailDraft('r1', body);
  assert.deepEqual([out.signed, out.linksTracked], [false, false]);
  assert.ok(unsigned.calls[0].bodyPlainText.includes(ADVERT), 'no signature: links and text stay unchanged');

  const optedOut = createLinkTracker({env: trackEnv, store: createMemoryLinkTrackingStore()});
  optedOut.setOptOut('@agency.test');
  const opted = setup({env: {...sigEnv, ...trackEnv}, linkTracker: optedOut});
  assert.equal((await opted.s.createGmailDraft('r1', body)).linksTracked, false);

  const store = createReplyThreadsStore({filePath: ':memory:'}), calls = [];
  store.addFound('r1', [REPLY]);
  const broken = createRecruiterReplyService({reviews: new Map([['r1', {formData: {}}]]), replyStore: store, mailbox: 'me@example.test',
    draftWriter: async a => { calls.push(a); return {ok: true, draftId: 'd'}; },
    prepareDraft: createReplyDraftPreparer({mailbox: 'me@example.test', env: sigEnv, signatureReader: async () => { throw new Error('timeout'); }})});
  await assert.rejects(broken.createGmailDraft('r1', body), /signature could not be read\. No Gmail draft was made/);
  assert.equal(calls.length, 0);
});
