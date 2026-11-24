// Tampermonkey contact bridge v0.8.0: automatic import only for tabs the app opened, when the app's tick box is ticked.
// Runs the real userscript on local stand-in pages with stubbed GM_* functions; nothing reaches LinkedIn.
import {test as base, expect} from '@playwright/test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';

const SCRIPT = readFileSync(new URL('../../tampermonkey/Clean-LinkedIn-Contact-Bridge-v0.8.0-dual-port.user.js', import.meta.url), 'utf8');
const card = (name, role) => `<li><a href="https://www.linkedin.com/in/${name.toLowerCase().replace(/\s+/g, '-')}/" aria-label="View ${name} profile"><span>${name}</span></a><div>${role}</div><div>London, United Kingdom</div></li>`;
const PEOPLE = `<!doctype html><html><body><main><ul>${card('Alex Morgan', 'Head of Talent Acquisition at Acme')}${card('Sam Patel', 'Engineering Director at Acme')}</ul></main></body></html>`;
const APP = `<!doctype html><html><body><nav><label><input type="checkbox" data-auto-import-tabs checked> Import contacts automatically from these tabs</label><button type="button" data-open-search-tabs='["https://www.linkedin.com/company/acme/people/?keywords=talent","https://www.linkedin.com/search/results/people/?keywords=director&currentCompany=%5B%22123%22%5D"]'>Open tabs</button></nav></body></html>`;

const test = base.extend({site: async ({}, use) => {
  const server = createServer((req, res) => { res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(req.url.startsWith('/app') ? APP : PEOPLE); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use('http://127.0.0.1:' + server.address().port); } finally { await new Promise(r => server.close(r)); }
}});

// GM stubs: storage in window.__gm, requests recorded in window.__requests and answered with a confirmed receipt.
async function load(page, url, {store = {}, hostname = 'www.linkedin.com'} = {}) {
  await page.addInitScript(({store, hostname}) => {
    window.__gm = store; window.__requests = []; window.__nmpTestHostname = hostname; window.__nmpAutoStepMs = 100; window.__nmpAutoWaitMs = 3000;
    window.GM_getValue = (k, d) => (k in window.__gm ? JSON.parse(JSON.stringify(window.__gm[k])) : d);
    window.GM_setValue = (k, v) => { window.__gm[k] = JSON.parse(JSON.stringify(v)); };
    window.GM_xmlhttpRequest = o => { const body = JSON.parse(o.data); window.__requests.push({url: o.url, count: body.recruiters.length, domain: body.emailDomain});
      setTimeout(() => o.onload({status: 200, finalUrl: o.url, responseText: JSON.stringify({ok: true, imported: body.recruiters.length, duplicates: 0})}), 10); return {abort() {}}; };
  }, {store, hostname});
  await page.goto(url);
  await page.addScriptTag({content: SCRIPT});
}
const pending = (url, extra = {}) => ({pendingAutoTabs: {origin: 'http://127.0.0.1:3000', createdAt: Date.now(), entries: [{url, used: false}]}, emailDomain: {domain: 'acme.test', organisation: 'Acme', savedAt: ''}, ...extra});

test('on the app, clicking a search-tab button remembers those tabs for automatic import', async ({page, site}) => {
  await load(page, site + '/app', {hostname: '127.0.0.1'});
  await page.evaluate(() => { window.open = () => null; });
  await page.getByRole('button', {name: 'Open tabs'}).click();
  const stored = await page.evaluate(() => window.__gm.pendingAutoTabs);
  expect(stored.origin).toBe(site);
  expect(stored.entries.map(e => e.url)).toHaveLength(2);
  expect(stored.entries.every(e => e.used === false)).toBe(true);
  expect(stored.auto).toBe(true);
  await expect(page.locator('#nmp-bridge-toast')).toContainText('the 2 LinkedIn tab(s) just opened will import their contacts into this app');
});

test('a tab opened by the app imports its visible contacts into that app automatically', async ({page, site}) => {
  await load(page, site + '/company/acme/people/?keywords=talent&origin=COMPANY_PAGE', {store: pending('https://www.linkedin.com/company/acme/people/?keywords=talent', {destination: 'both'})});
  const panel = page.getByRole('region', {name: 'LinkedIn contact import review'});
  await expect(panel.getByRole('heading')).toContainText('Automatic import: 2 clean LinkedIn contact(s) to Development (3000)');
  await expect(panel.getByRole('status')).toContainText('Development (3000): CONFIRMED — 2 imported');
  const requests = await page.evaluate(() => window.__requests);
  expect(requests).toEqual([{url: 'http://127.0.0.1:3000/api/recruiters/import', count: 2, domain: 'acme.test'}]);
  const gm = await page.evaluate(() => window.__gm);
  expect(gm.destination).toBe('both');
  expect(gm.pendingAutoTabs.entries[0].used).toBe(true);
});

test('pages not opened by the app, or with automatic import switched off, wait for the Import button', async ({page, site}) => {
  await load(page, site + '/company/acme/people/?keywords=talent', {store: {emailDomain: {domain: 'acme.test'}}});
  await expect(page.getByRole('button', {name: 'Import clean LinkedIn contacts'})).toBeVisible();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__requests.length)).toBe(0);
  await expect(page.getByRole('region', {name: 'LinkedIn contact import review'})).toHaveCount(0);
});

test('switched off: no automatic import even for a tab the app opened', async ({page, site}) => {
  await load(page, site + '/company/acme/people/?keywords=talent', {store: pending('https://www.linkedin.com/company/acme/people/?keywords=talent', {autoImport: false})});
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__requests.length)).toBe(0);
});

test('without a saved domain, automatic import explains itself and sends nothing', async ({page, site}) => {
  const store = pending('https://www.linkedin.com/company/acme/people/?keywords=talent'); delete store.emailDomain;
  await load(page, site + '/company/acme/people/?keywords=talent', {store});
  await expect(page.getByRole('region', {name: 'LinkedIn contact import review'}).getByRole('status')).toContainText('no business domain is saved');
  expect(await page.evaluate(() => window.__requests.length)).toBe(0);
  await page.locator('[data-nmp-auto-switch]').uncheck();
  expect(await page.evaluate(() => window.__gm.autoImport)).toBe(false);
});

test('unticking the app box makes the opened tabs wait for the Import button', async ({page, site}) => {
  await load(page, site + '/app', {hostname: '127.0.0.1'});
  await page.evaluate(() => { window.open = () => null; });
  await page.locator('[data-auto-import-tabs]').uncheck();
  await page.getByRole('button', {name: 'Open tabs'}).click();
  expect(await page.evaluate(() => window.__gm.pendingAutoTabs.auto)).toBe(false);
  await expect(page.locator('#nmp-bridge-toast')).toContainText('automatic import is unticked on this page');
});

test('a tab opened while the app box was unticked does not import', async ({page, site}) => {
  const store = pending('https://www.linkedin.com/company/acme/people/?keywords=talent'); store.pendingAutoTabs.auto = false;
  await load(page, site + '/company/acme/people/?keywords=talent', {store});
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__requests.length)).toBe(0);
  await expect(page.getByRole('button', {name: 'Import clean LinkedIn contacts'})).toBeVisible();
});

