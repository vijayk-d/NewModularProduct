import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createApplicationAnswersStore} from '../../src/infrastructure/applications/sqlite-application-answers-store.js';
import {createReplyThreadsStore} from '../../src/infrastructure/applications/sqlite-reply-threads-store.js';
import {buildReplyApiRequest} from '../../src/infrastructure/refinement/perplexity-recruiter-reply-adapter.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

const REPLIES = [
  {messageId: 'm9', threadId: 't2', fromName: 'Andrew Smith', fromAddress: 'andrew@client.test', subject: 'Re: Application', date: 'Tue, 24 Nov 2026 10:00:00 +0000', internalDate: 9, text: 'I am not involved in this requirement, sorry.'},
  {messageId: 'm2', threadId: 't1', fromName: 'Sam Recruiter', fromAddress: 'sam@agency.test', subject: 'Re: Application', date: 'Mon, 23 Nov 2026 10:00:00 +0000', internalDate: 2, text: 'Thanks. Please apply online via our portal.'}];
const test = base.extend({app: async ({}, use) => {
  const reviews = reviewFixture(), drafts = [];
  const replyWriter = {available: true, buildRequest: buildReplyApiRequest, async write(request, model) { return {reply: `Hello ${request.recipientName},\n\nThank you. I have applied online.\n\nKind regards,\nTest Candidate`, notes: '', model}; }};
  const server = createLocalServer({applicationReviewStore: reviews, answersStore: createApplicationAnswersStore({filePath: ':memory:'}), replyWriter, replyThreadsStore: createReplyThreadsStore({filePath: ':memory:'}),
    gmailReplyReader: async () => ({ok: true, mailbox: '', replies: REPLIES}),
    gmailReplyDrafter: async args => { drafts.push(args); return {ok: true, draftId: args.draftId || 'd-1', updated: Boolean(args.draftId), subject: 'Re: Application'}; },
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }},
    outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => [{id: 's1', reviewId: 'r1', status: 'sent', email: 'sam@agency.test', threadId: 't1', messageId: 'm1', sentAt: '2026-11-20T10:00:00Z'}]}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port, drafts}); }
  finally { server.closeAllConnections(); await new Promise(res => server.close(res)); }
}});

test('answer each reply separately and put the answer in a Gmail draft in their conversation', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  const section = page.locator('#recruiter-reply');
  await section.getByRole('heading', {name: 'Reply assistant'}).click();
  await section.getByRole('button', {name: 'Find their reply in Gmail (read-only)'}).click();
  const list = section.getByRole('list', {name: 'Replies found'});
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').first()).toHaveAttribute('aria-pressed', 'true');
  await list.getByRole('listitem').filter({hasText: 'Sam Recruiter'}).click();
  await expect(section.getByLabel('Their reply')).toHaveValue(/apply online/);
  await expect(section.getByLabel('Their first name (optional)')).toHaveValue('Sam');
  await section.getByRole('button', {name: 'Estimate: draft a reply with AI'}).click();
  await section.getByRole('button', {name: 'Write reply with AI (paid, one request)'}).click();
  await expect(list.getByRole('listitem').filter({hasText: 'Sam Recruiter'})).toContainText('Reply drafted');
  await section.getByRole('button', {name: 'Create Gmail draft'}).click();
  await expect(section.locator('[data-reply-status]')).toContainText('Gmail draft created in their conversation');
  await expect(section.getByRole('link', {name: 'Open Gmail drafts'})).toHaveAttribute('href', /mail\.google\.com/);
  await expect(list.getByRole('listitem').filter({hasText: 'Sam Recruiter'})).toContainText('In Gmail drafts');
  expect(app.drafts).toHaveLength(1);
  expect([app.drafts[0].threadId, app.drafts[0].replyToMessageId, app.drafts[0].to, app.drafts[0].draftId]).toEqual(['t1', 'm2', 'sam@agency.test', '']);
  expect(app.drafts[0].bodyPlainText).toContain('Hello Sam');
  await section.getByRole('button', {name: 'Update Gmail draft'}).click();
  await expect(section.locator('[data-reply-status]')).toContainText('Gmail draft updated');
  expect(app.drafts[1].draftId).toBe('d-1');
  await page.reload();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').filter({hasText: 'Andrew Smith'})).toContainText('New');
  await list.getByRole('listitem').filter({hasText: 'Sam Recruiter'}).click();
  await expect(section.getByRole('textbox', {name: 'Suggested reply (editable)'})).toContainText('I have applied online');
});
