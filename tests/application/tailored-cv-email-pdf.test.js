// Tailored CV as PDF for recruiter emails: Word conversion (fake), write-once PDFs, email choice, queue and send.
// No Word, Gmail or network: fakes only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp, readFile, rm, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createWordPdfConverter} from '../../src/infrastructure/documents/word-pdf-converter.js';
import {createTailoredPdfFiles} from '../../src/infrastructure/applications/tailored-cv-pdf-files.js';
import {createCvTailoringStore} from '../../src/infrastructure/applications/sqlite-cv-tailoring-store.js';
import {createCvTailoringService} from '../../src/application/cv-tailoring.js';
import {createOutreachQueueService} from '../../src/application/outreach-queue-service.js';
import {createGmailSendService} from '../../src/application/gmail-send-service.js';
import {fakeWorker, reviewFixture, SHA} from '../fixtures/cv-tailoring-fixtures.js';

const sha = b => createHash('sha256').update(b).digest('hex');
async function temp(t) { const dir = await mkdtemp(path.join(tmpdir(), 'tailored-pdf-')); t.after(() => rm(dir, {recursive: true, force: true})); return dir; }

// A fake powershell: writes the PDF Word would make (or not) and prints the script's JSON line.
function fakeSpawn({result = {ok: true, wordVersion: '16.0'}, pdf = Buffer.from('%PDF-1.7 fake'), hang = false, calls = []} = {}) {
  return (cmd, args) => {
    calls.push({cmd, args});
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
    child.stderr = new EventEmitter();
    child.kill = () => { child.killed = true; };
    if (!hang) setImmediate(async () => {
      if (result.ok) await writeFile(args[args.indexOf('-Pdf') + 1], pdf);
      child.stdout.emit('data', JSON.stringify(result) + '\r\n');
      child.emit('close', result.ok ? 0 : 1);
    });
    return child;
  };
}

test('the Word converter returns the PDF, maps failures to clear messages and never retries', async () => {
  const calls = [];
  const ok = await createWordPdfConverter({platform: 'win32', spawnImpl: fakeSpawn({calls})}).convert(Buffer.from('PK docx'));
  assert.equal(ok.bytes.toString(), '%PDF-1.7 fake');
  assert.equal(ok.wordVersion, '16.0');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'powershell.exe');
  assert.ok(calls[0].args.includes('-STA') && calls[0].args.includes('-NonInteractive'));
  const failing = [];
  await assert.rejects(createWordPdfConverter({platform: 'win32', spawnImpl: fakeSpawn({result: {ok: false, code: 'WORD_NOT_INSTALLED'}, calls: failing})}).convert(Buffer.from('PK')), e => e.code === 'WORD_NOT_INSTALLED' && /not installed/.test(e.message));
  assert.equal(failing.length, 1);
  await assert.rejects(createWordPdfConverter({platform: 'win32', spawnImpl: fakeSpawn({pdf: Buffer.from('not a pdf')})}).convert(Buffer.from('PK')), e => e.code === 'WORD_EXPORT_FAILED');
  await assert.rejects(createWordPdfConverter({platform: 'win32', timeoutMs: 20, spawnImpl: fakeSpawn({hang: true})}).convert(Buffer.from('PK')), e => e.code === 'WORD_TIMEOUT');
  await assert.rejects(createWordPdfConverter({platform: 'linux'}).convert(Buffer.from('PK')), e => e.code === 'WORD_UNAVAILABLE');
});

test('PDF files are write-once and read only from their own folder', async t => {
  const dir = await temp(t), files = createTailoredPdfFiles({folder: dir});
  assert.equal(await files.write('r1', 2, Buffer.from('%PDF-a')), 'r1/v2.pdf');
  await assert.rejects(files.write('r1', 2, Buffer.from('%PDF-b')));
  assert.equal((await files.read('r1/v2.pdf')).toString(), '%PDF-a');
  await assert.rejects(files.read('../x.pdf'));
  await assert.rejects(files.write('../r1', 1, Buffer.from('x')));
  assert.throws(() => createTailoredPdfFiles({folder: 'relative'}));
});

