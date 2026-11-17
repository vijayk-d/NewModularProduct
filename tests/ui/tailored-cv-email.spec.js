import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createCvTailoringService} from '../../src/application/cv-tailoring.js';
import {createCvTailoringStore} from '../../src/infrastructure/applications/sqlite-cv-tailoring-store.js';
import {createTailoredPdfFiles} from '../../src/infrastructure/applications/tailored-cv-pdf-files.js';
import {fakeWorker, reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

// Fake Word: 'fail-first' fails the automatic conversion at build, then works when Make PDF is clicked.
const test = base.extend({word: ['ok', {option: true}], app: async ({word}, use) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tailored-email-ui-'));
  let conversions = 0;
  const pdfConverter = {convert: async () => {
    conversions++;
    if (word === 'fail-first' && conversions === 1) throw Object.assign(new Error('Microsoft Word could not be started. Make sure you are signed in to Windows and Word opens normally, then click Make PDF.'), {statusCode: 503});
    return {bytes: Buffer.from('%PDF-1.7 fake ' + conversions), wordVersion: '16.0'};
  }};
  const reviews = reviewFixture();
  const service = createCvTailoringService({reviews, store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker([]), cvFolder: 'C:/cv', cvLibrary: async () => [{role_code: 'PM', local_path: 'PM/PM_CV.pdf'}],
    pdfConverter, pdfFiles: createTailoredPdfFiles({folder: dir})});
  const server = createLocalServer({applicationReviewStore: reviews, cvTailoringService: service, candidateDisplayName: 'Test Candidate',
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port, service, conversions: () => conversions}); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await rm(dir, {recursive: true, force: true}); }
}});

async function build(page, app) {
  await page.goto(app.url + '/applications/r1');
  const section = page.locator('#tailored-cv');
  await section.getByRole('button', {name: 'Draft tailored CV'}).click();
  await expect(section.locator('[data-tailored-status]')).toContainText('Found');
  await section.getByRole('button', {name: 'Build tailored CV (DOCX)'}).click();
  await expect(section.locator('[data-tailored-build-status]')).toContainText('version 1 built');
  return section;
}

test('a build makes the PDF, and the tailored CV can be chosen for recruiter emails', async ({page, app}) => {
  const choice = page.locator('[data-tailored-email-choice]');
  await page.goto(app.url + '/applications/r1');
  await expect(choice.getByLabel('Selected CV (as in the CV library)')).toBeChecked();
  await expect(choice.getByLabel('Tailored CV (PDF)')).toBeDisabled();
  const section = await build(page, app);
  await expect(section.locator('[data-tailored-pdf]')).toContainText('PDF ready for emailing');
  await expect(choice.getByLabel('Tailored CV (PDF)')).toBeEnabled();
  await choice.getByLabel('Tailored CV (PDF)').check();
  await expect(choice.locator('[data-tailored-email-status]')).toHaveText('Emails will attach tailored CV version 1 (PDF).');
  expect(app.service.emailAttachment('r1')).toMatchObject({root: 'tailored', relativePath: 'r1/v1.pdf', tailoredVersion: 1});
  await page.reload();
  await expect(page.locator('[data-tailored-email-choice]').getByLabel('Tailored CV (PDF)')).toBeChecked();
  await page.locator('[data-tailored-email-choice]').getByLabel('Selected CV (as in the CV library)').check();
  await expect(page.locator('[data-tailored-email-status]')).toHaveText('');
  expect(app.service.emailAttachment('r1')).toBeNull();
});

test.describe('when Word fails during the build', () => {
  test.use({word: 'fail-first'});
  test('the build still succeeds and Make PDF tries once more on request', async ({page, app}) => {
    const section = await build(page, app);
    const pdf = section.locator('[data-tailored-pdf]');
    await expect(pdf).toContainText('Microsoft Word could not be started');
    await expect(page.locator('[data-tailored-email-choice]').getByLabel('Tailored CV (PDF)')).toBeDisabled();
    expect(app.conversions()).toBe(1);
    await section.getByRole('button', {name: 'Make PDF'}).click();
    await expect(pdf).toContainText('PDF ready for emailing');
    expect(app.conversions()).toBe(2);
    await expect(page.locator('[data-tailored-email-choice]').getByLabel('Tailored CV (PDF)')).toBeEnabled();
  });
});
