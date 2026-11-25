import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createApplicationAnswersStore} from '../../src/infrastructure/applications/sqlite-application-answers-store.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

const JD = 'We are hiring a Delivery Manager. You will lead stakeholder management, risk management and continuous improvement across cross-functional teams.';
const LETTER = 'Dear Hiring Manager,\n\nI bring strong stakeholder management and steady risk management to every programme.\n\nKind regards,\nTest Candidate';
const test = base.extend({app: async ({}, use) => {
  const reviews = reviewFixture(), r = reviews.get('r1');
  reviews.set('r1', {...r, formData: {...r.formData, jobDescriptionText: JD, cvHighlights: ['At SKY, I led continuous improvement across five teams.']}, currentDraftPlainText: LETTER, currentHighlightPhrases: []});
  const server = createLocalServer({applicationReviewStore: reviews, answersStore: createApplicationAnswersStore({filePath: ':memory:'}),
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port}); }
  finally { server.closeAllConnections(); await new Promise(res => server.close(res)); }
}});

test('Keywords highlights the advert terms the letter uses and lists the missing ones with evidence', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  const editor = page.locator('#cover-letter-draft');
  await expect(editor.locator('mark')).toHaveCount(0);
  const toolbar = page.getByRole('toolbar', {name: 'Cover letter formatting'});
  await toolbar.getByRole('button', {name: 'Keywords'}).click();
  const panel = page.locator('[data-keyword-panel="cover-letter-draft"]');
  await expect(panel.locator('[data-keyword-summary]')).toContainText('Essential: 2 of 4 in this letter · 2 of 4 requirements overall; 1 phrase highlighted');
  await expect(panel.locator('[data-keyword-source]')).toContainText('built-in advert reader');
  await expect(panel.locator('[data-keyword-next]')).toContainText('Add Continuous improvement (Essential) to an evidence bullet');
  await expect(editor.locator('mark[data-highlight-origin="auto"]')).toHaveText(['strong stakeholder management and steady risk management']);
  await expect(panel.locator('[data-keyword-in-letter]')).toContainText('Stakeholder management');
  await panel.locator('[data-keyword-missing-backed]').getByRole('button', {name: 'Continuous improvement'}).click();
  await expect(panel.locator('[data-keyword-evidence]')).toContainText('Best place: an evidence bullet');
  await expect(panel.locator('[data-keyword-evidence]')).toContainText('At SKY, I led continuous improvement');
  await expect(panel.locator('[data-keyword-missing-unbacked]')).toContainText('Cross-functional delivery');
  await toolbar.getByRole('button', {name: 'Clear automatic highlights'}).click();
  await expect(editor.locator('mark')).toHaveCount(0);
});

test('toolbar shortcuts work in the letter and the tooltips name them', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  const toolbar = page.getByRole('toolbar', {name: 'Cover letter formatting'});
  await expect(toolbar.locator('button[data-editor-command="bold"]')).toHaveAttribute('title', /Ctrl\+B/);
  await expect(toolbar.locator('button[data-editor-command="insertUnorderedList"]')).toHaveAttribute('title', /Ctrl\+Shift\+8/);
  const editor = page.locator('#cover-letter-draft');
  await editor.locator('text=I bring strong').click();
  await page.keyboard.press('Control+Shift+Digit8');
  await expect(editor.locator('ul li')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+K');
  await expect(page.locator('[data-keyword-panel="cover-letter-draft"] [data-keyword-summary]')).toBeVisible();
  await page.keyboard.press('Control+/');
  await expect(page.locator('[data-keyword-panel="cover-letter-draft"] [data-shortcut-list]')).toContainText('Ctrl+Shift+K: Keywords');
});

test('hovering a toolbar button shows its shortcut at once', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  const toolbar = page.getByRole('toolbar', {name: 'Cover letter formatting'});
  const tip = page.locator('[data-instant-tip]');
  await toolbar.locator('button[data-editor-command="bold"]').hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Ctrl+B');
  await toolbar.locator('button[data-editor-command="undo"]').hover();
  await expect(tip).toContainText('Ctrl+Z');
  await page.mouse.move(5, 5);
  await expect(tip).toBeHidden();
  await expect(toolbar.locator('button[data-editor-command="undo"]')).toHaveAttribute('title', /Ctrl\+Z/);
});

