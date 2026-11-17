import {test as base, expect} from '@playwright/test';
import {once} from 'node:events';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {createCvTailoringService} from '../../src/application/cv-tailoring.js';
import {createCvTailoringStore} from '../../src/infrastructure/applications/sqlite-cv-tailoring-store.js';
import {buildCvPolishApiRequest} from '../../src/infrastructure/refinement/perplexity-cv-polishing-adapter.js';
import {fakeWorker, reviewFixture} from '../fixtures/cv-tailoring-fixtures.js';

// Fake polisher: no network. 'figures' returns an invented figure so the page must flag it.
const test = base.extend({polish: ['good', {option: true}], app: async ({polish}, use) => {
  const calls = [];
  const polisher = {available: polish !== 'off', buildRequest: buildCvPolishApiRequest, async polish(request, model) {
    calls.push({request, model});
    if (polish === 'slow') await new Promise(r => setTimeout(r, 1500));
    return {result: {summary: [polish === 'figures' ? 'Saved £9M for clients.' : 'Polished delivery leader for Agile programmes.'], keyAchievements: ['Led a 40-person Agile programme.', 'Cut costs by 10% through vendor consolidation.'], employers: [], notes: 'Kept your figures.'},
      response: {model, usage: {cost: {total_cost: 0.0003}}}, durationMs: 3};
  }};
  const reviews = reviewFixture();
  const service = createCvTailoringService({reviews, store: createCvTailoringStore({filePath: ':memory:'}), worker: fakeWorker([]), cvFolder: 'C:/cv', cvLibrary: async () => [{role_code: 'PM', local_path: 'PM/PM_CV.pdf'}], polisher});
  const server = createLocalServer({applicationReviewStore: reviews, cvTailoringService: service, candidateDisplayName: 'Test Candidate',
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await use({url: 'http://127.0.0.1:' + server.address().port, calls}); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}});

async function drafted(page, app) {
  await page.goto(app.url + '/applications/r1');
  const section = page.locator('#tailored-cv');
  await section.getByRole('button', {name: 'Draft tailored CV'}).click();
  await expect(section.locator('[data-tailored-status]')).toContainText('Found');
  return section;
}

test('estimate, choose a model, confirm, review, undo, polish again and build', async ({page, app}) => {
  const section = await drafted(page, app);
  const profile = section.getByLabel(/^Profile \(blank line/);
  await section.getByRole('button', {name: 'Polish wording (paid)…'}).click();
  const model = section.getByLabel('Polishing model');
  await expect(model).toBeVisible();
  expect(app.calls).toHaveLength(0);
  const options = await model.locator('option').allTextContents();
  expect(options.length).toBeGreaterThan(1);
  await model.selectOption({index: options.length - 1});
  await expect(section.locator('[data-tailored-polish-send]')).toContainText(options.at(-1).split(' (')[0]);
  await section.locator('[data-tailored-polish-send]').click();
  await expect(profile).toHaveValue('Polished delivery leader for Agile programmes.');
  await expect(section.locator('[data-tailored-polish-status]')).toContainText('Check every line, then Build');
  expect(app.calls).toHaveLength(1);
  expect(app.calls[0].model).not.toBe('anthropic/claude-haiku-5-5');

  // Before and after, per section, with a choice per section.
  const compare = section.locator('[data-tailored-polish-compare]');
  const summary = compare.locator('[data-compare-section="Profile"]');
  await expect(summary.getByRole('heading', {name: 'Profile: 1 of 1 lines changed'})).toBeVisible();
  const row = summary.locator('tbody tr').first();
  await expect(row).toHaveAttribute('data-change', 'changed');
  await expect(row.locator('td').nth(0)).toHaveText('Delivery leader across programmes.');
  await expect(row.locator('textarea')).toHaveValue('Polished delivery leader for Agile programmes.');
  // The polished column is editable and updates the box above.
  await row.locator('textarea').fill('Polished delivery leader for Agile programmes, edited.');
  await expect(profile).toHaveValue('Polished delivery leader for Agile programmes, edited.');
  await expect(summary.locator('[data-compare-using]')).toHaveText('Using the polished wording with your edits.');
  await expect(summary).toHaveClass(/tone-0/);
  await expect(row.locator('td').nth(2)).toHaveText('Reworded');
  await expect(compare.locator('[data-compare-section="Key Achievements"] tbody tr')).not.toHaveCount(0);
  await summary.getByRole('button', {name: 'Use previous wording'}).click();
  await expect(profile).toHaveValue('Delivery leader across programmes.');
  await expect(summary.locator('[data-compare-using]')).toHaveText('Using your previous wording.');
  await summary.getByRole('button', {name: 'Use polished wording'}).click();
  await expect(profile).toHaveValue('Polished delivery leader for Agile programmes, edited.');

  await section.getByRole('button', {name: 'Undo polish'}).click();
  await expect(profile).toHaveValue('Delivery leader across programmes.');

  await section.getByRole('button', {name: 'Polish wording (paid)…'}).click();
  await section.locator('[data-tailored-polish-send]').click();
  await expect(profile).toHaveValue('Polished delivery leader for Agile programmes.');
  await section.getByRole('button', {name: 'Build tailored CV (DOCX)'}).click();
  await expect(section.locator('[data-tailored-build-status]')).toContainText('version 1 built');
});

test.describe('a polish that invents a figure', () => {
  test.use({polish: 'figures'});
  test('is flagged and the build refuses it', async ({page, app}) => {
    const section = await drafted(page, app);
    await section.getByRole('button', {name: 'Polish wording (paid)…'}).click();
    await section.locator('[data-tailored-polish-send]').click();
    await expect(section.locator('[data-tailored-polish-problems]')).toContainText('£9m');
    await section.getByRole('button', {name: 'Build tailored CV (DOCX)'}).click();
    await expect(section.locator('[data-tailored-build-status]')).toContainText('£9m');
  });
});

test.describe('with polishing turned off', () => {
  test.use({polish: 'off'});
  test('explains the setting and sends nothing', async ({page, app}) => {
    const section = await drafted(page, app);
    await section.getByRole('button', {name: 'Polish wording (paid)…'}).click();
    await expect(section.locator('[data-tailored-polish-status]')).toContainText('ENABLE_COVER_LETTER_REFINEMENT');
    await expect(section.locator('[data-tailored-polish-send]')).toHaveCount(0);
    expect(app.calls).toHaveLength(0);
  });
});

test.describe('while the model is working', () => {
  test.use({polish: 'slow'});
  test('the Polish panel shows it is busy and the boxes stay editable', async ({page, app}) => {
    const section = await drafted(page, app);
    const progress = section.locator('[data-tailored-polish-progress]');
    await section.getByRole('button', {name: 'Polish wording (paid)…'}).click();
    await section.locator('[data-tailored-polish-send]').click();
    await expect(progress).toBeVisible();
    await expect(section.locator('[data-tailored-polish]')).toHaveAttribute('aria-busy', 'true');
    await expect(section.locator('[data-tailored-polish-send]')).toBeDisabled();
    await expect(section.getByRole('button', {name: 'Cancel'})).toBeDisabled();
    await expect(section.getByRole('button', {name: 'Polish wording (paid)…'})).toBeDisabled();
    const bullets = section.getByLabel(/^Key Achievements \(one bullet/);
    await bullets.fill('Led a 40-person Agile programme.');
    await expect(bullets).toHaveValue('Led a 40-person Agile programme.');
    await expect(section.locator('[data-tailored-polish-status]')).toContainText('Check every line, then Build');
    await expect(progress).toBeHidden();
    await expect(section.locator('[data-tailored-polish]')).toHaveAttribute('aria-busy', 'false');
    expect(app.calls).toHaveLength(1);
  });
});
