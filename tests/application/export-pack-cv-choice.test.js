import test from 'node:test';
import assert from 'node:assert/strict';
import {exportApplicationPack, uploadFileName} from '../../src/application/export-application-pack.js';
import {reviewEditorState} from '../../src/application/save-application-review.js';
import {packSummary, exportFromEditor} from '../../src/interfaces/http/application-export-controls.js';

const plain = 'Dear Hiring Manager,\n\nI led delivery.\n\nKind regards,\nTest Candidate';
function fixture({snapshotPath = 'OLD/old-cv.pdf', cvFormat = 'saved', includeCv = true} = {}) {
  const row = {selectedCvRoleCode: 'DM', prepared: {rankedCvs: [{cv: {role_code: 'DM', role_name: 'Delivery Manager', local_path: snapshotPath}}]}, currentDraftPlainText: plain, currentDraftHtml: plain.replace(/\n/g, '<br>'), currentDraftSubject: 'Subject', formData: {jobTitle: 'Senior Délivery Manager', organisationName: 'Example'}};
  const store = new Map([['r', row]]), v = reviewEditorState(row);
  return {store, request: {reviewId: 'r', expectedBodyVersion: v.bodyVersion, expectedSubjectVersion: v.subjectVersion, expectedRevision: v.revision, includeCv, expectedCvRoleCode: 'DM', cvFormat}};
}
const disk = new Map([['DM/Vijay_CV.pdf', Buffer.from('%PDF-current')], ['DM/Vijay_CV.docx', Buffer.from('PKcurrent')], ['OLD/old-cv.pdf', Buffer.from('%PDF-old')]]);
const readCv = async p => { if (!disk.has(p)) throw Object.assign(Error('missing'), {code: 'APPLICATION_EXPORT_CV'}); return disk.get(p); };
const library = async () => [{role_code: 'DM', role_name: 'Delivery Manager', local_path: 'DM/Vijay_CV.pdf'}];
const run = (f, extra = {}) => exportApplicationPack({...f, readCv, cvLibrary: library, candidateName: 'Vijay DAFAL', word: async () => Buffer.from('PKletter'), pack: async files => files, ...extra});
const names = r => r.bytes.map(x => x.name);
const file = (r, n) => r.bytes.find(x => x.name === n);

test('upload names are ASCII and match the Gmail attachment pattern', () => {
  assert.equal(uploadFileName('Vijay DAFAL', 'Senior Délivery Manager (Hybrid)', 'CV', '.pdf'), 'Vijay_DAFAL_Senior_Delivery_Manager_Hybrid_CV.pdf');
  assert.equal(uploadFileName('', '', 'Cover_Letter', '.docx'), 'Candidate_Application_Cover_Letter.docx');
});

test('pack uses the current CV library file, not the old ranking snapshot, with upload names', async () => {
  const r = await run(fixture());
  assert.deepEqual(file(r, 'Vijay_DAFAL_Senior_Delivery_Manager_CV.pdf').bytes, disk.get('DM/Vijay_CV.pdf'));
  assert.ok(names(r).includes('Vijay_DAFAL_Senior_Delivery_Manager_Cover_Letter.docx'));
  assert.ok(!r.bytes.some(x => x.bytes.equals(disk.get('OLD/old-cv.pdf'))));
  assert.match(file(r, 'application.txt').bytes.toString(), /CV source: current CV library/);
});

test('both formats include the PDF and its same-name DOCX', async () => {
  const r = await run(fixture({cvFormat: 'both'}));
  assert.deepEqual(names(r).filter(n => n.includes('_CV.')), ['Vijay_DAFAL_Senior_Delivery_Manager_CV.pdf', 'Vijay_DAFAL_Senior_Delivery_Manager_CV.docx']);
  assert.match(file(r, 'application.txt').bytes.toString(), /_CV\.pdf \(SHA-256 [a-f0-9]{64}\)\n.*_CV\.docx \(SHA-256/);
});

test('DOCX only uses the sibling file', async () => {
  const r = await run(fixture({cvFormat: 'docx'}));
  assert.deepEqual(names(r).filter(n => n.includes('_CV.')), ['Vijay_DAFAL_Senior_Delivery_Manager_CV.docx']);
});

test('a missing other format names the file it expected', async () => {
  const lib = async () => [{role_code: 'DM', local_path: 'DM/Only.pdf'}];
  disk.set('DM/Only.pdf', Buffer.from('%PDF-only'));
  await assert.rejects(() => run(fixture({cvFormat: 'docx'}), {cvLibrary: lib}), /No DOCX version of this CV was found\. Save it as "Only\.docx"/);
});

test('a CV removed from the library stops the export', async () => {
  await assert.rejects(() => run(fixture(), {cvLibrary: async () => []}), /no longer in the CV library/);
});

test('unknown CV format is refused', async () => {
  await assert.rejects(() => run(fixture({cvFormat: 'zip'})), /Choose a CV format/);
});

test('without a library the saved snapshot path is still used', async () => {
  const r = await run(fixture(), {cvLibrary: null});
  assert.ok(r.bytes.some(x => x.bytes.equals(disk.get('OLD/old-cv.pdf'))));
  assert.match(file(r, 'application.txt').bytes.toString(), /CV source: saved selection/);
});

test('template letter files get upload names and the full pack stays within the ZIP limit', async () => {
  const documents = async () => [{name: 'cover-letter.docx', bytes: Buffer.from('PK')}, {name: 'cover-letter.pdf', bytes: Buffer.from('%PDF-')}, {name: 'cover-letter-export.json', bytes: Buffer.from('{}')}];
  const {zipStored} = await import('../../src/infrastructure/applications/application-pack-exporter.js');
  const r = await run(fixture({cvFormat: 'both'}), {documents, pack: zipStored});
  assert.ok(Buffer.isBuffer(r.bytes));
  const listed = (await run(fixture({cvFormat: 'both'}), {documents})).bytes.map(x => x.name);
  assert.ok(listed.includes('Vijay_DAFAL_Senior_Delivery_Manager_Cover_Letter.pdf'));
  assert.equal(listed.length, 8);
});

test('export panel summary describes the chosen pack', () => {
  assert.match(packSummary('both', 'DM'), /CV DM as PDF and DOCX/);
  assert.match(packSummary('none', 'DM'), /and no CV\./);
  assert.match(packSummary('pdf', ''), /no CV selected yet/);
});

test('client sends the chosen CV format', async () => {
  let body;
  await exportFromEditor({save: async () => {}, getVersions: () => ({bodyVersion: 'b', subjectVersion: 's', revision: 1}), isDirty: () => false, getCvRoleCode: () => 'DM', includeCv: true, cvFormat: 'both', reviewId: 'r', fetchImpl: async (u, o) => { body = JSON.parse(o.body); return {ok: true, blob: async () => 'blob', headers: {get: () => 'attachment; filename="Example-application.zip"'}}; }, download: async () => {}});
  assert.equal(body.cvFormat, 'both');
  assert.equal(body.includeCv, true);
});
