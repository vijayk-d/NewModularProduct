import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createTemplateCoverLetterDocuments} from '../../src/infrastructure/documents/template-cover-letter.js';
import {exportApplicationPack} from '../../src/application/export-application-pack.js';
import {reviewEditorState} from '../../src/application/save-application-review.js';
import {PORTAL_GREETING} from '../../src/domain/cover-letter/portal-letter.js';
import {setCoverLetterTemplate} from '../../tools/maintenance/set-cover-letter-template.mjs';

const pdf = async () => ({bytes: Buffer.from('%PDF-fixture'), engine: 'fake', browserVersion: 'fake', layout: {}});
async function tempDir(t, name) { const d = await mkdtemp(path.join(os.tmpdir(), name)); t.after(() => rm(d, {recursive: true, force: true})); return d; }
async function stateWithTemplate(t) {
  const state = await tempDir(t, 'portal-state-'), folder = path.join(state, 'cover-letter-export');
  await mkdir(folder, {recursive: true});
  await writeFile(path.join(folder, 'settings.json'), JSON.stringify({enabled: true, templateSha256: 'a'.repeat(64)}));
  return state;
}

test('production uses the template from the persistent state folder', async t => {
  const state = await stateWithTemplate(t);
  let seen;
  const out = await createTemplateCoverLetterDocuments({stateDirectory: state, env: {NMP_ENV: 'production', PORT: '3100'}, renderPdf: pdf, worker: async v => { seen = v; return Buffer.from('PKfixture'); }})({plain: 'Body', html: '<ul><li>Body</li></ul>', bodyVersion: 'b', subjectVersion: 's', revision: 1});
  assert.equal(seen.template, path.join(state, 'cover-letter-export', 'template.docx'));
  assert.equal(seen.templateSha256, 'a'.repeat(64));
  assert.deepEqual(out.map(f => f.name), ['cover-letter.docx', 'cover-letter.pdf', 'cover-letter-export.json']);
});

test('state folder without a template keeps the plain Word fallback', async t => {
  const state = await tempDir(t, 'portal-empty-');
  assert.equal(await createTemplateCoverLetterDocuments({stateDirectory: state, env: {NMP_ENV: 'production'}, worker: () => assert.fail('No worker')})({html: '<p>Body</p>'}), null);
});

test('settings without a valid template hash are refused, not ignored', async t => {
  const state = await tempDir(t, 'portal-bad-');
  await mkdir(path.join(state, 'cover-letter-export'), {recursive: true});
  await writeFile(path.join(state, 'cover-letter-export', 'settings.json'), JSON.stringify({enabled: true, templateSha256: 'not-a-hash'}));
  await assert.rejects(() => createTemplateCoverLetterDocuments({stateDirectory: state, worker: () => assert.fail('No worker')})({html: '<p>Body</p>'}), e => e.code === 'LETTER_SETTINGS_INVALID');
});

function review() {
  const closing = 'I appreciate the convenience of ATS-based applications, but I believe strong talent is often best understood through a direct conversation.';
  const row = {currentDraftPlainText: `Dear {{firstname}},\n\nManual wording.\n\n${closing}\n\nKind regards,\nTest Candidate`, currentDraftHtml: `<p>Dear {{firstname}},</p><ul><li><mark style="background-color:#fff2a8">Manual wording.</mark></li></ul><p>${closing}</p><p>Kind regards,<br>Test Candidate</p>`, currentDraftSubject: 'Reviewed subject', formData: {jobTitle: 'Test role', organisationName: 'Example'}};
  const store = new Map([['r', row]]), s = reviewEditorState(row);
  return {store, request: {reviewId: 'r', expectedBodyVersion: s.bodyVersion, expectedSubjectVersion: s.subjectVersion, expectedRevision: s.revision, includeCv: false}};
}

