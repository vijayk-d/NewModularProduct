import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createCvTailoringService} from '../../src/application/cv-tailoring.js';
import {createCvTailoringStore} from '../../src/infrastructure/applications/sqlite-cv-tailoring-store.js';
import {createApplicationPackExporter} from '../../src/infrastructure/applications/application-pack-exporter.js';
import {createApplicationOutputFolder} from '../../src/infrastructure/applications/application-output-folder.js';
import {fakeWorker, reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

// folderSet: false starts the app with no APPLICATION_OUTPUT_FOLDER, as on a fresh install.
const test = base.extend({folderSet: [true, {option: true}], app: async ({folderSet}, use) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'save-to-folder-ui-'));
  const reviews = reviewFixture(), calls = [];
  const service = createCvTailoringService({reviews, store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker(calls), cvFolder: 'C:/cv', cvLibrary: async () => [{role_code: 'PM', local_path: 'PM/PM_CV.pdf'}]});
  const server = createLocalServer({applicationReviewStore: reviews, cvTailoringService: service, candidateDisplayName: 'Test Candidate',
    applicationPackExporter: createApplicationPackExporter({candidateName: 'Test Candidate'}), applicationOutputFolder: createApplicationOutputFolder({folder: folderSet ? dir : ''}),
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port, dir}); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await rm(dir, {recursive: true, force: true}); }
}});

async function buildTailoredCv(page, app) {
  await page.goto(app.url + '/applications/r1');
  const section = page.locator('#tailored-cv');
  await section.getByRole('button', {name: 'Draft tailored CV'}).click();
  await expect(section.locator('[data-tailored-status]')).toContainText('Found');
  await section.getByRole('button', {name: 'Build tailored CV (DOCX)'}).click();
  await expect(section.locator('[data-tailored-build-status]')).toContainText('version 1 built');
  return section;
}

test('Save to folder writes the tailored CV and Save pack to folder writes the pack files', async ({page, app}) => {
  const section = await buildTailoredCv(page, app);
  await expect(section.locator('[data-tailored-download]')).toBeVisible();
  await section.getByRole('button', {name: 'Save to folder'}).click();
  await expect(section.locator('[data-tailored-save-status]')).toContainText('Saved Test_Candidate_Delivery_Manager_CV.docx in');
  const where = path.join(app.dir, 'Example-Delivery-Manager');
  expect(await readdir(where)).toEqual(['Test_Candidate_Delivery_Manager_CV.docx']);

  await section.getByRole('button', {name: 'Save to folder'}).click();
  await expect(section.locator('[data-tailored-save-status]')).toContainText('Test_Candidate_Delivery_Manager_CV_v2.docx');

  const pack = page.getByRole('group', {name: 'Export pack'});
  await pack.getByRole('button', {name: 'Save pack to folder'}).click();
  await expect(pack.getByRole('status')).toContainText(/Saved \d+ file\(s\) in/);
  expect(await readdir(where)).toEqual(expect.arrayContaining(['cover-letter.txt', 'application.txt', 'Test_Candidate_Delivery_Manager_Cover_Letter.docx']));
});

test.describe('with no output folder set', () => {
  test.use({folderSet: false});
  test('both buttons explain how to set APPLICATION_OUTPUT_FOLDER', async ({page, app}) => {
    const section = await buildTailoredCv(page, app);
    await section.getByRole('button', {name: 'Save to folder'}).click();
    await expect(section.locator('[data-tailored-save-status]')).toContainText('Set APPLICATION_OUTPUT_FOLDER in .env');
    const pack = page.getByRole('group', {name: 'Export pack'});
    await pack.getByRole('button', {name: 'Save pack to folder'}).click();
    await expect(pack.getByRole('status')).toContainText('Set APPLICATION_OUTPUT_FOLDER in .env');
    expect(await readdir(app.dir)).toEqual([]);
  });
});
