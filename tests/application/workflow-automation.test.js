import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createWorkflowAutomationStore} from '../../src/infrastructure/applications/sqlite-workflow-automation-store.js';
import {createOrganisationResearchService, organisationKey} from '../../src/application/organisation-research-cache.js';
import {deriveAdvertStatus, IDLE_DAYS} from '../../src/application/advert-workflow-status.js';
import {followUpsDue} from '../../src/application/history-dashboard.js';
import {markSameOrganisation} from '../../src/interfaces/http/create-local-server.js';
import {createApplicationPackExporter} from '../../src/infrastructure/applications/application-pack-exporter.js';
import {reviewEditorState} from '../../src/application/save-application-review.js';

const DAY = 864e5;
const found = name => ({status: 'found', provider: 'Perplexity', summary: name + ' summary', companyValues: ['Integrity'], sources: []});
function setup({now = Date.parse('2026-11-16T10:00:00Z'), dailyCap = 10, enabled = true, result = null} = {}) {
  const clock = {now};
  const store = createWorkflowAutomationStore({filePath: ':memory:', clock: () => clock.now});
  const calls = [];
  const research = async request => { calls.push(request); if (result instanceof Error) throw result; return result || found(request.companyName); };
  const service = createOrganisationResearchService({store, research, enabled, dailyCap, clock: () => clock.now});
  return {clock, store, calls, service};
}

test('organisation names match across common suffixes and spacing', () => {
  assert.equal(organisationKey('Example Holdings Ltd'), organisationKey('  example   holdings LIMITED '));
  assert.equal(organisationKey('Barclays UK PLC'), 'barclays');
  assert.equal(organisationKey(''), '');
});

test('first application researches once; later applications and reloads reuse it with no paid call', async () => {
  const {calls, service} = setup();
  const first = await service.forNewApplication({organisationName: 'Example Ltd', jobTitle: 'Scrum Master'});
  assert.equal(first.source, 'automatic');
  assert.equal(first.research.automatic, true);
  assert.deepEqual(calls.map(c => c.companyName), ['Example Ltd']);
  const second = await service.forNewApplication({organisationName: 'example limited', jobTitle: 'Delivery Lead'});
  assert.equal(second.source, 'cache');
  assert.equal(second.research.reusedFromCache, true);
  assert.equal(second.research.summary, 'Example Ltd summary');
  assert.equal(calls.length, 1);
});

test('research older than 30 days is refreshed once', async () => {
  const {clock, calls, service} = setup();
  await service.forNewApplication({organisationName: 'Example'});
  clock.now += 31 * DAY;
  assert.equal((await service.forNewApplication({organisationName: 'Example'})).source, 'automatic');
  assert.equal(calls.length, 2);
});

test('a failed call is shown, not cached and not retried, and uses the daily allowance', async () => {
  const {calls, store, service} = setup({result: new Error('Provider unavailable')});
  const r = await service.forNewApplication({organisationName: 'Example'});
  assert.equal(r.research.status, 'error');
  assert.match(r.research.error, /Provider unavailable/);
  assert.equal(calls.length, 1);
  assert.equal(store.getResearch(organisationKey('Example')), null);
  assert.equal(store.automaticCallsToday(), 1);
});

test('daily cap and the off switch stop automatic calls', async () => {
  const capped = setup({dailyCap: 1});
  await capped.service.forNewApplication({organisationName: 'One'});
  const r = await capped.service.forNewApplication({organisationName: 'Two'});
  assert.equal(r.source, 'skipped');
  assert.match(r.reason, /Daily automatic research limit \(1\)/);
  assert.equal(capped.calls.length, 1);
  const off = setup({enabled: false});
  assert.equal((await off.service.forNewApplication({organisationName: 'One'})).source, 'skipped');
  assert.equal(off.calls.length, 0);
  assert.equal((await setup().service.forNewApplication({organisationName: '  '})).source, 'skipped');
});

test('manual research refreshes the shared copy used by later applications', async () => {
  const {calls, service} = setup({enabled: false});
  service.recordManual('Example Ltd', found('Manual'));
  service.recordManual('Other', {status: 'error', error: 'x'});
  const r = await service.forNewApplication({organisationName: 'Example'});
  assert.equal(r.source, 'cache');
  assert.equal(r.research.summary, 'Manual summary');
  assert.equal((await service.forNewApplication({organisationName: 'Other'})).source, 'skipped');
  assert.equal(calls.length, 0);
});

