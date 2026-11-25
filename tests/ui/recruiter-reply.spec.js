import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createApplicationAnswersStore} from '../../src/infrastructure/applications/sqlite-application-answers-store.js';
import {buildReplyApiRequest} from '../../src/infrastructure/refinement/perplexity-recruiter-reply-adapter.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';
import {createApplicationInsightsStore} from '../../src/infrastructure/applications/sqlite-application-insights-store.js';

const REPLY = 'Hello Sam,\n\nThank you for letting me know. I have completed the online application.\n\nI emailed as well so that my application reaches a person who can judge my experience, such as facilitating PI planning for five squads at SKY.\n\nKind regards,\nTest Candidate';
const test = base.extend({app: async ({}, use) => {
  const reviews = reviewFixture(), r = reviews.get('r1'), calls = [];
  reviews.set('r1', {...r, formData: {...r.formData, cvHighlights: ['At SKY, I facilitated PI planning for five squads.']}});
  const replyWriter = {available: true, buildRequest: buildReplyApiRequest, async write(request, model) { calls.push(request); return {reply: REPLY, notes: '', model}; }};
  const sent = [{id: 's1', reviewId: 'r1', status: 'sent', email: 'sam@agency.test', fullName: 'Sam Recruiter', threadId: 'thread123', messageId: 'm1', sentAt: '2026-11-20T10:00:00Z'}], reads = [];
  const gmailReplyReader = async args => { reads.push(args); return {ok: true, mailbox: 'me@example.test', replies: [
    {messageId: 'g1', internalDate: Date.parse('2026-11-23T09:00:00Z'), fromName: 'Sam Recruiter', fromAddress: 'sam@agency.test', date: 'Mon, 23 Nov 2026', text: 'Thanks for your email. We only accept applications through our portal, so please apply online.'}]}; };
  const server = createLocalServer({applicationReviewStore: reviews, insightsStore: createApplicationInsightsStore({filePath: ':memory:'}), answersStore: createApplicationAnswersStore({filePath: ':memory:'}), replyWriter, gmailReplyReader,
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

test('find their reply in Gmail (read-only), with a clear three-step layout', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  const section = page.locator('#recruiter-reply');
  await section.getByRole('heading', {name: 'Reply assistant'}).click();
  for (const legend of ['1. Their reply', '2. Your answer', '3. Draft']) await expect(section.locator('legend', {hasText: legend})).toBeVisible();
  await expect(section.locator('[data-reply-result]')).toBeHidden();
  // Opening the Reply assistant searches Gmail by itself (read-only); no click needed.
  await expect(section.getByLabel('Their reply')).toHaveValue(/please apply online/);
  await expect(section.getByLabel('Their first name (optional)')).toHaveValue('Sam');
  await expect(section.locator('[data-reply-source]')).toContainText('From Gmail: Sam Recruiter');
  await expect(section.locator('[data-reply-gmail]')).toContainText('Nothing in Gmail was changed');
  expect(app.reads).toEqual([{threads: [{threadId: 'thread123', sentMessageId: 'm1'}], fromAddresses: ['sam@agency.test'], after: '2026/11/19', expectedAddress: ''}]);
  // Closing and reopening does not search again; the button does.
  await section.getByRole('heading', {name: 'Reply assistant'}).click();
  await section.getByRole('heading', {name: 'Reply assistant'}).click();
  await page.waitForTimeout(200);
  expect(app.reads).toHaveLength(1);
  await section.getByRole('button', {name: 'Find their reply in Gmail (read-only)'}).click();
  await expect.poll(() => app.reads.length).toBe(2);
  const field = await section.getByLabel('Their reply').boundingBox(), label = await section.getByText('Their reply', {exact: true}).boundingBox();
  expect(label.y + label.height).toBeLessThanOrEqual(field.y + 2);
});

test('a salary question is ticked for you; your answer and own message go to the writer and the answer is remembered', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  const section = page.locator('#recruiter-reply');
  await section.getByRole('heading', {name: 'Reply assistant'}).click();
  // Opening the panel searches Gmail by itself; let that finish so it cannot replace the pasted text.
  await expect(section.locator('[data-reply-gmail]')).toContainText('Found 1 reply');
  await section.getByLabel('Their reply').fill('Thanks for getting in touch. Before I share your profile, what are your salary expectations and notice period?');
  const topics = section.getByRole('group', {name: 'What they asked about'});
  await expect(topics.locator('[data-topic="salary"]')).toBeChecked();
  await expect(topics.locator('[data-topic="notice"]')).toBeChecked();
  await expect(topics.locator('[data-topic="apply-online"]')).not.toBeChecked();
  await expect(section.locator('[data-reply-topics-found]')).toContainText('Salary or rate expectation, Notice period or start date');
  await expect(section.getByLabel('Your online application')).toHaveValue('none');
  await topics.locator('[data-topic-answer="salary"]').fill('£80,000 base');
  await topics.locator('[data-topic-answer="salary"]').blur();
  await section.getByLabel('Your own message (optional)').fill('I am flexible for the right role.');
  await section.getByRole('button', {name: 'Estimate: draft a reply with AI'}).click();
  await section.getByRole('button', {name: 'Write reply with AI (paid, one request)'}).click();
  await expect(section.getByRole('textbox', {name: 'Suggested reply (editable)'})).toContainText('Kind regards');
  expect(app.calls[0].topics).toEqual([{topic: 'Salary or rate expectation', yourAnswer: '£80,000 base'}, {topic: 'Notice period or start date', yourAnswer: ''}]);
  expect(app.calls[0].ownerNote).toBe('I am flexible for the right role.');
  expect(app.calls[0].applicationStatusText).toMatch(/Not part of this reply/);
  await page.reload();
  await expect(topics.locator('[data-topic-answer="salary"]')).toHaveValue('£80,000 base');
});

test('a reply found in Gmail updates the Outcome section straight away', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  await expect(page.locator('[data-outcome-current]')).toContainText('No outcome recorded yet');
  await page.locator('#recruiter-reply').getByRole('heading', {name: 'Reply assistant'}).click();
  await expect(page.locator('[data-reply-gmail]')).toContainText('Outcome updated: Recruiter replied.');
  await expect(page.locator('[data-outcome-current]')).toContainText('Current outcome: Recruiter replied');
  await expect(page.locator('[data-outcome-history]')).toContainText('Reply assistant: Sam Recruiter replied (Asked you to apply online)');
});
