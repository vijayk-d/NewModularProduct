import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createCvTailoringService} from '../../src/application/cv-tailoring.js';
import {createCvTailoringStore} from '../../src/infrastructure/applications/sqlite-cv-tailoring-store.js';
import {fakeWorker, reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';
import {createWordCvLocator} from '../../src/infrastructure/documents/word-cv-locator.js';

const customCv = payload => payload.profileHeading === 'About My Work' && payload.achievementsHeading === 'Impact Delivered'
  ? {headings: ['About My Work', 'Impact Delivered'], profile: {heading: 'About My Work', paragraphs: ['Custom profile.'], bullets: 0, supported: true}, achievements: {heading: 'Impact Delivered', paragraphs: ['Led a 40-person Agile programme.'], bullets: 1, supported: true}}
  : {headings: ['About My Work', 'Impact Delivered'], profile: null, achievements: null};

const experienceCv = {headings: ['SUMMARY', 'EXPERIENCE'], profile: {heading: 'SUMMARY', paragraphs: ['Agile delivery leader.'], bullets: 0, supported: true}, achievements: null,
  experience: {heading: 'EXPERIENCE', supported: true, roles: [
    {title: 'ACME BANK — Delivery Lead', bullets: ['Built a CoE.', 'Cut risk incidents by 30% through agile risk reviews.']},
    {title: 'OTHER CO — Scrum Master', bullets: ['Coached 5 teams.']}]}};

const test = base.extend({cvLayout: ['standard', {option: true}], app: async ({cvLayout}, use) => {
  const sections = cvLayout === 'custom' ? customCv : cvLayout === 'experience' ? experienceCv : undefined;
  const reviews = reviewFixture(), calls = [];
  // 'folders' layout: the PM folder holds two Word files, neither named like the PDF; a second CV has no Word file.
  const folders = {PM: ['PM_CV.pdf', 'PM Long Version.docx', 'PM Short.docx'], GCC: ['GCC.pdf']};
  const locateWord = cvLayout === 'folders' ? createWordCvLocator({cvFolder: 'C:/cv', list: async folder => folders[folder] || []}) : null;
  const catalogue = [{role_code: 'PM', local_path: 'PM/PM_CV.pdf'}, ...(cvLayout === 'folders' ? [{role_code: 'GCC', role_name: 'Gulf', local_path: 'GCC/GCC.pdf'}] : [])];
  const service = createCvTailoringService({reviews, store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker(calls, {sections}), cvFolder: 'C:/cv', cvLibrary: async () => catalogue, locateWord});
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
  const profile = section.getByLabel(/^Profile \(blank line/);
  const bullets = section.getByLabel(/^Key Achievements \(one bullet/);
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
    await expect(section.locator('[data-tailored-status]')).toContainText('No Profile or Summary heading was recognised');
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

test.describe('a CV with Summary and Experience but no Key achievements', () => {
  test.use({cvLayout: 'experience'});
  test('ranks bullets within each employer and builds with the edited order', async ({page, app}) => {
    await page.goto(app.url + '/applications/r1');
    const section = page.locator('#tailored-cv');
    await section.getByRole('button', {name: 'Draft tailored CV'}).click();
    await expect(section.locator('[data-tailored-status]')).toContainText('Found "SUMMARY" and "EXPERIENCE" (2 employers)');
    await expect(section.getByLabel(/^Key achievements/)).toHaveCount(0);
    await expect(section.locator('[data-tailored-selected]')).toContainText('Introduced risk reporting for the board.');
    const acme = section.getByLabel('ACME BANK — Delivery Lead');
    await expect(acme).toHaveValue('Cut risk incidents by 30% through agile risk reviews.\nBuilt a CoE.');
    await section.getByRole('button', {name: 'Back to CV order'}).first().click();
    await expect(acme).toHaveValue('Built a CoE.\nCut risk incidents by 30% through agile risk reviews.');
    await section.getByLabel('OTHER CO — Scrum Master').fill('Coached teams, cutting incidents by 30%.');
    await section.getByRole('button', {name: 'Build tailored CV (DOCX)'}).click();
    await expect(section.locator('[data-tailored-build-status]')).toContainText('cannot move between employers');
    await section.getByLabel('OTHER CO — Scrum Master').fill('Coached 5 teams.');
    await section.getByRole('button', {name: 'Build tailored CV (DOCX)'}).click();
    await expect(section.locator('[data-tailored-build-status]')).toContainText('version 1 built');
    expect(app.calls.find(c => c.action === 'tailor').roles).toEqual([['Built a CoE.', 'Cut risk incidents by 30% through agile risk reviews.'], ['Coached 5 teams.']]);
  });
});

test.describe('Word files that are not named like the PDF', () => {
  test.use({cvLayout: 'folders'});
  test('asks which Word file to use, remembers it, and checks every CV', async ({page, app}) => {
    await page.goto(app.url + '/applications/r1');
    const section = page.locator('#tailored-cv');
    await section.getByRole('button', {name: 'Draft tailored CV'}).click();
    await expect(section.locator('[data-tailored-status]')).toContainText('has several Word files');
    await section.getByLabel('Which Word file is the source of "PM_CV.pdf"?').selectOption('PM Short.docx');
    await section.getByRole('button', {name: 'Use this Word file'}).click();
    await expect(section.locator('[data-tailored-status]')).toContainText('Word file: chosen by you');
    expect(app.calls.at(-1).relativePath).toBe('PM/PM Short.docx');
    await page.reload();
    await page.locator('#tailored-cv').getByRole('button', {name: 'Draft tailored CV'}).click();
    await expect(page.locator('#tailored-cv [data-tailored-status]')).toContainText('Word file: chosen by you');
    await page.locator('#tailored-cv').getByRole('button', {name: 'Check all CVs'}).click();
    const report = page.locator('#tailored-cv [data-tailored-library]');
    await expect(report).toContainText('1 of 2 CVs are ready for tailoring.');
    await expect(report.locator('tr', {hasText: 'PM Short.docx'})).toContainText('Ready');
    await expect(report.locator('tr', {hasText: 'GCC (Gulf)'})).toContainText('No Word file in "GCC"');
  });
});

test('ATS keyword match runs after drafting, flags a lost keyword and is free', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  const section = page.locator('#tailored-cv');
  await section.getByRole('button', {name: 'Draft tailored CV'}).click();
  const status = section.locator('[data-tailored-ats-status]');
  await expect(status).toContainText('Base CV 50% → tailored CV 100% (2 of 2 job keywords, +50 points)');
  await expect(section.locator('[data-ats-gained]')).toContainText('risk');
  await section.getByLabel(/^Key Achievements \(one bullet/).fill('Cut costs by 10% through vendor consolidation.');
  await section.getByRole('button', {name: 'Check ATS match (free)'}).click();
  await expect(status).toContainText('Base CV 50% → tailored CV 0%');
  await expect(section.locator('[data-ats-lost]')).toContainText('agile');
  await expect(section.locator('[data-ats-work-in]')).toContainText('agile');
  expect(app.calls.filter(c => c.action === 'tailor')).toHaveLength(0);
});
