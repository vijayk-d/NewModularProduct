import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {mkdtempSync, rmSync, existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {normalizeWebImport, webAdvertId, canonicalAdvertUrl, isAdvertId, createMemoryWebAdvertRepository} from '../../src/application/web-advert-import.js';
import {createJobImportService, createMemoryJobImportRepository} from '../../src/application/linkedin-job-import.js';
import {listAdvertsWithStatus, deriveAdvertStatus} from '../../src/application/advert-workflow-status.js';
import {createJobImportHandler} from '../../src/interfaces/http/job-import-http.js';
import {selectStoredAdvert, applyImportedJob, showsAdvert, canonicalStoredAdvertUrl} from '../../src/interfaces/http/job-import-controls.js';

const description = 'We are looking for an experienced Delivery Manager to lead agile teams across a public-facing digital service. '.repeat(3);
const paste = (extra = {}) => ({jobAdvertLink: 'https://www.reed.co.uk/jobs/delivery-manager/123456?utm_source=alert&source=x#apply', jobTitle: 'Delivery Manager', jobDescriptionText: description, advertiserName: 'Example Recruitment', location: 'Leeds', ...extra});
const linkedin = id => ({schemaVersion: 1, source: 'linkedin', requestId: randomUUID(), jobId: id, jobAdvertLink: 'https://www.linkedin.com/jobs/view/' + id + '/', jobTitle: 'LinkedIn role', jobDescriptionText: 'A LinkedIn advert description.', advertiser: {name: 'Org'}, location: {text: 'UK', workplaceType: 'unknown'}, jobPosters: [], extraction: {readerVersion: 'test', extractedAt: '2026-11-01T12:00:00Z', descriptionStatus: 'unknown'}});
const service = () => createJobImportService(createMemoryJobImportRepository(), {webRepo: createMemoryWebAdvertRepository()});

test('a pasted advert gets a stable ID from its normalised link, ignoring tracking and #fragment', () => {
  const p = normalizeWebImport(paste());
  assert.equal(p.source, 'web');
  assert.equal(p.sourceSite, 'reed.co.uk');
  assert.equal(p.jobAdvertLink, 'https://www.reed.co.uk/jobs/delivery-manager/123456?source=x');
  assert.match(p.jobId, /^web-[a-f0-9]{16}$/);
  assert.equal(webAdvertId('https://www.reed.co.uk/jobs/delivery-manager/123456?source=x&utm_campaign=y'), p.jobId);
  assert.notEqual(webAdvertId('https://www.reed.co.uk/jobs/delivery-manager/999'), p.jobId);
  assert.equal(webAdvertId('https://www.linkedin.com/jobs/view/123/'), '', 'LinkedIn links keep their own ID');
  assert.equal(canonicalAdvertUrl('not a url'), '');
  assert.ok(isAdvertId(p.jobId) && isAdvertId('4473232043') && !isAdvertId('web-xyz') && !isAdvertId('1/2'));
  assert.deepEqual(p.jobPosters, []);
  assert.equal(p.advertiser.name, 'Example Recruitment');
});

test('pasted adverts are checked before they are stored', () => {
  for (const [delta, message] of [
    [{jobAdvertLink: 'https://www.linkedin.com/jobs/view/123/'}, /LinkedIn reader/],
    [{jobAdvertLink: 'http://www.reed.co.uk/jobs/1'}, /https/],
    [{jobAdvertLink: 'https://user:pw@reed.co.uk/jobs/1'}, /https/],
    [{jobAdvertLink: 'reed.co.uk/jobs/1'}, /full advert link/],
    [{jobTitle: ' '}, /Job title is required/],
    [{jobDescriptionText: 'Too short'}, /whole job description/],
    [{jobDescriptionText: 'x'.repeat(48001)}, /too long/],
    [{extra: 'field'}, /Unsupported/]
  ]) assert.throws(() => normalizeWebImport(paste(delta)), message, JSON.stringify(delta));
});

test('pasted adverts list beside LinkedIn imports; pasting again keeps the revision, changes add one', () => {
  const s = service();
  s.receive(linkedin('4473232043'));
  const a = s.receiveWeb(paste());
  assert.equal(a.revision, 1); assert.equal(a.duplicate, false);
  assert.equal(s.receiveWeb(paste()).duplicate, true);
  assert.equal(s.receiveWeb(paste({jobAdvertLink: 'https://www.reed.co.uk/jobs/delivery-manager/123456?source=x&utm_medium=email'})).revision, 1);
  const b = s.receiveWeb(paste({jobTitle: 'Senior Delivery Manager'}));
  assert.equal(b.revision, 2); assert.equal(b.importId, a.importId);
  const list = s.list({page: 1, pageSize: 50});
  assert.equal(list.total, 2);
  const web = list.items.find(i => i.source === 'web');
  assert.deepEqual([web.jobId, web.sourceSite, web.jobTitle, web.jobAdvertLink], [a.jobId, 'reed.co.uk', 'Senior Delivery Manager', 'https://www.reed.co.uk/jobs/delivery-manager/123456?source=x']);
  assert.equal(list.items.find(i => i.source === 'linkedin').jobId, '4473232043');
  assert.equal(s.lookup(a.jobId).jobTitle, 'Senior Delivery Manager');
  assert.equal(s.get(a.importId, 1).jobTitle, 'Delivery Manager');
  assert.deepEqual(s.setHidden(a.jobId, true), {jobId: a.jobId, hidden: true});
  assert.ok(s.hiddenIds().has(a.jobId));
  s.receiveWeb(paste({jobTitle: 'Changed again'}));
  assert.ok(!s.hiddenIds().has(a.jobId), 'a changed paste brings a removed advert back, as with the reader');
  assert.throws(() => createJobImportService(createMemoryJobImportRepository()).receiveWeb(paste()), /unavailable/);
});

test('advert status works for a pasted advert: saved work is In progress, a confirmed send is Complete', () => {
  const s = service(), id = s.receiveWeb(paste()).jobId;
  const form = {jobAdvertLink: 'https://www.reed.co.uk/jobs/delivery-manager/123456?source=x', jobTitle: 'Delivery Manager'};
  const outreach = sent => ({list: () => [], listSentEmails: () => sent, listSendAttempts: () => [], listDraftOperations: () => []});
  const reviews = new Map([['r1', {formData: form}]]);
  let r = listAdvertsWithStatus({service: s, reviews, outreach: outreach([])});
  assert.equal(r.items[0].workflow.status, 'in_progress');
  assert.equal(r.coverage.unidentifiedHistoricalRecords, 0);
  const receipt = {application: {...form, jobAdvertLink: form.jobAdvertLink + '&utm_source=gmail'}, status: 'sent', messageId: 'gmail-1', sendingAccount: 'me@example.test', email: 'hr@example.test', sentAt: '2026-11-20T10:00:00Z'};
  r = listAdvertsWithStatus({service: s, reviews, outreach: outreach([receipt])});
  assert.equal(r.items[0].workflow.status, 'complete');
  assert.match(r.items[0].workflow.reason, /exact advert/);
  assert.equal(deriveAdvertStatus({jobId: id, sent: [{...receipt, application: {jobAdvertLink: 'https://www.reed.co.uk/jobs/other/1'}}]}).status, 'new');
  assert.throws(() => deriveAdvertStatus({jobId: 'web-nothex'}), /ID required/);
});

async function invoke(s, {method = 'POST', route = '/api/job-imports/web', payload = {...paste(), confirmed: true}, origin = 'http://127.0.0.1:3000'} = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(payload))]);
  req.method = method; req.headers = {host: '127.0.0.1:3000', 'content-type': 'application/json', origin}; req.socket = {remoteAddress: '127.0.0.1'};
  let status, data;
  await createJobImportHandler({service: s, getReview: () => null, sendJson: (r, code, d) => { status = code; data = d; }, sendText() {}})(req, {}, new URL('http://127.0.0.1:3000' + route));
  return {status, data};
}

