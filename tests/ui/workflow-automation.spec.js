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
  reviews.set('saved', {formData: {jobTitle: 'Delivery Manager', organisationName: 'Example', jobDescriptionText: 'Lead delivery.', jobAdvertLink: 'https://business.test/job', advertiserRelationship: 'unknown', emailDomain: 'old-domain.co.uk'}, prepared: {jobDescription: {role: 'Delivery Manager'}, coverLetter: {subject: 'S', plainText: body}, recommendation: {bestCv: cv, alternativeCv: null, ats: {score: 70}}, rankedCvs: [{cv, ats: {score: 70, matchedKeywords: [], missingKeywords: []}}]}, currentDraftPlainText: body, currentDraftSubject: 'S', selectedCvRoleCode: 'PM', createdAt: Date.now()});
  const server = createLocalServer({applicationReviewStore: reviews, jobImportService: imports, recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }, async updateLinkedEmailCandidates() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port}); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); imports.close?.(); rmSync(dir, {recursive: true, force: true}); }
}});

test('choosing a stored advert loads and applies it in one step on an empty form', async ({page, app}) => {
  page.on('dialog', dialog => { throw new Error('No confirmation should be needed on an empty form: ' + dialog.message()); });
  await page.goto(app.url + '/');
  await page.getByRole('group', {name: 'Filter stored adverts by status'}).getByRole('radio', {name: 'New', exact: true}).check();
  const choice = page.getByRole('combobox', {name: 'Choose a stored advert'});
  await expect(choice.locator('option[value="4242"]')).toHaveCount(1);
  await choice.selectOption('4242');
  await expect(page.locator('[name="jobTitle"]')).toHaveValue('Synthetic Delivery Manager');
  await expect(page.locator('[name="jobDescriptionText"]')).toHaveValue(/Synthetic description/);
  await expect(page.locator('[name="jobAdvertLink"]')).toHaveValue('https://www.linkedin.com/jobs/view/4242/');
  await expect(page.getByText(/Job 4242, revision 1 applied/)).toBeVisible();
});

test('an advert pasted from another job site is saved, chosen and applied without a LinkedIn reference', async ({page, app}) => {
  page.on('dialog', dialog => { throw new Error('No confirmation should be needed on an empty form: ' + dialog.message()); });
  await page.goto(app.url + '/');
  await page.getByText('Add an advert from any job site').click();
  await page.locator('[data-web-advert="jobAdvertLink"]').fill('https://www.reed.co.uk/jobs/synthetic-delivery-manager/555?utm_source=alert');
  await page.locator('[data-web-advert="jobTitle"]').fill('Synthetic Reed Delivery Manager');
  await page.locator('[data-web-advert="advertiserName"]').fill('Example Agency');
  await page.locator('[data-web-advert="jobDescriptionText"]').fill('Synthetic description for a delivery role advertised on a UK job board, with agile teams and stakeholders.');
  await page.getByRole('button', {name: 'Save advert'}).click();
  await expect(page.locator('[name="jobTitle"]')).toHaveValue('Synthetic Reed Delivery Manager');
  await expect(page.locator('[name="jobAdvertLink"]')).toHaveValue('https://www.reed.co.uk/jobs/synthetic-delivery-manager/555');
  await expect(page.locator('[name="organisationName"]')).toHaveValue('Example Agency');
  await expect(page.locator('[name="jobReference"]')).toHaveValue('');
  await expect(page.getByText(/Advert from reed\.co\.uk, revision 1 applied/)).toBeVisible();
  const choice = page.getByRole('combobox', {name: 'Choose a stored advert'});
  await expect(choice.locator('option:checked')).toHaveText(/reed\.co\.uk/);
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

test('a newly found email domain replaces the old one on the page, the application and the browser copy', async ({page, app}) => {
  await page.route('**/resolve-email-domain', route => route.fulfill({status: 202, contentType: 'application/json', body: JSON.stringify({ok: true, job: {jobId: 'job-1', status: 'queued'}})}));
  await page.route('**/api/email-domain-jobs/job-1', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, job: {jobId: 'job-1', status: 'completed', result: {emailDomain: 'new-domain.com', confidence: 'high'}}})}));
  await page.goto(app.url + '/applications/saved');
  const input = page.locator('#email-domain-input');
  await expect(input).toHaveValue('old-domain.co.uk');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nmp.lastSavedEmailDomain') || '{}').domain)).toBe('old-domain.co.uk');
  await page.getByRole('button', {name: 'Find email domain'}).click();
  await expect(page.locator('#email-domain-status')).toContainText('resolved and saved: new-domain.com');
  await expect(input).toHaveValue('new-domain.com');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nmp.lastSavedEmailDomain')).domain)).toBe('new-domain.com');
  await page.reload();
  await expect(page.locator('#email-domain-input')).toHaveValue('new-domain.com');
});

test('an email-domain lookup interrupted by a restart says so instead of breaking the page', async ({page, app}) => {
  // The start request is answered with a job id the server never created, as after a restart; the poll reaches the real server.
  await page.route('**/resolve-email-domain', route => route.fulfill({status: 202, contentType: 'application/json', body: JSON.stringify({ok: true, job: {jobId: 'lost-in-restart', status: 'queued'}})}));
  await page.goto(app.url + '/applications/saved');
  await page.getByRole('button', {name: 'Find email domain'}).click();
  await expect(page.locator('#email-domain-status')).toContainText('interrupted, usually because the app restarted');
  await expect(page.getByRole('button', {name: 'Find email domain'})).toBeEnabled();
});
