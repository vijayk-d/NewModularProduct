import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelectedCvEvidenceLoader } from '../../src/application/selected-cv-evidence-loader.js';
const review = { selectedCvRoleCode: 'DM', formData: { jobDescriptionText: 'Full JD' } };
const inventoryRepository = { async load() { return { cvs: [{ role_code: 'DM', local_path: 'DM/example.pdf' }] }; } };
test('CV and LinkedIn PDF are extracted separately without sending absolute paths', async () => {
  const paths = [];
  const load = createSelectedCvEvidenceLoader({ inventoryRepository, linkedinRelativePath: 'LinkedIn Profile.pdf',
    documentExtractor: { async extract({ relativePath }) { paths.push(relativePath); return { text: relativePath === 'LinkedIn Profile.pdf' ? 'Profile experience' : 'CV experience', resolvedPath: 'PRIVATE ROOT' }; } } });
  const result = await load(review);
  assert.equal(result.selectedCvText, 'CV experience');
  assert.equal(result.candidateLinkedInText, 'Profile experience');
  assert.equal(result.jobDescriptionText, 'Full JD');
  assert.deepEqual(paths, ['DM/example.pdf', 'LinkedIn Profile.pdf']);
  assert.ok(!JSON.stringify(result).includes('PRIVATE ROOT'));
});
test('unconfigured profile does not request a second document', async () => {
  const paths = [];
  const load = createSelectedCvEvidenceLoader({ inventoryRepository, documentExtractor: { async extract({ relativePath }) { paths.push(relativePath); return { text: 'CV experience' }; } } });
  const result = await load(review);
  assert.deepEqual(paths, ['DM/example.pdf']);
  assert.equal(result.candidateLinkedInText, undefined);
});
test('configured missing or empty profile produces actionable error', async () => {
  for (const failure of ['missing', 'empty']) {
    const load = createSelectedCvEvidenceLoader({ inventoryRepository, linkedinRelativePath: 'LinkedIn Profile.pdf',
      documentExtractor: { async extract({ relativePath }) {
        if (relativePath !== 'LinkedIn Profile.pdf') return { text: 'CV experience' };
        if (failure === 'missing') throw new Error('PRIVATE PATH');
        return { text: '' };
      } } });
    await assert.rejects(load(review), error => error.code === 'LINKEDIN_EVIDENCE_UNAVAILABLE' && error.message.includes('No polishing request was sent') && !error.message.includes('PRIVATE PATH'));
  }
});
