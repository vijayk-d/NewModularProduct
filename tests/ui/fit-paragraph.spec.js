import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createApplicationAnswersStore} from '../../src/infrastructure/applications/sqlite-application-answers-store.js';
import {buildAnswerApiRequest} from '../../src/infrastructure/refinement/perplexity-question-answer-adapter.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

const JD = 'We are hiring a Delivery Manager. You will lead stakeholder management, risk management and continuous improvement across cross-functional teams.';
const LETTER = 'Dear Hiring Manager,\n\nI am applying for this role.\n\nKind regards,\nTest Candidate';
const test = base.extend({app: async ({}, use) => {
  const reviews = reviewFixture(), r = reviews.get('r1'), writes = [];
  reviews.set('r1', {...r, formData: {...r.formData, jobDescriptionText: JD, cvHighlights: ['At SKY, I led continuous improvement across five teams.']}, currentDraftPlainText: LETTER, selectedCvRoleCode: 'PM'});
  const questionWriter = {available: true, buildRequest: buildAnswerApiRequest, async write(request, model) { writes.push(request); return {answer: 'As a PMP-certified delivery manager, I lead continuous improvement.', notes: '', model}; }};
  const server = createLocalServer({applicationReviewStore: reviews, answersStore: createApplicationAnswersStore({filePath: ':memory:'}), questionWriter,
    cvTextFor: async code => code === 'PM' ? 'Delivery lead with 15+ years of experience. Certifications: PMP, PRINCE2 Practitioner.' : '',
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port, writes}); }
  finally { server.closeAllConnections(); await new Promise(res => server.close(res)); }
}});

test('draft the strong-fit paragraph from evidence and CV facts, then insert it at the cursor', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  const toolbar = page.getByRole('toolbar', {name: 'Cover letter formatting'}), panel = page.locator('[data-fit-panel="cover-letter-draft"]');
  await toolbar.getByRole('button', {name: 'Fit paragraph'}).click();
  const text = panel.getByRole('textbox', {name: 'Strong-fit paragraph (editable)'});
  await expect(text).toHaveValue(/^I am a strong fit for this Delivery Manager role at Example: I bring more than 15 years of experience in continuous improvement, and I hold PMP and PRINCE2 Practitioner\. At SKY, I led continuous improvement/);
  await expect(panel.locator('[data-fit-used]')).toContainText('certifications: PMP, PRINCE2 Practitioner (from your CV)');
  const editor = page.locator('#cover-letter-draft');
  await editor.evaluate(e => { e.focus(); const w = document.createTreeWalker(e, 4); let n; while ((n = w.nextNode()) && !n.data.startsWith('Kind regards')); const r = document.createRange(); r.setStart(n, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await page.waitForTimeout(50);
  await panel.getByRole('button', {name: 'Insert at cursor'}).click();
  await expect(panel.locator('[data-fit-status]')).toContainText('Inserted at your cursor');
  const letter = await editor.innerText();
  expect(letter.indexOf('I am a strong fit')).toBeGreaterThan(letter.indexOf('I am applying for this role'));
  expect(letter.indexOf('I am a strong fit')).toBeLessThan(letter.indexOf('Kind regards'));
});

test('Ctrl+Shift+F opens it, and Polish with AI is one paid request after an estimate', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  await page.locator('#cover-letter-draft').getByText('I am applying').click();
  await page.keyboard.press('Control+Shift+F');
  const panel = page.locator('[data-fit-panel="cover-letter-draft"]');
  await expect(panel.getByRole('textbox', {name: 'Strong-fit paragraph (editable)'})).toHaveValue(/^I am a strong fit/);
  await panel.getByRole('button', {name: 'Polish with AI (estimate)'}).click();
  expect(app.writes.length).toBe(0);
  await panel.getByRole('button', {name: 'Write with AI (paid, one request)'}).click();
  await expect(panel.getByRole('textbox', {name: 'Strong-fit paragraph (editable)'})).toHaveValue('As a PMP-certified delivery manager, I lead continuous improvement.');
  expect(app.writes.length).toBe(1);
  expect(app.writes[0].evidence.map(e => e.source)).toContain('Selected CV');
});
