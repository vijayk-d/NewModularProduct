import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCvPath } from '../../../src/infrastructure/documents/resolve-cv-path.js';

test('resolves a relative CV path beneath the configured folder', () => {
  const result = resolveCvPath({
    cvFolder: 'D:/safe/cvs',
    relativePath: 'RTE/candidate-rte.pdf'
  });

  assert.equal(
    result,
    'D:\\safe\\cvs\\RTE\\candidate-rte.pdf'
  );
});

test('normalizes nested path separators using Windows semantics', () => {
  const result = resolveCvPath({
    cvFolder: 'D:\\safe\\cvs',
    relativePath: 'AgileCoach/candidate-agile-coach.pdf'
  });

  assert.equal(
    result,
    'D:\\safe\\cvs\\AgileCoach\\candidate-agile-coach.pdf'
  );
});

test('requires a CV folder', () => {
  assert.throws(
    () => resolveCvPath({
      relativePath: 'RTE/candidate-rte.pdf'
    }),
    {
      message: 'CV path resolution error: cvFolder is required.'
    }
  );
});

test('requires a non-empty relative path', () => {
  assert.throws(
    () => resolveCvPath({
      cvFolder: 'D:/safe/cvs',
      relativePath: '   '
    }),
    {
      message:
        'CV path resolution error: relativePath must be a non-empty string.'
    }
  );
});

test('rejects absolute relative paths', () => {
  const invalidPaths = [
    'D:\\other\\candidate.pdf',
    '\\\\server\\share\\candidate.pdf',
    '/other/candidate.pdf'
  ];

  for (const relativePath of invalidPaths) {
    assert.throws(
      () => resolveCvPath({
        cvFolder: 'D:/safe/cvs',
        relativePath
      }),
      {
        message:
          'CV path resolution error: relativePath must not be absolute.'
      }
    );
  }
});

test('rejects path traversal outside the configured CV folder', () => {
  assert.throws(
    () => resolveCvPath({
      cvFolder: 'D:/safe/cvs',
      relativePath: '../outside/candidate.pdf'
    }),
    {
      message:
        'CV path resolution error: relativePath must remain inside cvFolder.'
    }
  );
});
