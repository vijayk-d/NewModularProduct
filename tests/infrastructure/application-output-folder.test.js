import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {checkOutputFolder, createApplicationOutputFolder, copyName} from '../../src/infrastructure/applications/application-output-folder.js';
import {createApplicationPackExporter} from '../../src/infrastructure/applications/application-pack-exporter.js';
import {createDurableReviewStore, createMemoryReviewRepository} from '../../src/application/durable-review-store.js';
import {reviewEditorState} from '../../src/application/save-application-review.js';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {saveToFolderFromEditor} from '../../src/interfaces/http/application-export-controls.js';

async function temp(t, prefix = 'output-folder-') {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(dir, {recursive: true, force: true}));
  return dir;
}
const code = code => error => error.code === code;

test('an unset folder explains how to set APPLICATION_OUTPUT_FOLDER', async () => {
  for (const value of [undefined, '', '   ']) await assert.rejects(checkOutputFolder(value), e => code('OUTPUT_FOLDER_NOT_SET')(e) && /APPLICATION_OUTPUT_FOLDER/.test(e.message));
});

test('the folder must be absolute, exist and be a folder', async t => {
  const dir = await temp(t);
  await assert.rejects(checkOutputFolder('relative/folder'), code('OUTPUT_FOLDER_INVALID'));
  await assert.rejects(checkOutputFolder(path.join(dir, 'missing')), code('OUTPUT_FOLDER_MISSING'));
  await writeFile(path.join(dir, 'file.txt'), 'x');
  await assert.rejects(checkOutputFolder(path.join(dir, 'file.txt')), code('OUTPUT_FOLDER_MISSING'));
  assert.ok(await checkOutputFolder(`"${dir}"`));
});

test('the folder may not be inside, or contain, the app, its data or the production folder', async t => {
  const root = await temp(t), app = path.join(root, 'app'), inside = path.join(app, 'out');
  await mkdir(inside, {recursive: true});
  await assert.rejects(checkOutputFolder(inside, {forbidden: [app]}), code('OUTPUT_FOLDER_FORBIDDEN'));
  await assert.rejects(checkOutputFolder(app, {forbidden: [app]}), code('OUTPUT_FOLDER_FORBIDDEN'));
  await assert.rejects(checkOutputFolder(root, {forbidden: [app]}), code('OUTPUT_FOLDER_FORBIDDEN'));
  const separate = await temp(t);
  assert.ok(await checkOutputFolder(separate, {forbidden: [app, path.join(root, 'not-yet-created')]}));
});

test('saving writes into the application folder and never overwrites', async t => {
  const dir = await temp(t), folder = createApplicationOutputFolder({folder: dir});
  const first = await folder.save('Example-Delivery-Manager', [{name: 'Test_Candidate_Delivery_Manager_CV.docx', bytes: Buffer.from('one')}]);
  assert.deepEqual(first.files, ['Test_Candidate_Delivery_Manager_CV.docx']);
  const second = await folder.save('Example-Delivery-Manager', [{name: 'Test_Candidate_Delivery_Manager_CV.docx', bytes: Buffer.from('two')}]);
  assert.deepEqual(second.files, ['Test_Candidate_Delivery_Manager_CV_copy2.docx']);
  // Saving identical bytes again writes nothing and says so.
  const same = await folder.save('Example-Delivery-Manager', [{name: 'Test_Candidate_Delivery_Manager_CV.docx', bytes: Buffer.from('one')}]);
  assert.deepEqual(same, {folder: same.folder, files: ['Test_Candidate_Delivery_Manager_CV.docx'], unchanged: ['Test_Candidate_Delivery_Manager_CV.docx']});
  const where = path.join(dir, 'Example-Delivery-Manager');
  assert.equal(await readFile(path.join(where, 'Test_Candidate_Delivery_Manager_CV.docx'), 'utf8'), 'one');
  assert.equal(await readFile(path.join(where, 'Test_Candidate_Delivery_Manager_CV_copy2.docx'), 'utf8'), 'two');
  assert.equal((await readdir(where)).length, 2);
  assert.equal(copyName('a.txt', 3), 'a_copy3.txt');
});

