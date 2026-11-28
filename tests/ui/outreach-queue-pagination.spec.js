import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseQueuePageQuery, filterQueueItems, sortQueueItems, pageQueueItems, isSchedulableQueueItem, queueStatuses } from '../../src/application/outreach-queue-page.js';

// Synthetic queue of 3000 rows; the fake server pages with the same pure functions as the real API.
const ORIGIN = 'http://127.0.0.1:31297';
function makeItems() {
  return Array.from({ length: 3000 }, (_, i) => {
    const status = i % 3 === 2 ? 'sent' : i % 3 === 1 ? 'drafted' : 'new';
    return { id: 'q' + i, applicationKey: 'app' + i, reviewId: 'r1', contactId: 'c' + i, email: `person${i}@example.test`,
      fullName: 'Person ' + String(i).padStart(4, '0'), role: 'Delivery Manager', status, lastOutcome: '', verified: true,
      subject: 'Synthetic application', bodyPlainText: 'Synthetic letter.', application: { organisationName: 'Example Ltd' },
      letterGate: { allowed: true }, sendAction: { eligible: status !== 'sent', mode: status === 'sent' ? 'repeat' : status === 'drafted' ? 'draft' : 'new', label: 'Send' } };
  });
}
async function fixture(page) {
  let items = makeItems();
  const listRequests = [], deletes = [], itemReads = [];
  await page.route(ORIGIN + '/**', async route => {
    const url = new URL(route.request().url()), name = url.pathname.slice(1);
    if (url.pathname === '/outreach-queue') {
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><title>Outreach queue</title></head><body><main><h1>Outreach queue</h1></main><script type="module" src="/outreach-queue.js"></script></body></html>' });
      return;
    }
    if (name.endsWith('.js') || name.endsWith('.css')) {
      await route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript',
        body: await readFile(path.resolve('src/interfaces/http', name === 'outreach-queue.js' ? 'outreach-queue-browser.js' : name), 'utf8') });
      return;
    }
    let body = { ok: true };
    if (url.pathname === '/api/outreach-queue') {
      listRequests.push(url.searchParams);
      const query = parseQueuePageQuery(url.searchParams);
      let matching = sortQueueItems(filterQueueItems(items, query), query.sort);
      if (query.filter === 'schedulable') matching = matching.filter(isSchedulableQueueItem);
      const result = pageQueueItems(matching, query);
      body = { ok: true, ...result, scopeTotal: items.length, statuses: queueStatuses(items) };
    } else if (url.pathname === '/api/outreach-queue/items') {
      const ids = new Set(route.request().postDataJSON().ids); itemReads.push([...ids]);
      body = { ok: true, items: items.filter(item => ids.has(item.id)) };
    } else if (url.pathname === '/api/outreach-queue/delete') {
      const ids = new Set(route.request().postDataJSON().ids); deletes.push([...ids]);
      items = items.filter(item => !ids.has(item.id)); body = { ok: true, deleted: ids.size };
    } else if (url.pathname === '/api/outreach-queue/gmail-draft-status') body = { ok: true, draftCreationEnabled: false, configurationReady: false, blockedReasons: ['Disabled in this test.'], environment: [] };
    else if (url.pathname === '/api/outreach-queue/gmail-status') body = { ok: true, mailboxCheckEnabled: false, configurationReady: false };
    else if (url.pathname === '/api/outreach-queue/send-status') body = { ok: true, sendingEnabled: true, configuredMailbox: 'sender@example.test', reason: 'Synthetic fixture.', oneClickSendingEnabled: false };
    else if (url.pathname === '/api/outreach-queue/send-run') body = { ok: true, run: null };
    else if (url.pathname === '/api/outreach-queue/send-history') body = { ok: true, items: [], total: 0, page: 1, pages: 1 };
    else if (url.pathname === '/api/outreach-scheduling/status') body = { ok: true, enabled: false };
    else if (url.pathname === '/api/outreach-scheduling/list') body = { ok: true, jobs: [] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(ORIGIN + '/outreach-queue');
  return { listRequests, deletes, itemReads };
}
const rows = page => page.locator('.outreach-queue-body tr');
const info = page => page.locator('[data-queue-page-info]');

test('the queue shows one server page of 50 with page count and next and previous controls', async ({ page }) => {
  const state = await fixture(page);
  await expect(rows(page)).toHaveCount(50);
  await expect(info(page)).toHaveText('Page 1 of 60 · 1–50 of 3000');
  await expect(page.locator('.outreach-queue-status')).toHaveText('3000 queued recipient(s).');
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  expect(state.listRequests[0].get('limit')).toBe('50'); expect(state.listRequests[0].get('offset')).toBe('0');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(info(page)).toHaveText('Page 2 of 60 · 51–100 of 3000');
  await expect(rows(page).first()).toContainText('Person 0050');
  await expect(rows(page)).toHaveCount(50);
  expect(state.listRequests.at(-1).get('offset')).toBe('50');
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(rows(page).first()).toContainText('Person 0000');
});

test('the page size can be changed and paging restarts from page one', async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(info(page)).toContainText('Page 2 of 60');
  await page.getByLabel('Rows per page').selectOption('100');
  await expect(rows(page)).toHaveCount(100);
  await expect(info(page)).toHaveText('Page 1 of 30 · 1–100 of 3000');
  expect(state.listRequests.at(-1).get('limit')).toBe('100'); expect(state.listRequests.at(-1).get('offset')).toBe('0');
});

