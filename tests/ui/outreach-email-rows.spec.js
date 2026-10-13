import { test, expect } from '@playwright/test';
import path from 'node:path';

const row = `<tr><td><input type="checkbox" class="linked-contact-checkbox" value="c1"></td>
<td>Test Person</td><td class="contact-role-cell">Recruiter</td>
<td class="contact-email-cell"><a href="mailto:first@company.test">first@company.test</a>
<a href="mailto:second@company.test">second@company.test</a></td><td>LinkedIn profile</td></tr>`;
async function fixture(page) {
  const additions = [];
  await page.route('http://127.0.0.1:31299/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/outreach-queue/add') {
      additions.push(route.request().postDataJSON());
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, added: additions.at(-1).recipients.length, duplicates: 0 }) });
    } else if (url.pathname === '/api/outreach-queue') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, items: [] }) });
    } else {
      await route.fulfill({ contentType: 'text/html', body: `<main><section class="review-section">
        <table><tbody class="linked-imported-contacts-body">${row}</tbody></table>
        <div class="linked-contact-actions"><button data-review-id="r1">Unlink selected</button></div>
        <div id="cover-letter-draft" contenteditable="true">Edited draft.</div></section></main>` });
    }
  });
  await page.goto('http://127.0.0.1:31299/');
  await page.addScriptTag({ path: path.resolve('src/interfaces/http/outreach-queue-browser.js'), type: 'module' });
  await expect(page.locator('.linked-imported-contacts-body tr')).toHaveCount(2);
  return additions;
}
test('email candidates become separate selectable rows and queue exact selected addresses', async ({ page }) => {
  const additions = await fixture(page);
  await expect(page.locator('.outreach-recipient-email')).toHaveCount(0);
  const rows = page.locator('.linked-imported-contacts-body tr');
  await expect(rows.nth(0)).toContainText('first@company.test');
  await expect(rows.nth(1)).toContainText('second@company.test');
  await rows.nth(1).locator('input').check();
  await page.getByRole('button', { name: 'Add selected to queue' }).click();
  await expect(page.locator('.outreach-queue-status')).toContainText('1 added');
  expect(additions[0].recipients).toEqual([{ contactId: 'c1', email: 'second@company.test' }]);
  await rows.nth(0).locator('input').check();
  await rows.nth(1).locator('input').check();
  await page.getByRole('button', { name: 'Add selected to queue' }).click();
  await expect(page.locator('.outreach-queue-status')).toContainText('2 added');
  expect(additions[1].recipients).toEqual([
    { contactId: 'c1', email: 'first@company.test' },
    { contactId: 'c1', email: 'second@company.test' }
  ]);
});
test('refreshed linked rows split once without accumulating duplicates', async ({ page }) => {
  await fixture(page);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(markup => { document.querySelector('.linked-imported-contacts-body').innerHTML = markup; }, row);
    await expect(page.locator('.linked-imported-contacts-body tr')).toHaveCount(2);
    await expect(page.locator('.linked-imported-contacts-body .outreach-recipient-email')).toHaveCount(0);
  }
});
