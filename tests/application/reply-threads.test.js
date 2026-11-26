import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplyThreadsStore} from '../../src/infrastructure/applications/sqlite-reply-threads-store.js';
import {createRecruiterReplyService} from '../../src/application/recruiter-reply.js';

const REPLIES = [
  {messageId: 'm9', threadId: 't2', fromName: 'Andrew Smith', fromAddress: 'andrew@client.test', subject: 'Re: Application', date: 'Tue, 24 Nov 2026', internalDate: 9, text: 'Not involved, sorry.'},
  {messageId: 'm2', threadId: 't1', fromName: 'Sam Recruiter', fromAddress: 'sam@agency.test', subject: 'Re: Application', date: 'Mon, 23 Nov 2026', internalDate: 2, text: 'Please apply online.'}];

test('the store keeps each reply once, newest first, and never loses a saved draft when replies are found again', () => {
  const s = createReplyThreadsStore({filePath: ':memory:', clock: () => '2026-11-24T10:00:00Z'});
  s.addFound('r1', REPLIES);
  assert.deepEqual(s.list('r1').map(r => [r.messageId, r.status]), [['m9', 'new'], ['m2', 'new']]);
  s.saveDraft('r1', 'm2', {draftText: 'Hello Sam', draftHtml: '<p>Hello Sam</p>', recipientName: 'Sam', applicationStatus: 'applied', ownerNote: ''});
  s.addFound('r1', [{...REPLIES[1], text: 'changed'}]);
  const sam = s.get('r1', 'm2');
  assert.deepEqual([sam.status, sam.draftText, sam.text], ['drafted', 'Hello Sam', 'Please apply online.']);
  s.markGmailDraft('r1', 'm2', 'd-1');
  s.saveDraft('r1', 'm2', {draftText: 'Hello Sam, edited'});
  assert.deepEqual([s.get('r1', 'm2').status, s.get('r1', 'm2').gmailDraftId], ['in_gmail', 'd-1'], 'editing keeps the Gmail draft link');
  assert.equal(s.saveDraft('r1', 'missing', {draftText: 'x'}), null);
  assert.deepEqual(s.list('other'), []);
});

test('each reply gets its own Gmail draft; a second click updates that draft instead of creating another', async () => {
  const store = createReplyThreadsStore({filePath: ':memory:'}), calls = [], logged = [];
  const reviews = new Map([['r1', {formData: {}}]]);
  const draftWriter = async args => { calls.push(args); return {ok: true, draftId: args.draftId || 'd-new', updated: Boolean(args.draftId), subject: 'Re: Application'}; };
  const s = createRecruiterReplyService({reviews, replyStore: store, draftWriter, mailbox: 'me@example.test', log: line => logged.push(line), replyReader: async () => ({ok: true, mailbox: 'me@example.test', replies: REPLIES}), sentEmails: () => [{reviewId: 'r1', status: 'sent', email: 'sam@agency.test', threadId: 't1', messageId: 'm1'}]});
  const found = await s.findReplies('r1');
  assert.deepEqual(found.replies.map(r => r.messageId), ['m9', 'm2']);
  const first = await s.createGmailDraft('r1', {messageId: 'm2', bodyPlainText: 'Hello Sam,\n\nI have applied.\n\nKind regards,\nVijay'});
  assert.deepEqual([first.updated, first.reply.status, first.reply.gmailDraftId], [false, 'in_gmail', 'd-new']);
  assert.deepEqual([calls[0].threadId, calls[0].replyToMessageId, calls[0].to, calls[0].draftId, calls[0].expectedAddress], ['t1', 'm2', 'sam@agency.test', '', 'me@example.test']);
  assert.equal(calls[0].bodyHtml, '<p>Hello Sam,</p><p>I have applied.</p><p>Kind regards,<br>Vijay</p>');
  const second = await s.createGmailDraft('r1', {messageId: 'm2', bodyPlainText: 'Hello Sam, edited.', bodyHtml: '<p>Hello Sam, edited.</p>'});
  assert.equal(second.updated, true); assert.equal(calls[1].draftId, 'd-new');
  assert.equal(first.gmailDraftsUrl, 'https://mail.google.com/mail/?authuser=me%40example.test#drafts', 'opens the mailbox the draft is in');
  assert.deepEqual(logged, ['[REPLY_ASSISTANT] GMAIL_DRAFT_CREATED review=r1', '[REPLY_ASSISTANT] GMAIL_DRAFT_UPDATED review=r1']);
  assert.ok(!logged.join(' ').includes('sam@agency.test') && !logged.join(' ').includes('Hello'), 'no addresses or reply text in the log');
  assert.equal(store.get('r1', 'm9').status, 'new', 'the other reply is untouched');
  assert.equal((await s.overview('r1')).savedReplies.length, 2);
});

test('saving and Gmail drafts refuse unknown replies, missing setup and uncertain outcomes', async () => {
  const store = createReplyThreadsStore({filePath: ':memory:'});
  store.addFound('r1', REPLIES);
  const reviews = new Map([['r1', {formData: {}}]]);
  const s = createRecruiterReplyService({reviews, replyStore: store, mailbox: 'me@example.test', draftWriter: async () => ({ok: false, code: 'DRAFT_UNCERTAIN', error: 'Gmail did not confirm the draft. Check your Gmail Drafts before trying again.'})});
  assert.equal((await s.saveDraft('r1', {messageId: 'm2', draftText: 'Hi', applicationStatus: 'applied'})).reply.status, 'drafted');
  assert.throws(() => s.saveDraft('r1', {messageId: 'nope', draftText: 'Hi'}), /not saved with this application/);
  await assert.rejects(s.createGmailDraft('r1', {messageId: 'm2', bodyPlainText: 'Hi'}), /Check your Gmail Drafts/);
  assert.equal(store.get('r1', 'm2').gmailDraftId, '', 'an uncertain draft is not recorded as created');
  await assert.rejects(s.createGmailDraft('r1', {messageId: 'm2', bodyPlainText: ''}), /required/);
  await assert.rejects(createRecruiterReplyService({reviews}).createGmailDraft('r1', {messageId: 'm2'}), /off/);
  assert.throws(() => createRecruiterReplyService({reviews}).saveDraft('r1', {messageId: 'm2'}), /unavailable/);
});