test('the paste route stores the advert, needs confirmation and a same-origin request, and lookup finds it', async () => {
  const s = service();
  assert.equal((await invoke(s, {payload: paste()})).status, 400);
  assert.equal((await invoke(s, {origin: 'https://evil.test'})).status, 403);
  assert.equal((await invoke(s, {payload: {...paste({jobAdvertLink: 'https://www.linkedin.com/jobs/view/1/'}), confirmed: true}})).status, 400);
  const saved = await invoke(s);
  assert.equal(saved.status, 200); assert.equal(saved.data.stored, true); assert.match(saved.data.jobId, /^web-/);
  const found = await invoke(s, {method: 'GET', route: '/api/job-imports/lookup?jobId=' + saved.data.jobId});
  assert.equal(found.status, 200); assert.equal(found.data.record.sourceSite, 'reed.co.uk');
  assert.equal((await invoke(s, {method: 'GET', route: '/api/job-imports/lookup?jobId=web-0000000000000000'})).status, 404);
});

let sqlite;
try { ({createSqliteJobImportStore: sqlite} = await import('../../src/infrastructure/applications/sqlite-job-import-store.js')); } catch (e) { if (e.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw e; }
test('SQLite keeps pasted adverts in their own file and leaves the import schema unchanged', {skip: !sqlite ? 'node:sqlite unavailable' : false}, async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'web-advert-'));
  let s;
  t.after(() => { s?.close(); rmSync(root, {recursive: true, force: true}); });
  const file = path.join(root, 'job-imports-v1.db');
  s = sqlite({filePath: file});
  const id = s.receiveWeb(paste()).jobId;
  s.receive(linkedin('4473232043'));
  s.close(); s = null;
  assert.ok(existsSync(path.join(root, 'job-imports-v1-web.db')));
  const {DatabaseSync} = await import('node:sqlite');
  const main = new DatabaseSync(file);
  assert.equal(main.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE 'web_advert%'").get().n, 0);
  main.close();
  s = sqlite({filePath: file});
  assert.equal(s.lookup(id).jobTitle, 'Delivery Manager');
  assert.equal(s.list({page: 1, pageSize: 50}).total, 2);
  assert.equal(s.receiveWeb(paste()).duplicate, true);
});

