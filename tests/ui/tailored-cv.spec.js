import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createCvTailoringService} from '../../src/application/cv-tailoring.js';
import {createCvTailoringStore} from '../../src/infrastructure/applications/sqlite-cv-tailoring-store.js';
import {fakeWorker, reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

const customCv = payload => payload.profileHeading === 'About My Work' && payload.achievementsHeading === 'Impact Delivered'
  ? {headings: ['About My Work', 'Impact Delivered'], profile: {heading: 'About My Work', paragraphs: ['Custom profile.'], bullets: 0, supported: true}, achievements: {heading: 'Impact Delivered', paragraphs: ['Led a 40-person Agile programme.'], bullets: 1, supported: true}}
  : {headings: ['About My Work', 'Impact Delivered'], profile: null, achievements: null};

const test = base.extend({cvLayout: ['standard', {option: true}], app: async ({cvLayout}, use) => {
  const sections = cvLayout === 'custom' ? customCv : undefined;
  const reviews = reviewFixture(), calls = [];
  const service = createCvTailoringService({reviews, store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker(calls, {sections}), cvFolder: 'C:/cv', cvLibrary: async () => [{role_code: 'PM', local_path: 'PM/PM_CV.pdf'}]});
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

test.describe('a CV with its own heading names', () => {
  test.use({cvLayout: 'custom'});
  test('lists the headings found, uses the chosen ones and remembers them', async ({page, app}) => {
    await page.goto(app.url + '/applications/r1');
    const section = page.locator('#tailored-cv');
    await section.getByRole('button', {name: 'Draft tailored CV'}).click();
    await expect(section.locator('[data-tailored-status]')).toContainText('No Profile heading was recognised');
    await section.getByLabel('Which heading is your Profile?').selectOption('About My Work');
    await section.getByLabel('Which heading is your Key achievements?').selectOption('Impact Delivered');
    await section.getByRole('button', {name: 'Draft again with these headings'}).click();
    await expect(section.locator('[data-tailored-status]')).toContainText('Found "About My Work" and "Impact Delivered"');
    await expect(section.locator('[data-tailored-headings]')).toBeHidden();
    await section.getByRole('button', {name: 'Build tailored CV (DOCX)'}).click();
    await expect(section.locator('[data-tailored-build-status]')).toContainText('version 1 built');
    expect(app.calls.find(c => c.action === 'tailor')).toMatchObject({profileHeading: 'About My Work', achievementsHeading: 'Impact Delivered'});
    await page.reload();
    await page.locator('#tailored-cv').getByRole('button', {name: 'Draft tailored CV'}).click();
    await expect(page.locator('#tailored-cv [data-tailored-status]')).toContainText('Found "About My Work"');
  });
});