test('workflow store keeps its own file and refuses an unrecognised database', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-store-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'workflow-automation-v1.db');
  const store = createWorkflowAutomationStore({filePath: file, clock: () => 1000});
  store.recordPortalExport('r1', 'https://www.linkedin.com/jobs/view/123/');
  assert.deepEqual(store.portalExports(), [{reviewId: 'r1', jobAdvertLink: 'https://www.linkedin.com/jobs/view/123/', exportedAt: 1000}]);
  store.close();
  const other = path.join(dir, 'other.db');
  const db = new DatabaseSync(other); db.exec('CREATE TABLE something(x)'); db.close();
  assert.throws(() => createWorkflowAutomationStore({filePath: other}), /Unrecognised workflow automation database/);
});

test('advert status: portal export completes, idle work needs attention, recent work stays in progress', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');
  const review = (updatedAt) => [{id: 'r', updatedAt: new Date(updatedAt).toISOString(), value: {formData: {jobAdvertLink: 'https://www.linkedin.com/jobs/view/123/'}, createdAt: updatedAt}}];
  const exported = deriveAdvertStatus({jobId: '123', reviews: review(now - 20 * DAY), exports: [{reviewId: 'r', jobAdvertLink: 'https://www.linkedin.com/jobs/view/123/', exportedAt: now - DAY}], now});
  assert.deepEqual([exported.status, exported.label, exported.exported], ['complete', 'Complete — portal pack exported', true]);
  const idle = deriveAdvertStatus({jobId: '123', reviews: review(now - (IDLE_DAYS + 1) * DAY), now});
  assert.deepEqual([idle.status, idle.idle], ['needs_attention', true]);
  assert.match(idle.label, /no activity for 14 days/);
  assert.equal(deriveAdvertStatus({jobId: '123', reviews: review(now - 2 * DAY), now}).status, 'in_progress');
  assert.equal(deriveAdvertStatus({jobId: '123', now}).status, 'new');
});

test('follow-ups list sent applications with no later activity for 7 to 60 days, oldest first', () => {
  const now = Date.parse('2026-11-16T10:00:00Z'), ago = d => new Date(now - d * DAY).toISOString();
  const rows = [
    {organisation: 'A', role: 'R1', kinds: ['prepared', 'email_sent'], lastActivity: ago(10)},
    {organisation: 'B', role: 'R2', kinds: ['email_sent'], lastActivity: ago(3)},
    {organisation: 'C', role: 'R3', kinds: ['prepared'], lastActivity: ago(20)},
    {organisation: 'D', role: 'R4', kinds: ['email_sent'], lastActivity: ago(30)},
    {organisation: 'E', role: 'R5', kinds: ['email_sent'], lastActivity: ago(90)}
  ];
  assert.deepEqual(followUpsDue(rows, {now}).map(r => [r.organisation, r.daysSince]), [['D', 30], ['A', 10]]);
});

test('newly imported contacts from the application domain are marked and listed first', () => {
  const contacts = [{id: '1', emailDomain: 'other.test'}, {id: '2', emailDomain: 'Example.TEST'}, {id: '3', organisationId: 'domain:example.test'}];
  const marked = markSameOrganisation(contacts, 'domain:example.test');
  assert.deepEqual(marked.map(c => [c.id, c.sameOrganisation]), [['2', true], ['3', true], ['1', false]]);
  assert.deepEqual(markSameOrganisation(contacts, undefined).map(c => c.sameOrganisation), [false, false, false]);
});

test('a complete export pack is recorded once; recording problems never block the download', async t => {
  const plain = 'Dear Hiring Manager,\n\nI led delivery.\n\nKind regards,\nTest';
  const row = {currentDraftPlainText: plain, currentDraftHtml: plain.replace(/\n/g, '<br>'), currentDraftSubject: 'S', formData: {jobTitle: 'Role', organisationName: 'Org', jobAdvertLink: 'https://www.linkedin.com/jobs/view/9/'}};
  const store = new Map([['r', row]]), v = reviewEditorState(row);
  const request = {reviewId: 'r', expectedBodyVersion: v.bodyVersion, expectedSubjectVersion: v.subjectVersion, expectedRevision: v.revision, includeCv: false};
  const recorded = [];
  const docs = async () => [{name: 'cover-letter.docx', bytes: Buffer.from('PK')}, {name: 'cover-letter.pdf', bytes: Buffer.from('%PDF-')}, {name: 'cover-letter-export.json', bytes: Buffer.from('{}')}];
  await createApplicationPackExporter({cvFolder: os.tmpdir(), documents: docs, recordExport: (...a) => recorded.push(a)})({store, request});
  assert.deepEqual(recorded, [['r', 'https://www.linkedin.com/jobs/view/9/']]);
  const result = await createApplicationPackExporter({cvFolder: os.tmpdir(), documents: docs, recordExport: () => { throw Error('disk full'); }})({store, request});
  assert.ok(Buffer.isBuffer(result.bytes));
  await assert.rejects(createApplicationPackExporter({cvFolder: os.tmpdir(), documents: async () => [], recordExport: () => assert.fail('must not record a failed pack')})({store, request}), /Incomplete/);
});