function setup(t, dir, converter) {
  const store = createCvTailoringStore({filePath: ':memory:'});
  const service = createCvTailoringService({reviews: reviewFixture(), store, worker: fakeWorker([]), cvFolder: 'C:/cv', cvLibrary: async () => [{role_code: 'PM', local_path: 'PM/PM_CV.pdf'}],
    pdfConverter: converter, pdfFiles: createTailoredPdfFiles({folder: dir})});
  return {store, service};
}
const buildBody = {profile: ['Delivery leader across programmes.'], achievements: ['Led a 40-person Agile programme.'], expectedSha256: SHA, expectedRoleCode: 'PM'};

test('each build makes its PDF; a Word failure never blocks the build and Make PDF tries once on request', async t => {
  const dir = await temp(t);
  let fail = true, conversions = 0;
  const converter = {convert: async () => { conversions++; if (fail) throw Object.assign(new Error('Microsoft Word could not be started.'), {statusCode: 503, code: 'WORD_START_FAILED'}); return {bytes: Buffer.from('%PDF-1.7 v1'), wordVersion: '16.0'}; }};
  const {service, store} = setup(t, dir, converter);
  const built = await service.build('r1', buildBody);
  assert.equal(built.version, 1);
  assert.equal(built.pdf, null);
  assert.match(built.pdfError, /could not be started/);
  assert.equal(conversions, 1);
  fail = false;
  const pdf = await service.makePdf('r1', 1);
  assert.equal(pdf.relativePath, 'r1/v1.pdf');
  assert.equal(pdf.sha256, sha(Buffer.from('%PDF-1.7 v1')));
  assert.equal((await readFile(path.join(dir, 'r1', 'v1.pdf'))).toString(), '%PDF-1.7 v1');
  await service.makePdf('r1', 1);
  assert.equal(conversions, 2, 'an existing PDF is reused, not converted again');
  const second = await service.build('r1', buildBody);
  assert.equal(second.pdf.relativePath, 'r1/v2.pdf');
  assert.deepEqual(service.versions('r1').versions.map(v => [v.version, v.pdf]), [[2, true], [1, true]]);
  assert.equal(store.emailChoice('r1'), null);
});

test('the email choice needs a version with a PDF, and the attachment never falls back silently', async t => {
  const dir = await temp(t);
  let fail = true;
  const converter = {convert: async () => { if (fail) throw Object.assign(new Error('no'), {statusCode: 503}); return {bytes: Buffer.from('%PDF-x'), wordVersion: ''}; }};
  const {service, store} = setup(t, dir, converter);
  await service.build('r1', buildBody);
  assert.throws(() => service.setEmailChoice('r1', {version: 1}), e => e.code === 'TAILORED_PDF_MISSING');
  assert.throws(() => service.setEmailChoice('r1', {version: 9}), e => e.statusCode === 400);
  assert.equal(service.emailAttachment('r1'), null);
  fail = false; await service.makePdf('r1', 1);
  assert.deepEqual(service.setEmailChoice('r1', {version: 1}), {emailVersion: 1});
  assert.deepEqual(service.emailAttachment('r1'), {root: 'tailored', relativePath: 'r1/v1.pdf', sha256: sha(Buffer.from('%PDF-x')), tailoredVersion: 1});
  store.setEmailChoice('r1', 5);
  assert.throws(() => service.emailAttachment('r1'), e => e.code === 'TAILORED_PDF_MISSING');
  assert.deepEqual(service.setEmailChoice('r1', {version: null}), {emailVersion: null});
});

