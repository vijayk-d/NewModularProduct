import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelectedCvEvidenceLoader } from '../../src/application/selected-cv-evidence-loader.js';
const review = code => ({ selectedCvRoleCode: code, formData: { jobDescriptionText: 'Full role requirements' }, prepared: { recommendation: { bestCv: { role_code: 'A' } } } });
test('extracts the currently selected CV rather than the original recommendation', async () => {
  let requested;
  const load = createSelectedCvEvidenceLoader({ inventoryRepository: { async load() { return { cvs: [{ role_code: 'A', local_path: 'A.pdf' }, { role_code: 'B', local_path: 'B.pdf' }] }; } },
    documentExtractor: { async extract(value) { requested = value; return { text: 'Evidence from B', resolvedPath: 'PRIVATE ABSOLUTE PATH' }; } } });
  assert.deepEqual(await load(review('B')), { selectedCvText: 'Evidence from B', jobDescriptionText: 'Full role requirements', candidateDisplayName: 'Vijay DAFAL' });
  assert.deepEqual(requested, { relativePath: 'B.pdf' });
});
test('unknown selection prevents extraction', async () => {
  let called = false;
  const load = createSelectedCvEvidenceLoader({ inventoryRepository: { async load() { return { cvs: [] }; } }, documentExtractor: { async extract() { called = true; } } });
  await assert.rejects(load(review('missing')), { code: 'CV_EVIDENCE_UNAVAILABLE' });
  assert.equal(called, false);
});
test('empty and failed extraction return a safe actionable error', async () => {
  for (const text of ['', null]) {
    const load = createSelectedCvEvidenceLoader({ inventoryRepository: { async load() { return { cvs: [{ role_code: 'A', local_path: 'A.pdf' }] }; } }, documentExtractor: { async extract() { return { text }; } } });
    await assert.rejects(load(review('A')), /No polishing request was sent/);
  }
  const load = createSelectedCvEvidenceLoader({ inventoryRepository: { async load() { throw new Error('PRIVATE PATH'); } }, documentExtractor: { async extract() {} } });
  await assert.rejects(load(review('A')), error => error.code === 'CV_EVIDENCE_UNAVAILABLE' && !error.message.includes('PRIVATE PATH'));
});
