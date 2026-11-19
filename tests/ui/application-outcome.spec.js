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
