import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createCvTailoringService} from '../../src/application/cv-tailoring.js';
import {createCvTailoringStore} from '../../src/infrastructure/applications/sqlite-cv-tailoring-store.js';
import {fakeWorker, reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

const test = base.extend({app: async ({}, use) => {
  const reviews = reviewFixture(), calls = [];
  const service = createCvTailoringService({reviews, store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker(calls), cvFolder: 'C:/cv', cvLibrary: async () => [{role_code: 'PM', local_path: 'PM/PM_CV.pdf'}]});
  const server = createLocalServer({applicationReviewStore: reviews, cvTailoringService: service, candidateDisplayName: 'Test Candidate',
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port, calls}); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}});

test('draft, edit and build a tailored CV, then download it', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  const section = page.locator('#tailored-cv');
  await expect(section.getByRole('heading', {name: 'Tailored CV'})).toBeVisible();
  await section.getByRole('button', {name: 'Draft tailored CV'}).click();
  await expect(section.locator('[data-tailored-status]')).toContainText('Found "Profile" and "Key Achievements"');
  const profile = section.getByLabel(/^Profile \(replaces "Profile"/);
  const bullets = section.getByLabel(/^Key achievements \(replaces "Key Achievements"/);
  await expect(profile).toHaveValue('Delivery leader across programmes.');
  await expect(bullets).toHaveValue(/Introduced risk reporting for the board\./);

  await bullets.fill('Cut costs by 25% overnight.');
  await section.getByRole('button', {name: 'Build tailored CV (DOCX)'}).click();
  await expect(section.locator('[data-tailored-build-status]')).toContainText('25%');

  await bullets.fill('Led a 40-person Agile programme.');
  await profile.fill('Delivery leader for Agile programmes.\n\nWorks with senior stakeholders.');
  await section.getByRole('button', {name: 'Build tailored CV (DOCX)'}).click();
  await expect(section.locator('[data-tailored-build-status]')).toContainText('version 1 built');
  const link = section.locator('[data-tailored-download]');
  await expect(link).toHaveText('Download tailored CV (version 1, DOCX)');
  const tailor = app.calls.find(c => c.action === 'tailor');
  expect(tailor.profile).toEqual(['Delivery leader for Agile programmes.', 'Works with senior stakeholders.']);
  expect(tailor.achievements).toEqual(['Led a 40-person Agile programme.']);
  const download = await page.request.get(app.url + await link.getAttribute('href'));
  expect(download.status()).toBe(200);

  await expect(page.getByRole('combobox', {name: 'CV to include in export'}).locator('option[value="tailored"]')).toHaveText('Tailored CV (DOCX)');
});
