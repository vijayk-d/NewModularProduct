import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createApplicationAnswersStore} from '../../src/infrastructure/applications/sqlite-application-answers-store.js';
import {buildReplyApiRequest} from '../../src/infrastructure/refinement/perplexity-recruiter-reply-adapter.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

const REPLY = 'Hello Sam,\n\nThank you for letting me know. I have completed the online application.\n\nI emailed as well so that my application reaches a person who can judge my experience, such as facilitating PI planning for five squads at SKY.\n\nKind regards,\nTest Candidate';
const test = base.extend({app: async ({}, use) => {
  const reviews = reviewFixture(), r = reviews.get('r1'), calls = [];
  reviews.set('r1', {...r, formData: {...r.formData, cvHighlights: ['At SKY, I facilitated PI planning for five squads.']}});
  const replyWriter = {available: true, buildRequest: buildReplyApiRequest, async write(request, model) { calls.push(request); return {reply: REPLY, notes: '', model}; }};
  const sent = [{id: 's1', reviewId: 'r1', status: 'sent', email: 'sam@agency.test', fullName: 'Sam Recruiter', threadId: 'thread123', messageId: 'm1', sentAt: '2026-11-20T10:00:00Z'}], reads = [];
  const gmailReplyReader = async args => { reads.push(args); return {ok: true, mailbox: 'me@example.test', replies: [
    {fromName: 'Sam Recruiter', fromAddress: 'sam@agency.test', date: 'Mon, 23 Nov 2026', text: 'Thanks for your email. We only accept applications through our portal, so please apply online.'}]}; };
  const server = createLocalServer({applicationReviewStore: reviews, answersStore: createApplicationAnswersStore({filePath: ':memory:'}), replyWriter, gmailReplyReader,
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => sent}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port, calls, reads}); }
  finally { server.closeAllConnections(); await new Promise(res => server.close(res)); }
}});

test('paste their reply, estimate, write once, edit and copy the suggested reply', async ({page, app}) => {
  page.on('dialog', d => { throw new Error('No browser dialog expected: ' + d.message()); });
  await page.addInitScript(() => { window.__copied = ''; Object.defineProperty(navigator, 'clipboard', {value: {writeText: async t => { window.__copied = t; }}}); });
  await page.goto(app.url + '/applications/r1');
  const section = page.locator('#recruiter-reply');
  await section.getByRole('heading', {name: 'Reply assistant'}).click();
  await expect(section.locator('[data-reply-intro]')).toContainText('1 line');
  await section.getByLabel('Their reply').fill('Thank you for your email. We only accept applications through our online portal, so please apply there.');
  await section.getByLabel('Their first name (optional)').fill('Sam');
  await expect(section.getByLabel('Your online application')).toHaveValue('applied');
  await section.getByRole('button', {name: 'Estimate: draft a reply with AI'}).click();
  await expect(section.locator('[data-reply-ai]')).toContainText('One request');
  expect(app.calls.length).toBe(0);
  await section.getByRole('button', {name: 'Write reply with AI (paid, one request)'}).click();
  const editor = section.getByRole('textbox', {name: 'Suggested reply (editable)'});
  await expect(editor.locator('p')).toHaveCount(4);
  await expect(editor).toContainText('completed the online application');
  expect(app.calls.length).toBe(1);
  expect(app.calls[0].recipientName).toBe('Sam');
  await editor.locator('p').first().click();
  await page.keyboard.press('End'); await page.keyboard.type(' (edited)');
  await section.getByRole('button', {name: 'Copy reply'}).click();
  await expect(section.locator('[data-reply-status]')).toContainText('Reply copied');
  const copied = await page.evaluate(() => window.__copied);
  expect(copied).toContain('Hello Sam, (edited)');
  expect(copied).toContain('\n\nKind regards,\nTest Candidate');
});

test('fetch their reply from the Gmail thread of the email you sent (read-only)', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  const section = page.locator('#recruiter-reply');
  await section.getByRole('heading', {name: 'Reply assistant'}).click();
  await expect(section.getByLabel('Email you sent')).toContainText('sam@agency.test');
  await section.getByRole('button', {name: 'Fetch their reply from Gmail (read-only)'}).click();
  await expect(section.getByLabel('Their reply')).toHaveValue(/please apply online/);
  await expect(section.getByLabel('Their first name (optional)')).toHaveValue('Sam');
  await expect(section.locator('[data-reply-status]')).toContainText('Nothing in Gmail was changed');
  expect(app.reads).toEqual([{threadId: 'thread123', sentMessageId: 'm1', expectedAddress: ''}]);
});
