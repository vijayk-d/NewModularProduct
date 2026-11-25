import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';
import {createActivityLog} from '../../src/application/activity-log.js';

const test = base.extend({app: async ({}, use) => {
  const reviews = reviewFixture();
  reviews.summaries = () => ({items: [{id: 'r1', organisation: 'Example Ltd', jobTitle: 'Delivery Manager', updatedAt: new Date().toISOString()}], total: 1, page: 1, pages: 1});
  const queue = [], activityLog = createActivityLog({nameFor: () => 'Example Ltd'});
  const server = createLocalServer({applicationReviewStore: reviews, activityLog,
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => queue, listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port, queue, activityLog}); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}});

test('the bar shows what to click next; the application shows its own next step; the pill opens the list', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  const pill = page.locator('.nmp-shell__next');
  await expect(pill).toHaveAttribute('data-next-level', 'amber');
  await expect(pill).toContainText('1 to do');
  const strip = page.locator('[data-next-strip]');
  await expect(strip).toContainText('Next step: Find contacts and queue the email');
  await expect(strip.getByRole('link', {name: 'Go'})).toHaveAttribute('href', '/applications/r1#email-domain-resolution');
  await pill.click();
  await expect(page).toHaveURL(/\/next-steps$/);
  await expect(page.locator('[data-next-group="amber"] h2')).toHaveText('Next step ready (1)');
  await expect(page.locator('[data-review-id="r1"]')).toContainText('Example Ltd · Delivery Manager');
  app.queue.push({id: 'q1', reviewId: 'r1', status: 'send_unknown', email: 'a@b.test'});
  await page.waitForTimeout(8100);
  await page.reload();
  await expect(page.locator('.nmp-shell__next')).toHaveAttribute('data-next-level', 'red');
  await expect(page.locator('[data-review-id="r1"]')).toContainText('Check 1 uncertain or failed send');
});

test('a slow task shows amber while running and turns green by itself when it finishes; opening it clears it', async ({page, app}) => {
  const id = app.activityLog.start({kind: 'polish', reviewId: 'r1'});
  await page.goto(app.url + '/next-steps');
  const pill = page.locator('[data-activity-pill]');
  await expect(pill).toHaveAttribute('data-activity-state', 'running');
  await expect(pill).toContainText('Polishing letter: Example Ltd…');
  app.activityLog.finish(id);
  await expect(pill).toHaveAttribute('data-activity-state', 'done', {timeout: 6000});
  await expect(pill).toContainText('Letter polished: Example Ltd ✓');
  await expect(pill).toHaveAttribute('data-next-level', 'green');
  await pill.click();
  await expect(page).toHaveURL(/\/applications\/r1#proposed-cover-letter$/);
  await expect(page.locator('[data-activity-pill]')).toBeHidden();
});