test('unsafe folder or file names are refused and nothing is written', async t => {
  const dir = await temp(t), folder = createApplicationOutputFolder({folder: dir});
  for (const sub of ['..', '../x', 'a/b', '']) await assert.rejects(folder.save(sub, [{name: 'a.txt', bytes: Buffer.from('x')}]), code('OUTPUT_FOLDER_UNSAFE_NAME'));
  await assert.rejects(folder.save('ok', [{name: '../a.txt', bytes: Buffer.from('x')}]), code('OUTPUT_FOLDER_UNSAFE_NAME'));
  assert.deepEqual(await readdir(dir), []);
  await assert.rejects(createApplicationOutputFolder({folder: ''}).save('ok', [{name: 'a.txt', bytes: Buffer.from('x')}]), code('OUTPUT_FOLDER_NOT_SET'));
});

const url = 'https://business.test/jobs/1', plain = `Dear Hiring Manager,\n\nI am applying for this role.\n\nJob advert: ${url}\n\nI led delivery worth £2M.\n\nWarm regards,\nTest Person`;
function packFixture() {
  const store = createDurableReviewStore(createMemoryReviewRepository());
  store.set('r', {formData: {jobTitle: 'Delivery Manager', organisationName: 'Example', jobAdvertLink: url}, currentDraftPlainText: plain, currentDraftHtml: plain.replace(`Job advert: ${url}`, `Job advert: <a href="${url}">Job advert</a>`).replace(/\n/g, '<br>'), currentDraftSubject: 'Reviewed subject', selectedCvRoleCode: 'DM', prepared: {recommendation: {bestCv: {role_code: 'DM', local_path: 'cv.pdf'}}}});
  const v = reviewEditorState(store.get('r'));
  return {store, request: {reviewId: 'r', expectedBodyVersion: v.bodyVersion, expectedSubjectVersion: v.subjectVersion, expectedRevision: v.revision, expectedCvRoleCode: 'DM', includeCv: false}};
}
async function serve(t, options) {
  const server = createLocalServer(options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections?.(); await new Promise(r => server.close(r)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {base, post: (route, body, origin = base) => fetch(base + route, {method: 'POST', headers: {'content-type': 'application/json', ...(origin ? {origin} : {})}, body: JSON.stringify(body)})};
}

test('Save pack to folder writes the pack files, not a ZIP, and versions repeats', async t => {
  const dir = await temp(t), f = packFixture();
  const {post} = await serve(t, {applicationReviewStore: f.store, applicationPackExporter: createApplicationPackExporter({}), applicationOutputFolder: createApplicationOutputFolder({folder: dir})});
  const response = await post('/api/application-reviews/export-to-folder', f.request);
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.deepEqual([...data.files].sort(), ['Candidate_Delivery_Manager_Cover_Letter.docx', 'application.txt', 'cover-letter.html', 'cover-letter.txt']);
  const where = path.join(dir, 'Example-Delivery-Manager');
  assert.deepEqual((await readdir(where)).sort(), [...data.files].sort());
  assert.match(await readFile(path.join(where, 'cover-letter.txt'), 'utf8'), /Dear Hiring Manager\/Talent Recruiter,/);
  const again = await (await post('/api/application-reviews/export-to-folder', f.request)).json();
  assert.deepEqual([...again.unchanged].sort(), [...data.files].sort(), 'an identical pack is not saved twice');
  assert.deepEqual((await readdir(where)).sort(), [...data.files].sort());
});

test('Save to folder routes refuse cross-origin or missing-origin calls and write nothing', async t => {
  const dir = await temp(t), f = packFixture();
  const service = {file: () => ({bytes: Buffer.from('docx'), roleCode: 'DM'})};
  const {post} = await serve(t, {applicationReviewStore: f.store, cvTailoringService: service, applicationPackExporter: createApplicationPackExporter({}), applicationOutputFolder: createApplicationOutputFolder({folder: dir})});
  for (const origin of ['https://evil.test', null]) {
    assert.equal((await post('/api/application-reviews/export-to-folder', f.request, origin)).status, 403);
    assert.equal((await post('/api/reviews/r/tailored-cv/1/save-to-folder', {}, origin)).status, 403);
  }
  assert.deepEqual(await readdir(dir), []);
});

test('Save tailored CV to folder uses the upload-friendly name in the application folder', async t => {
  const dir = await temp(t), f = packFixture();
  const service = {file: (id, version) => (id === 'r' && version === 1 ? {bytes: Buffer.from('docx bytes'), roleCode: 'DM'} : null)};
  const {post} = await serve(t, {applicationReviewStore: f.store, cvTailoringService: service, candidateDisplayName: 'Test Candidate', applicationOutputFolder: createApplicationOutputFolder({folder: dir})});
  const response = await post('/api/reviews/r/tailored-cv/1/save-to-folder', {});
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.deepEqual(data.files, ['Test_Candidate_Delivery_Manager_CV_v1.docx']);
  assert.equal(await readFile(path.join(dir, 'Example-Delivery-Manager', 'Test_Candidate_Delivery_Manager_CV_v1.docx'), 'utf8'), 'docx bytes');
  assert.equal((await post('/api/reviews/r/tailored-cv/9/save-to-folder', {})).status, 404);
});

test('a tailored version with a PDF saves both files under the same built version number', async t => {
  const dir = await temp(t), f = packFixture();
  const service = {file: () => ({bytes: Buffer.from('docx bytes'), roleCode: 'DM'}), pdfBytes: async (id, version) => (version === 7 ? Buffer.from('%PDF-7') : null)};
  const {post} = await serve(t, {applicationReviewStore: f.store, cvTailoringService: service, candidateDisplayName: 'Test Candidate', applicationOutputFolder: createApplicationOutputFolder({folder: dir})});
  const data = await (await post('/api/reviews/r/tailored-cv/7/save-to-folder', {})).json();
  assert.deepEqual(data.files, ['Test_Candidate_Delivery_Manager_CV_v7.docx', 'Test_Candidate_Delivery_Manager_CV_v7.pdf']);
  assert.equal(await readFile(path.join(dir, 'Example-Delivery-Manager', 'Test_Candidate_Delivery_Manager_CV_v7.pdf'), 'utf8'), '%PDF-7');
});

test('an unset folder reaches the page as a how-to-set message', async t => {
  const f = packFixture();
  const service = {file: () => ({bytes: Buffer.from('docx'), roleCode: 'DM'})};
  const {post} = await serve(t, {applicationReviewStore: f.store, cvTailoringService: service, applicationPackExporter: createApplicationPackExporter({}), applicationOutputFolder: createApplicationOutputFolder({folder: ''})});
  for (const [route, body] of [['/api/reviews/r/tailored-cv/1/save-to-folder', {}], ['/api/application-reviews/export-to-folder', f.request]]) {
    const response = await post(route, body);
    assert.equal(response.status, 409);
    const data = await response.json();
    assert.equal(data.code, 'OUTPUT_FOLDER_NOT_SET');
    assert.match(data.error, /APPLICATION_OUTPUT_FOLDER/);
  }
});

test('client saves pending edits before asking the server to save to the folder', async () => {
  const order = [];
  const result = await saveToFolderFromEditor({reviewId: 'r', save: async () => order.push('save'), isDirty: () => false, getVersions: () => ({bodyVersion: 'b', subjectVersion: 's', revision: 1}), getCvRoleCode: () => 'DM', includeCv: false,
    fetchImpl: async (route, init) => { order.push(route); assert.equal(JSON.parse(init.body).reviewId, 'r'); return {ok: true, json: async () => ({ok: true, folder: 'X', files: ['a.txt']})}; }});
  assert.deepEqual(order, ['save', '/api/application-reviews/export-to-folder']);
  assert.deepEqual(result.files, ['a.txt']);
  await assert.rejects(saveToFolderFromEditor({save: async () => {}, isDirty: () => false, getVersions: () => ({}), getCvRoleCode: () => '', includeCv: false, fetchImpl: async () => ({ok: false, json: async () => ({ok: false, error: 'No output folder is set.'})})}), /No output folder/);
});
