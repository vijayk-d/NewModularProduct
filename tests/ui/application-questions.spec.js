import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createApplicationAnswersStore} from '../../src/infrastructure/applications/sqlite-application-answers-store.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

const test = base.extend({app: async ({}, use) => {
  const reviews = reviewFixture(), r = reviews.get('r1');
  reviews.set('r1', {...r, formData: {...r.formData, cvHighlights: ['At SKY, I facilitated PI planning for five distributed squads.', 'At BP, I built in-house Agile and OKR capability for the CoE.', 'Introduced risk reporting for the board.']}});
  const server = createLocalServer({applicationReviewStore: reviews, answersStore: createApplicationAnswersStore({filePath: ':memory:'}),
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port}); }
  finally { server.closeAllConnections(); await new Promise(res => server.close(res)); }
}});

test('draft an answer from evidence, keep it within the limit, then save and copy it', async ({page, app}) => {
  page.on('dialog', d => { throw new Error('No browser dialog expected: ' + d.message()); });
  await page.addInitScript(() => { window.__copied = ''; Object.defineProperty(navigator, 'clipboard', {value: {writeText: async t => { window.__copied = t; }}}); });
  await page.goto(app.url + '/applications/r1');
  const section = page.locator('#application-questions');
  await expect(section.locator('details.questions-panel')).not.toHaveAttribute('open', '');
  await expect(section.getByLabel('Question from the form')).toBeHidden();
  await section.getByRole('heading', {name: 'Application questions'}).click();
  await expect(section.locator('[data-questions-evidence]')).toContainText('3 lines from Selected achievement');
  await expect(section.getByRole('button', {name: 'Estimate: write with AI'})).toBeHidden();
  await section.getByLabel('Question from the form').fill('Describe how you introduced Agile PI planning and OKR capability.');
  await section.getByLabel('Limit', {exact: true}).fill('30');
  await section.getByRole('button', {name: 'Draft from evidence (free)'}).click();
  const answer = section.getByLabel('Your answer');
  await expect(answer).toHaveValue(/PI planning/);
  await expect(section.locator('[data-answer-count]')).toContainText(/^\d+ \/ 30 words — \d+ left/);
  await answer.fill(await answer.inputValue() + ' I also coached product owners and scrum masters across the programme every single week.');
  await expect(section.locator('[data-answer-count]')).toHaveAttribute('data-over', 'true');
  await section.getByRole('button', {name: 'Trim to the limit'}).click();
  await expect(section.locator('[data-answer-count]')).toHaveAttribute('data-over', 'false');
  await section.getByRole('button', {name: 'Save answer'}).click();
  await expect(section.locator('[data-questions-status]')).toHaveText('Answer saved with this application.');
  await expect(section.locator('[data-saved-answer]')).toHaveCount(1);
  await section.getByRole('button', {name: 'Copy answer'}).click();
  expect(await page.evaluate(() => window.__copied)).toMatch(/PI planning/);
  await expect(section.locator('[data-questions-saved-count]')).toHaveText('1 saved answer');
  // The browser saves the open/closed state on its toggle event, which arrives just after the click: wait for it before reloading.
  const remembered = () => page.evaluate(() => localStorage.getItem('jobapp.questionsOpen'));
  await expect.poll(remembered).toBe('true');
  await page.reload();
  await expect(page.locator('#application-questions details.questions-panel')).toHaveAttribute('open', '');
  await page.locator('#application-questions').getByRole('heading', {name: 'Application questions'}).click();
  await expect(page.locator('#application-questions details.questions-panel')).not.toHaveAttribute('open', '');
  await expect.poll(remembered).toBe('false');
  await page.reload();
  await expect(page.locator('#application-questions details.questions-panel')).not.toHaveAttribute('open', '');
  await expect(page.locator('#application-questions [data-questions-saved-count]')).toHaveText('1 saved answer');
});
