import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCvLibrary} from '../../src/infrastructure/cv-inventory/cv-library-v1.js';
import {attachIndexedText, withoutCvText, describeSections} from '../../src/application/cv-text-index.js';
import {prepareApplication} from '../../src/application/prepare-application.js';

const catalogue = {cvs: [
  {role_code: 'SM', role_name: 'Scrum Master', local_path: 'SM/cv.pdf', tags: ['scrum'], use_cases: ['team coaching'], priority: 'high'},
  {role_code: 'DM', role_name: 'Delivery Manager', local_path: 'DM/cv.pdf', tags: ['delivery'], use_cases: [], priority: 'medium'}
]};

async function fixture(t, {describe = null} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-index-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const folder = path.join(root, 'documents');
  await fs.mkdir(path.join(root, 'config'));
  for (const [code, text] of [['SM', 'Scrum master coaching teams. Agile delivery with Jira and SAFe PI planning.'], ['DM', 'Delivery manager for AI programmes, stakeholder management and risk management.']]) {
    await fs.mkdir(path.join(folder, code), {recursive: true});
    await fs.writeFile(path.join(folder, code, 'cv.pdf'), text);
  }
  await fs.writeFile(path.join(root, 'config', 'cv-library.json'), JSON.stringify(catalogue));
  const lib = createCvLibrary({projectRoot: root, cataloguePath: path.join(root, 'config', 'cv-library.json'), cvFolder: folder, privateDirectory: path.join(root, 'output', 'cv-library-v1'), describe,
    adapter: {async extract({relativePath}) { return {text: await fs.readFile(path.join(folder, ...relativePath.split('/')), 'utf8')}; }}});
  return {root, folder, lib};
}

test('index records add word count, top terms, Word file and sections', async t => {
  const f = await fixture(t, {describe: async e => e.role_code === 'SM' ? {word: {name: 'cv.docx', match: 'same-name'}, sections: 'SUMMARY + EXPERIENCE (3 employers)'} : Promise.reject(Object.assign(new Error('No Word file.'), {status: 409}))});
  await f.lib.reindex({mode: 'all'});
  const snap = await f.lib.snapshot();
  const sm = snap.indexed.find(x => x.role_code === 'SM'), dm = snap.indexed.find(x => x.role_code === 'DM');
  assert.equal(sm.status, 'indexed');
  assert.equal(sm.wordCount, 12);
  assert.ok(sm.topTerms.length > 0);
  assert.deepEqual([sm.word, sm.sections], [{name: 'cv.docx', match: 'same-name'}, 'SUMMARY + EXPERIENCE (3 employers)']);
  assert.equal(dm.status, 'indexed', 'a Word check failure does not stop indexing');
  assert.equal(dm.describeError, 'No Word file.');
});

test('only CVs whose index matches the current file give their text to ranking', async t => {
  const f = await fixture(t);
  assert.deepEqual((await f.lib.indexedTexts()).fallback, ['SM', 'DM'], 'nothing indexed yet');
  await f.lib.reindex({mode: 'all'});
  let r = await f.lib.indexedTexts();
  assert.deepEqual(Object.keys(r.texts).sort(), ['DM', 'SM']);
  await new Promise(res => setTimeout(res, 20));
  await fs.writeFile(path.join(f.folder, 'DM', 'cv.pdf'), 'Changed delivery CV text.');
  r = await f.lib.indexedTexts();
  assert.deepEqual(Object.keys(r.texts), ['SM']);
  assert.deepEqual(r.fallback, ['DM']);
  assert.equal((await f.lib.snapshot()).indexed.find(x => x.role_code === 'DM').status, 'changed');
  await f.lib.reindex({mode: 'changed'});
  assert.deepEqual(Object.keys((await f.lib.indexedTexts()).texts).sort(), ['DM', 'SM']);
});

test('background indexing runs on a timer and records the result', async t => {
  const f = await fixture(t);
  const stop = f.lib.startAutoIndex({initialDelayMs: 10, intervalMs: 60000, log: () => {}});
  t.after(stop);
  for (let i = 0; i < 50 && !(await f.lib.snapshot()).autoIndex.lastRunAt; i++) await new Promise(res => setTimeout(res, 20));
  const snap = await f.lib.snapshot();
  assert.deepEqual(snap.autoIndex.lastResult, {indexed: 2, unchanged: 0, failed: 0});
  assert.equal(snap.indexed.every(x => x.status === 'indexed'), true);
});

test('indexed text changes ranking basis but is stripped before anything is saved', () => {
  const inventory = {cvs: catalogue.cvs};
  const withText = attachIndexedText(inventory, {DM: 'Delivery manager for AI programmes, stakeholder management and risk management.'});
  assert.equal(withText.cvs.find(c => c.role_code === 'DM').text.length > 10, true);
  assert.equal('text' in withText.cvs.find(c => c.role_code === 'SM'), false);
  const template = 'Dear {{recruiterName}},\n\nI am applying for {{role}}.\n\nKind regards,\n{{candidateName}}';
  const prepared = prepareApplication({jobDescriptionText: 'Delivery Manager. Stakeholder management and risk management for AI programmes.', inventory: withText, coverLetterTemplate: template, candidateProfile: {displayName: 'Test Candidate'}});
  assert.equal(prepared.rankedCvs[0].cv.role_code, 'DM');
  assert.equal(prepared.rankedCvs[0].ats.basis, 'cv-text');
  const saved = withoutCvText(prepared);
  assert.doesNotMatch(JSON.stringify(saved), /stakeholder management and risk management\./, 'no CV text in what is saved');
  assert.equal(saved.rankedCvs[0].ats.basis, 'cv-text');
  assert.equal(describeSections({profile: {supported: true, heading: 'SUMMARY'}, experience: {supported: true, heading: 'EXPERIENCE', roles: [1, 2]}}), 'SUMMARY + EXPERIENCE (2 employers)');
});
