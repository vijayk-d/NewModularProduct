import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createDurableReviewStore, createMemoryReviewRepository} from '../../src/application/durable-review-store.js';
import {createSqliteJobImportStore} from '../../src/infrastructure/applications/sqlite-job-import-store.js';

const advert = id => ({schemaVersion: 1, source: 'linkedin', requestId: randomUUID(), jobId: id, jobAdvertLink: 'https://www.linkedin.com/jobs/view/' + id + '/', jobTitle: 'Synthetic Delivery Manager', jobDescriptionText: 'Synthetic description for a delivery role.', advertiser: {name: 'Example Advertiser', linkedinUrl: 'https://www.linkedin.com/company/example/'}, location: {text: 'London, United Kingdom', workplaceType: 'hybrid'}, jobPosters: [], extraction: {readerVersion: 'test', extractedAt: '2026-11-16T10:00:00.000Z', descriptionStatus: 'unknown'}});

const test = base.extend({app: async ({}, use) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wf-ui-'));
  const imports = createSqliteJobImportStore({filePath: path.join(dir, 'imports.db')});
  imports.receive(advert('4242'));
  const reviews = createDurableReviewStore(createMemoryReviewRepository());
  const cv = {role_code: 'PM', role_name: 'Project Manager', local_path: 'PM/fixture.pdf'}, body = 'Dear Hiring Manager,\n\nI led delivery.\n\nWarm regards,\nTest Candidate';
  reviews.set('saved', {formData: {jobTitle: 'Delivery Manager', organisationName: 'Example', jobDescriptionText: 'Lead delivery.', jobAdvertLink: 'https://business.test/job', advertiserRelationship: 'unknown'}, prepared: {jobDescription: {role: 'Delivery Manager'}, coverLetter: {subject: 'S', plainText: body}, recommendation: {bestCv: cv, alternativeCv: null, ats: {score: 70}}, rankedCvs: [{cv, ats: {score: 70, matchedKeywords: [], missingKeywords: []}}]}, currentDraftPlainText: body, currentDraftSubject: 'S', selectedCvRoleCode: 'PM', createdAt: Date.now()});
  const server = createLocalServer({applicationReviewStore: reviews, jobImportService: imports, recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port}); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); imports.close?.(); rmSync(dir, {recursive: true, force: true}); }
}});

test('choosing a stored advert loads and applies it in one step on an empty form', async ({page, app}) => {
  page.on('dialog', dialog => { throw new Error('No confirmation should be needed on an empty form: ' + dialog.message()); });
  await page.goto(app.url + '/');
  await page.getByRole('group', {name: 'Filter stored adverts by status'}).getByRole('radio', {name: 'New', exact: true}).check();
  const choice = page.getByRole('combobox', {name: 'Choose a stored LinkedIn advert'});
  await expect(choice.locator('option[value="4242"]')).toHaveCount(1);
  await choice.selectOption('4242');
  await expect(page.locator('[name="jobTitle"]')).toHaveValue('Synthetic Delivery Manager');
  await expect(page.locator('[name="jobDescriptionText"]')).toHaveValue(/Synthetic description/);
  await expect(page.locator('[name="jobAdvertLink"]')).toHaveValue('https://www.linkedin.com/jobs/view/4242/');
  await expect(page.getByText(/Job 4242, revision 1 applied/)).toBeVisible();
});

test('the export CV choice is remembered after a reload', async ({page, app}) => {
  await page.goto(app.url + '/applications/saved');
  const choice = page.getByRole('combobox', {name: 'CV to include in export'});
  await expect(choice).toHaveValue('none');
  await choice.selectOption('both');
  await page.reload();
  await expect(page.getByRole('combobox', {name: 'CV to include in export'})).toHaveValue('both');
  await expect(page.locator('[data-export-summary]')).toContainText('CV PM as PDF and DOCX');
});
