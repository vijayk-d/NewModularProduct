import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

// A letter whose paragraph carries a background colour (for example pasted together with an editor box).
const THEMED = '<p style="background-color:#f3f9ff">Dear Sam,<br><br>I am applying for the Technology Product and Delivery Manager opportunity.<br><br>The role suits my experience.<br><br>Kind regards,<br>Test Candidate</p>';
const test = base.extend({app: async ({}, use) => {
  const reviews = reviewFixture(), r = reviews.get('r1');
  reviews.set('r1', {...r, currentDraftPlainText: 'Dear Sam,\n\nI am applying for the Technology Product and Delivery Manager opportunity.\n\nThe role suits my experience.\n\nKind regards,\nTest Candidate', currentDraftHtml: THEMED});
  const server = createLocalServer({applicationReviewStore: reviews, recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port}); }
  finally { server.closeAllConnections(); await new Promise(res => server.close(res)); }
}});

test('highlighting inside a paragraph with a background never splits it into copies', async ({page, app}) => {
  page.on('dialog', d => d.accept());
  await page.goto(app.url + '/applications/r1');
  const editor = page.locator('#cover-letter-draft');
  await expect(editor.locator('p[style*="background"]')).toHaveCount(1);
  const before = await editor.innerText();
  await editor.evaluate(e => { const w = document.createTreeWalker(e, 4); let n; while ((n = w.nextNode()) && !n.data.includes('Technology')); const at = n.data.indexOf('Technology'); const r = document.createRange(); r.setStart(n, at); r.setEnd(n, at + 'Technology'.length); e.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await page.getByRole('toolbar', {name: 'Cover letter formatting'}).locator('button[data-editor-command="toggleJobHighlight"]').dispatchEvent('mousedown');
  await expect(editor.locator('mark')).toHaveText(['Technology']);
  await expect(editor.locator('p')).toHaveCount(1);
  expect(await editor.innerText()).toBe(before);
  await page.getByRole('toolbar', {name: 'Cover letter formatting'}).locator('button[data-editor-command="clearAllHighlights"]').dispatchEvent('mousedown');
  await expect(editor.locator('mark')).toHaveCount(0);
  await expect(editor.locator('p')).toHaveCSS('background-color', 'rgb(243, 249, 255)');
});
