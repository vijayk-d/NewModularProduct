import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveEvidenceLibraryPath } from '../../src/config/evidence-library-runtime.js';

test('development retains its state path without shared configuration', () => {
  const state = path.resolve('output');
  assert.equal(resolveEvidenceLibraryPath({ env: {}, mode: 'development', state }), path.join(state, 'assignment-evidence-library-v1.db'));
});

test('development and enabled production share one database and create its folder', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmp-evidence-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { NMP_CV_LIBRARY_DIRECTORY: root, ENABLE_EVIDENCE_LIBRARY: 'true' };
  const expected = path.join(root, 'evidence', 'assignment-evidence-library-v1.db');
  for (const mode of ['development', 'production']) {
    assert.equal(resolveEvidenceLibraryPath({ env, mode, state: '/unused' }), expected);
    assert.ok(fs.statSync(path.dirname(expected)).isDirectory());
  }
});

test('production fails closed without a shared directory or enabled toggle', () => {
  assert.equal(resolveEvidenceLibraryPath({ env: { ENABLE_EVIDENCE_LIBRARY: 'true' }, mode: 'production' }), null);
  assert.equal(resolveEvidenceLibraryPath({ env: { NMP_CV_LIBRARY_DIRECTORY: 'relative' }, mode: 'production' }), null);
  assert.equal(resolveEvidenceLibraryPath({ env: { NMP_ENV: 'production', NMP_CV_LIBRARY_DIRECTORY: 'relative' }, mode: 'production' }), null);
});

test('verification ignores real configuration, while live shared paths must be absolute', () => {
  const env = { NMP_CV_LIBRARY_DIRECTORY: 'relative', ENABLE_EVIDENCE_LIBRARY: 'true' };
  assert.equal(resolveEvidenceLibraryPath({ env, mode: 'verification' }), null);
  for (const mode of ['development', 'production']) {
    assert.throws(() => resolveEvidenceLibraryPath({ env, mode }), /absolute/);
  }
});