test('export pack sends the portal letter to the template and records it in application.txt', async () => {
  const f = review(), before = JSON.stringify(f.store.get('r'));
  let seen, files;
  await exportApplicationPack({...f, documents: async v => { seen = v; return [{name: 'cover-letter.docx', bytes: Buffer.from('PK')}, {name: 'cover-letter.pdf', bytes: Buffer.from('%PDF-')}, {name: 'cover-letter-export.json', bytes: Buffer.from('{}')}]; }, word: () => assert.fail('No plain fallback'), pack: async list => { files = Object.fromEntries(list.map(x => [x.name, x.bytes.toString()])); return Buffer.from('zip'); }});
  assert.ok(seen.plain.startsWith(PORTAL_GREETING));
  assert.ok(seen.html.startsWith(`<p>${PORTAL_GREETING}</p><ul><li><mark`));
  assert.ok(!seen.html.includes('I appreciate the convenience'));
  assert.ok(!files['cover-letter.txt'].includes('I appreciate the convenience'));
  assert.match(files['application.txt'], /Letter: Word template with header, plus PDF\nGreeting: Dear Hiring Manager\/Talent Recruiter,\nATS closing paragraph: removed/);
  assert.equal(JSON.stringify(f.store.get('r')), before, 'saved letter is unchanged');
});

test('plain Word fallback is labelled so a missing template is visible', async () => {
  const f = review();
  let text;
  await exportApplicationPack({...f, word: async t => { assert.ok(t.startsWith(PORTAL_GREETING)); return Buffer.from('PK'); }, pack: async list => { text = list.find(x => x.name === 'application.txt').bytes.toString(); return Buffer.from('zip'); }});
  assert.match(text, /Letter: Plain Word \(no letter template configured/);
});

test('setup tool installs a checked template and its hash into the state folder', async t => {
  const state = await tempDir(t, 'portal-setup-'), src = path.join(state, 'source.docx'), bytes = Buffer.from('PKtemplate-fixture');
  await writeFile(src, bytes);
  let checked;
  const r = await setCoverLetterTemplate({source: src, stateDirectory: state, worker: async v => { checked = v; return Buffer.from('PK'); }});
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(r.templateSha256, digest);
  assert.equal(checked.templateSha256, digest);
  assert.match(checked.html, /<ul><li>.*<mark>/);
  assert.deepEqual(JSON.parse(await readFile(path.join(state, 'cover-letter-export', 'settings.json'), 'utf8')), {enabled: true, templateSha256: digest});
  assert.deepEqual(await readFile(path.join(state, 'cover-letter-export', 'template.docx')), bytes);
});

test('setup tool keeps the existing template when the new one fails the check', async t => {
  const state = await tempDir(t, 'portal-setup-bad-'), src = path.join(state, 'bad.docx');
  await writeFile(src, Buffer.from('PKbad'));
  await assert.rejects(() => setCoverLetterTemplate({source: src, stateDirectory: state, worker: async () => { throw Object.assign(Error('x'), {code: 'LETTER_TEMPLATE_NOT_EMPTY'}); }}), /Only the first two body paragraphs.*Existing template unchanged/);
  assert.deepEqual(await readdir(path.join(state, 'cover-letter-export')), []);
  await assert.rejects(() => setCoverLetterTemplate({source: path.join(state, 'x.pdf'), stateDirectory: state}), /\.docx/);
});

test('setup command reads the template path with or without --state', async () => {
  const {parseArguments} = await import('../../tools/maintenance/set-cover-letter-template.mjs');
  const file = 'D:\CV\Cover Letter_template Ver-1.docx';
  assert.deepEqual(parseArguments([file], {NMP_STATE_DIRECTORY: 'S'}), {source: file, stateDirectory: 'S'});
  assert.equal(parseArguments([file], {}).stateDirectory, path.resolve('output'));
  assert.deepEqual(parseArguments([file, '--state', 'P'], {}), {source: file, stateDirectory: 'P'});
  assert.deepEqual(parseArguments(['--state', 'P', file], {}), {source: file, stateDirectory: 'P'});
  assert.throws(() => parseArguments([], {}), /exactly one/);
  assert.throws(() => parseArguments(['D:\CV\Cover', 'Letter.docx'], {}), /quotes/);
  assert.throws(() => parseArguments([file, '--state'], {}), /after --state/);
});
