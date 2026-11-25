import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createApplicationInsightsStore} from '../../src/infrastructure/applications/sqlite-application-insights-store.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

const test = base.extend({app: async ({}, use) => {
  const server = createLocalServer({applicationReviewStore: reviewFixture(), insightsStore: createApplicationInsightsStore({filePath: ':memory:'}),
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port}); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}});

test('record an outcome with a date and note, see it on the saved list, and remove it with two clicks', async ({page, app}) => {
  page.on('dialog', d => { throw new Error('No browser dialog expected: ' + d.message()); });
  await page.goto(app.url + '/applications/r1');
  const section = page.locator('#application-outcome');
  await expect(section.getByRole('heading', {name: 'Outcome'})).toBeVisible();
  await expect(section.locator('[data-outcome-current]')).toHaveText('No outcome recorded yet.');
  await section.getByLabel('Outcome', {exact: true}).selectOption('interview');
  await section.getByLabel('Date').fill('2026-11-17');
  await section.getByLabel('Note').fill('Panel with the delivery director');
  await section.getByRole('button', {name: 'Record outcome'}).click();
  await expect(section.locator('[data-outcome-current]')).toHaveText('Current outcome: Interview, 17 Nov 2026.');
  await expect(section.locator('[data-outcome-history] li')).toContainText('Interview — Panel with the delivery director');
  await page.goto(app.url + '/applications');
  await expect(page.locator('[data-outcome-cell]').first()).toHaveText('Interview (2026-11-17)');
  await page.goto(app.url + '/applications/r1');
  const remove = page.locator('#application-outcome').getByRole('button', {name: 'Remove'});
  await remove.click();
  await expect(page.locator('#application-outcome').getByRole('button', {name: 'Click again to remove'})).toBeVisible();
  await page.locator('#application-outcome').getByRole('button', {name: 'Click again to remove'}).click();
  await expect(page.locator('#application-outcome [data-outcome-current]')).toHaveText('No outcome recorded yet.');
});

test('email opens are read from tracker alerts in Gmail and shown per contact on the Outcome section', async ({page}) => {
  const sent = [{id: 's1', reviewId: 'r1', status: 'sent', email: 'sam@agency.test', fullName: 'Sam Recruiter', subject: 'Application: Delivery Manager', sentAt: '2026-11-20T10:00:00Z'}];
  const reads = [];
  const server = createLocalServer({applicationReviewStore: reviewFixture(), insightsStore: createApplicationInsightsStore({filePath: ':memory:'}),
    gmailTrackingReader: async args => { reads.push(args); return {ok: true, alerts: [{messageId: 'a1', internalDate: Date.parse('2026-11-22T08:00:00Z'), subject: 'Mailsuite Daily Report Nov 22, 2026: 1 email tracked', text: ['Opened emails (1)', 'Application: Delivery Manager', 'Sent on Nov 21, 2026 at 9:00 AM', 'To: sam@agency.test'].join('\n')}]}; },
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => sent}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    await page.goto('http://127.0.0.1:' + server.address().port + '/applications/r1');
    const section = page.locator('#application-outcome');
    await expect(section.locator('[data-email-opens]')).toHaveText('Not checked yet.');
    expect(reads.length).toBe(0);
    await section.getByRole('button', {name: 'Check email opens (read-only)'}).click();
    await expect(section.locator('[data-email-opens]')).toContainText('Tracked emails to 1 contact: 1 opened; latest report 22 Nov.');
    await expect(section.locator('[data-email-opens]')).toContainText('1 new alert read.');
    await expect(section.locator('[data-email-opens-contacts]')).toContainText('Sam Recruiter: opened (once reported), latest 22 Nov');
    await page.reload();
    await expect(section.locator('[data-email-opens]')).toContainText('1 opened', {timeout: 5000});
    expect(reads.length).toBe(1);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
