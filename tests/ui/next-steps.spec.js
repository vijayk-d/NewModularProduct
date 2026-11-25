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
const railLink = (page, label) => page.getByRole('navigation', {name: 'Application sections'}).locator(`a[data-base-label="${label}"]`);

test('the top bar stays as it was; the floating section rail stays on the left and carries the status', async ({page, app}) => {
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto(app.url + '/applications/r1');
  const bar = page.locator('header.nmp-shell');
  await expect(bar.getByRole('link', {name: 'New application', exact: true})).toBeVisible();
  await expect(bar.getByRole('link', {name: 'Next steps', exact: true})).toHaveAttribute('href', '/next-steps');
  await expect(bar.locator('[data-next-level], [data-activity-pill]')).toHaveCount(0);
  const rail = page.getByRole('navigation', {name: 'Application sections'});
  await expect(rail).toBeVisible();
  expect((await rail.boundingBox()).x).toBeLessThan(100);
  await expect(page.locator('[data-next-strip]')).toHaveCount(0);
});

test('every top bar link fits on the bar at common window widths', async ({page, app}) => {
  for (const width of [1024, 1280, 1366, 1440, 1536, 1600, 1641, 1920, 2560]) {
    await page.setViewportSize({width, height: 800});
    await page.goto(app.url + '/applications/r1');
    const fit = await page.locator('header.nmp-shell').evaluate(h => ({scroll: h.scrollWidth, client: h.clientWidth, right: h.querySelector('.nmp-shell__right').getBoundingClientRect().right, edge: h.getBoundingClientRect().right}));
    expect(fit.scroll, `bar overflows at ${width}px`).toBeLessThanOrEqual(fit.client);
    expect(fit.right, `badge cut off at ${width}px`).toBeLessThanOrEqual(fit.edge);
  }
  await page.locator('header.nmp-shell').getByRole('button', {name: 'Insights'}).hover();
  await expect(page.locator('header.nmp-shell').getByRole('link', {name: 'Evidence learning'})).toBeVisible();
});

test('a slow task lights its section on the rail: amber while running, green by itself when it finishes', async ({page, app}) => {
  await page.goto(app.url + '/applications/r1');
  const polishing = railLink(page, 'Polishing');
  await expect(polishing).toHaveCount(1);
  await expect(polishing.locator('.nmp-rail-light')).toHaveCount(0);
  const id = app.activityLog.start({kind: 'polish', reviewId: 'r1'});
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('nmp-activity-started')));
  await expect(polishing.locator('.nmp-rail-light')).toHaveAttribute('data-level', 'amber');
  await expect(polishing.locator('.nmp-rail-light')).toHaveAttribute('data-running', 'true');
  await expect(polishing).toHaveAttribute('aria-label', 'Polishing — Polishing letter… (still running)');
  app.activityLog.finish(id);
  await expect(polishing.locator('.nmp-rail-light')).toHaveAttribute('data-level', 'green', {timeout: 6000});
  await expect(polishing).toHaveAttribute('title', 'Polishing — Letter polished ✓');
  await page.reload();
  await expect(railLink(page, 'Polishing').locator('.nmp-rail-light')).toHaveAttribute('data-level', 'green', {timeout: 6000});
  await railLink(page, 'Polishing').click();
  await expect.poll(async () => (await page.evaluate(async () => (await fetch('/api/activity')).json())).items.length).toBe(0);
});

test('desktop notifications are switched on from Next steps; a page can start a contact import for its application', async ({page, app}) => {
  await page.goto(app.url + '/next-steps');
  // Headless Chromium reports notifications as blocked; a real browser asks once from the button.
  const permission = await page.evaluate(() => Notification.permission);
  await expect(page.locator('[data-notify-status]')).toContainText(permission === 'granted' ? 'Desktop notifications are on' : permission === 'denied' ? 'blocked for this site' : 'Get a desktop notification');
  await expect(page.locator('[data-next-group="amber"] h2')).toHaveText('Next step ready (1)');
  const started = await page.evaluate(async () => (await fetch('/api/activity/contacts', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({reviewId: 'r1'})})).status);
  expect(started).toBe(200);
  const missing = await page.evaluate(async () => (await fetch('/api/activity/contacts', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({reviewId: 'nope'})})).status);
  expect(missing).toBe(404);
  const activity = await page.evaluate(async () => (await fetch('/api/activity')).json());
  expect(activity.items.map(a => [a.kind, a.label, a.state])).toEqual([['contacts', 'Importing contacts', 'running']]);
});
