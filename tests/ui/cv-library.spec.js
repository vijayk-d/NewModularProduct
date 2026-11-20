import {test as base, expect} from '@playwright/test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {installCvLibrary} from '../../src/interfaces/http/cv-library-v1.js';

const test = base.extend({lib: async ({}, use) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-library-ui-')), folder = path.join(root, 'documents');
  await fs.mkdir(path.join(root, 'config'));
  for (const [code, text] of [['SM', 'Scrum master coaching agile teams with Jira.'], ['DM', 'Delivery manager for AI programmes and risk management.']]) {
    await fs.mkdir(path.join(folder, code), {recursive: true});
    await fs.writeFile(path.join(folder, code, 'cv.pdf'), text);
  }
  await fs.writeFile(path.join(root, 'config', 'cv-library.json'), JSON.stringify({cvs: [
    {role_code: 'SM', role_name: 'Scrum Master', local_path: 'SM/cv.pdf', tags: ['scrum'], use_cases: [], priority: 'high'},
    {role_code: 'DM', role_name: 'Delivery Manager', local_path: 'DM/cv.pdf', tags: ['delivery'], use_cases: [], priority: 'medium'}]}));
  const server = http.createServer((req, res) => res.end('application'));
  const library = installCvLibrary(server, {mode: 'development', projectRoot: root, cataloguePath: path.join(root, 'config', 'cv-library.json'), cvFolder: folder, privateDirectory: path.join(root, 'output', 'cv-library-v1'),
    adapter: {async extract({relativePath}) { return {text: await fs.readFile(path.join(folder, ...relativePath.split('/')), 'utf8')}; }},
    describe: async e => ({word: {name: 'cv.docx', match: 'same-name'}, sections: e.role_code === 'DM' ? 'SUMMARY + EXPERIENCE (4 employers)' : 'PROFILE'})});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port, library, folder}); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await fs.rm(root, {recursive: true, force: true}); }
}});

test('cards show each CV, indexing updates their status, and search narrows the list', async ({page, lib}) => {
  page.on('dialog', d => { throw new Error('No dialog expected for indexing: ' + d.message()); });
  await page.goto(lib.url + '/cv-library');
  await expect(page.locator('.cv-card')).toHaveCount(2);
  await expect(page.locator('.cv-card[data-code="DM"] .chip')).toHaveText('Not indexed');
  await expect(page.locator('[data-library-summary]')).toContainText('2 CVs · 0 indexed and current · 2 need attention');
  await page.getByRole('group', {name: 'Indexing'}).getByRole('button', {name: 'Index changed CVs'}).click();
  await expect(page.locator('#status')).toContainText('2 indexed');
  const dm = page.locator('.cv-card[data-code="DM"]');
  await expect(dm.locator('.chip')).toHaveText('Indexed');
  await expect(dm).toContainText('SUMMARY + EXPERIENCE (4 employers)');
  await expect(dm).toContainText('cv.docx (same name as the PDF)');
  await expect(dm.locator('.terms span').first()).toBeVisible();
  await expect(page.locator('[data-library-summary]')).toContainText('2 indexed and current · 0 need attention');
  await page.getByLabel('Search').fill('scrum');
  await expect(page.locator('.cv-card')).toHaveCount(1);
  await page.getByLabel('Search').fill('');
  await fs.writeFile(path.join(lib.folder, 'DM', 'cv.pdf'), 'Changed delivery manager CV.');
  await page.getByRole('button', {name: 'Refresh'}).click();
  await expect(dm.locator('.chip')).toHaveText('Changed since indexing');
  await page.getByLabel('Show').selectOption('attention');
  await expect(page.locator('.cv-card')).toHaveCount(1);
});
