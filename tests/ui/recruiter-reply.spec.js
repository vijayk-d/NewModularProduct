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
  const server = createLocalServer({applicationReviewStore: reviews, answersStore: createApplicationAnswersStore({filePath: ':memory:'}), replyWriter,
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port, calls}); }
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