function fakeForm(values = {}) {
  const fields = {}, form = {dataset: {}, elements: {namedItem: n => fields[n]}};
  for (const n of ['jobAdvertLink', 'jobTitle', 'jobDescriptionText', 'jobLocation', 'jobImportId', 'jobImportRevision', 'stakeholderSource', 'organisationName', 'organisationUrl', 'jobReference', 'advertiserRelationship', 'recruiterName'])
    fields[n] = {value: values[n] || '', dispatchEvent() {}, setCustomValidity() {}};
  return {form, fields};
}

test('the advert list can choose and apply a pasted advert without a LinkedIn job reference', () => {
  const record = {...normalizeWebImport(paste()), importId: 'imp-1', revision: 1};
  assert.equal(canonicalStoredAdvertUrl(record.jobId, record.jobAdvertLink), record.jobAdvertLink);
  assert.throws(() => canonicalStoredAdvertUrl(record.jobId, ''), /no usable link/);
  assert.equal(canonicalStoredAdvertUrl('123'), 'https://www.linkedin.com/jobs/view/123/');
  const {form, fields} = fakeForm();
  const chosen = selectStoredAdvert(form, record.jobId, {link: record.jobAdvertLink, EventCtor: null});
  assert.deepEqual([chosen.accepted, chosen.pending, fields.jobAdvertLink.value], [true, true, record.jobAdvertLink]);
  assert.ok(showsAdvert(fields.jobAdvertLink.value, record.jobId, record.jobAdvertLink));
  assert.ok(!showsAdvert('https://www.reed.co.uk/other', record.jobId, record.jobAdvertLink));
  assert.equal(applyImportedJob(form, record), true);
  assert.deepEqual([fields.jobTitle.value, fields.organisationName.value, fields.jobReference.value, fields.jobLocation.value, fields.organisationUrl.value], ['Delivery Manager', 'Example Recruitment', '', 'Leeds', '']);
});