test('search, status filter and sort run on the server before paging', async ({ page }) => {
  const state = await fixture(page);
  await page.getByLabel('Search the queue').fill('person2999@');
  await page.getByLabel('Search the queue').press('Enter');
  await expect(rows(page)).toHaveCount(1);
  await expect(info(page)).toHaveText('Page 1 of 1 · 1–1 of 1 (filtered from 3000)');
  expect(state.listRequests.at(-1).get('q')).toBe('person2999@');
  await page.getByLabel('Search the queue').fill('');
  await page.getByRole('button', { name: 'Run queue search' }).click();
  await page.getByLabel('Filter by status').selectOption('sent');
  await expect(info(page)).toHaveText('Page 1 of 20 · 1–50 of 1000 (filtered from 3000)');
  await expect(page.locator('[data-queue-status]').filter({ hasText: /^sent/ })).toHaveCount(50);
  await page.getByLabel('Filter by status').selectOption('');
  await page.getByLabel('Sort queue').selectOption('newest');
  await expect(rows(page).first()).toContainText('Person 2999');
  expect(state.listRequests.at(-1).get('sort')).toBe('newest');
});

test('ticks are kept across pages and bulk actions use every ticked row', async ({ page }) => {
  const state = await fixture(page);
  await page.getByLabel('Select queued recipient Person 0000').check();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(rows(page).first()).toContainText('Person 0050');
  await page.getByLabel('Select queued recipient Person 0051').check();
  await expect(info(page)).toContainText('1 ticked on other pages');
  await expect(page.locator('[data-queue-action="delete"]')).toHaveText('Remove (2)');
  await expect(page.locator('[data-queue-action="send-selected"]')).toHaveText('Send 2 emails');
  expect(state.itemReads.at(-1)).toEqual(['q0']);
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(page.getByLabel('Select queued recipient Person 0000')).toBeChecked();
  await expect(page.getByLabel('Select all queue items on this page')).toHaveJSProperty('indeterminate', true);
  await page.locator('[data-queue-action="delete"]').click();
  await expect(page.locator('.outreach-queue-status')).toHaveText('2 queue item(s) removed. Sent history kept.');
  expect(state.deletes[0].sort()).toEqual(['q0', 'q51']);
  await expect(info(page)).toHaveText('Page 1 of 60 · 1–50 of 2998');
  await expect(page.locator('[data-queue-action="delete"]')).toHaveText('Remove (0)');
});

test('select all ticks only the current page', async ({ page }) => {
  await fixture(page);
  await page.getByLabel('Select all queue items on this page').check();
  await expect(page.locator('.outreach-queue-checkbox:checked')).toHaveCount(50);
  await expect(page.locator('[data-queue-action="delete"]')).toHaveText('Remove (50)');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('.outreach-queue-checkbox:checked')).toHaveCount(0);
  await expect(info(page)).toContainText('50 ticked on other pages');
  await expect(page.locator('[data-queue-select-note]')).toContainText('this page only');
  await expect(page.locator('.outreach-selection-count')).toContainText('50 selected');
});

test('Select next 20 schedulable ticks rows on the current page and the counts include other pages', async ({ page }) => {
  await fixture(page);
  await page.getByLabel('Select queued recipient Person 0000').check();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(rows(page).first()).toContainText('Person 0050');
  await page.getByRole('button', { name: 'Select next 20 schedulable' }).click();
  await expect(page.locator('.outreach-queue-checkbox:checked')).toHaveCount(20);
  await expect(page.locator('.outreach-selection-count')).toContainText('21 selected');
  await expect(page.locator('[data-queue-action="schedule-selected"]')).toHaveText('Schedule (20 of 21)');
});

test('Show only schedulable rows filters on the server from page one', async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(info(page)).toContainText('Page 2 of 60');
  await page.getByLabel('Show only schedulable rows').check();
  await expect(info(page)).toHaveText('Page 1 of 40 · 1–50 of 2000 (filtered from 3000)');
  expect(state.listRequests.at(-1).get('filter')).toBe('schedulable');
  await expect(page.locator('[data-queue-status]').filter({ hasText: /^sent/ })).toHaveCount(0);
  await page.getByLabel('Show only schedulable rows').uncheck();
  await expect(info(page)).toHaveText('Page 1 of 60 · 1–50 of 3000');
});