test('new queue items attach the chosen tailored PDF under the upload-friendly name', async () => {
  const reviews = reviewFixture(), added = [];
  const repository = {addMany(items) { added.push(...items); return {added: items.length, duplicates: 0, updated: 0, items}; }, list: () => []};
  const contactStore = {async listByReview() { return [{id: 'c1', firstName: 'Zoe', lastName: 'Jones', fullName: 'Zoe Jones', selectedEmail: 'zoe@business.test'}]; }};
  const queue = createOutreachQueueService({repository, contactStore, getReview: id => reviews.get(id), tailoredAttachment: () => ({root: 'tailored', relativePath: 'r1/v3.pdf', sha256: 'a'.repeat(64), tailoredVersion: 3})});
  const body = 'Dear Hiring Manager,\n\nI led delivery.\n\nKind regards,\nTest Candidate';
  await queue.add({reviewId: 'r1', recipients: [{contactId: 'c1', email: 'zoe@business.test'}], bodyPlainText: body, bodyHtml: body.split('\n').join('<br>'), subject: 'Application'});
  assert.equal(added.length, 1);
  assert.equal(added[0].attachment.root, 'tailored');
  assert.equal(added[0].attachment.relativePath, 'r1/v3.pdf');
  assert.match(added[0].attachment.name, /_CV\.pdf$/);
});

test('sending reads a tailored PDF only from TAILORED_CV_FOLDER and refuses changed bytes', async t => {
  const cvs = await temp(t), tailored = await temp(t);
  const data = Buffer.from('%PDF-1.7 tailored');
  await mkdir(path.join(tailored, 'r1')); await writeFile(path.join(tailored, 'r1', 'v1.pdf'), data);
  const account = 'sender@business.test', body = 'Dear Zoe,\n\nI led delivery worth £2M.\n\nWarm regards,\nVijay DAFAL';
  const item = {id: 'q', applicationKey: 'app', status: 'new', email: 'zoe@business.test', firstname: 'Zoe', subject: 'Application', bodyPlainText: body, bodyHtml: body.replace(/\n/g, '<br>'),
    attachment: {root: 'tailored', relativePath: 'r1/v1.pdf', name: 'Vijay_DAFAL_Delivery_Manager_CV.pdf', sha256: sha(data)}};
  const env = {ENABLE_GMAIL: 'true', ENABLE_GMAIL_SENDING: 'true', CV_FOLDER: cvs, TAILORED_CV_FOLDER: tailored, ENABLE_GMAIL_SIGNATURE: 'false'};
  const raw = Buffer.from('synthetic').toString('base64url'), prepared = [];
  const service = createGmailSendService({repository: {getById: () => structuredClone(item), findDraftOperation: () => null, getSendState: () => ({blocked: false, hasSent: false, retryAllowed: false, last: null}), claimSendAttempt: () => assert.fail('must not send'), finishSendAttempt: () => assert.fail('must not send')}, env,
    mailboxPort: {getStatus: () => ({mailboxCheckEnabled: true, configurationReady: true, configuredFromAddress: account})},
    runner: async ({payload}) => { prepared.push(payload); return {ok: true, sent: false, sendingAttempted: false, sendingAccount: account, raw, summary: {recipient: item.email, subject: item.subject, bodyPlainText: body, bodyHtml: item.bodyHtml, attachments: [{name: 'CV.pdf', sizeBytes: data.length}], contentHash: sha(Buffer.from(raw, 'base64url'))}}; }});
  await service.prepare({queueId: 'q'});
  assert.equal(prepared[0].draft.attachment.root, 'tailored');
  assert.equal(prepared[0].draft.attachment.sha256, sha(data));
  item.attachment.sha256 = '0'.repeat(64);
  await assert.rejects(service.prepare({queueId: 'q'}), /changed after it was queued/);
  item.attachment = {root: 'tailored', relativePath: 'r1/v1.pdf', name: 'x.pdf', sha256: sha(data)};
  env.TAILORED_CV_FOLDER = cvs;
  await assert.rejects(service.prepare({queueId: 'q'}), e => e.code === 'SEND_CV' || /CV/.test(e.message));
  assert.equal(prepared.length, 1);
});
