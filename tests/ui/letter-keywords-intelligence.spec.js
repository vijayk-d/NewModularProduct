import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createApplicationAnswersStore} from '../../src/infrastructure/applications/sqlite-application-answers-store.js';
import {createMemoryAdvertRequirementsStore} from '../../src/infrastructure/advert-requirements-file.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

// Synthetic advert, CV and letter. The AI advert reader is a fake that fails once, so no network call is made.
const JD = 'Essential:\nProject management and agile delivery.\nMust hold SC clearance or be eligible for the TS clearance process.\nEnable immediate engagement to the highest standards.\nExperience in the defence sector.\nDesirable: PMP.';
const CV = 'PRINCE2 Practitioner.\nRan Scrum for five teams with sprint planning.\nEligible for SC clearance: previously SC cleared (to Sep 2025); UK resident for 17 years.';
const LETTER = 'Dear Hiring Manager,\n\nI have led delivery across defence programmes.\n\nKind regards,\nTest Candidate';
const test = base.extend({app: async ({}, use) => {
  const reviews = reviewFixture(), r = reviews.get('r1');
  reviews.set('r1', {...r, selectedCvRoleCode: 'DM', formData: {...r.formData, jobDescriptionText: JD, cvHighlights: []}, currentDraftPlainText: LETTER, currentHighlightPhrases: []});
  const calls = {n: 0};
  const advertRequirementsReader = {available: true, async read() { calls.n++; if (calls.n === 1) throw new Error('timed out'); return {model: 'fake', requirements: [{term: 'PMP', category: 'certification', priority: 'essential', aliases: []}]}; }};
  const server = createLocalServer({applicationReviewStore: reviews, answersStore: createApplicationAnswersStore({filePath: ':memory:'}), cvTextFor: async () => CV,
    advertRequirementsReader, advertRequirementsStore: createMemoryAdvertRequirementsStore(),
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port, calls}); }
  finally { server.closeAllConnections(); await new Promise(res => server.close(res)); }
}});

test('Keywords reads the whole CV: quotes the clearance line, offers PRINCE2 for PMP, flags an unbacked sector, and reads the advert again only on request', async ({page, app}) => {
  page.on('dialog', d => d.accept());
  await page.goto(app.url + '/applications/r1');
  const toolbar = page.getByRole('toolbar', {name: 'Cover letter formatting'});
  const panel = page.locator('[data-keyword-panel="cover-letter-draft"]');
  await toolbar.getByRole('button', {name: 'Keywords'}).click();
  await expect(panel.locator('[data-keyword-source]')).toContainText('built-in advert reader');
  const next = panel.locator('[data-keyword-next]');
  await expect(next).toContainText('Security clearance: the advert asks for it. Selected CV: “Eligible for SC clearance: previously SC cleared (to Sep 2025)');
  await expect(next).toContainText('PMP (Desirable): you hold PRINCE2, not PMP. Name PRINCE2 as your equivalent');
  await expect(next).toContainText('Check: the letter mentions Defence, but your CV and evidence do not show it');
  await expect(panel).not.toContainText('Highest standards');
  expect(app.calls.n).toBe(1);
  await toolbar.getByRole('button', {name: 'Keywords'}).click();
  await expect(panel.locator('[data-keyword-read-again]')).toBeVisible();
  expect(app.calls.n).toBe(1);
  await panel.locator('[data-keyword-read-again]').click();
  await expect(panel.locator('[data-keyword-source]')).toContainText('read from the advert by AI');
  expect(app.calls.n).toBe(2);
  await expect(panel.locator('[data-keyword-next]')).toContainText('you hold PRINCE2, not PMP');
});
