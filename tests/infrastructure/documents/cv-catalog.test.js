import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCvCatalog
} from '../../../src/infrastructure/documents/cv-catalog.js';

async function createCvFolder() {
  return mkdtemp(join(tmpdir(), 'cv-catalog-'));
}

test('lists only direct PDF files from allowed role folders', async () => {
  const cvFolder = await createCvFolder();

  await mkdir(join(cvFolder, 'RTE'));
  await mkdir(join(cvFolder, 'RTE', 'successes'));
  await mkdir(join(cvFolder, 'AgileCoach'));

  await writeFile(
    join(cvFolder, 'RTE', 'candidate-rte.pdf'),
    'rte'
  );

  await writeFile(
    join(cvFolder, 'RTE', 'notes.txt'),
    'notes'
  );

  await writeFile(
    join(cvFolder, 'RTE', 'successes', 'cover-letter.pdf'),
    'cover-letter'
  );

  await writeFile(
    join(cvFolder, 'AgileCoach', 'candidate-coach.PDF'),
    'coach'
  );

  const catalog = createCvCatalog({
    cvFolder,
    roleCodes: ['RTE', 'AgileCoach']
  });

  const result = await catalog.list();

  assert.deepEqual(result, [
    {
      relativePath: 'RTE\\candidate-rte.pdf',
      roleCode: 'RTE',
      sizeBytes: 3
    },
    {
      relativePath: 'AgileCoach\\candidate-coach.PDF',
      roleCode: 'AgileCoach',
      sizeBytes: 5
    }
  ]);
});

test('skips configured role folders that do not exist', async () => {
  const cvFolder = await createCvFolder();

  const catalog = createCvCatalog({
    cvFolder,
    roleCodes: ['RTE']
  });

  assert.deepEqual(
    await catalog.list(),
    []
  );
});

test('requires a configured CV folder', () => {
  assert.throws(
    () => createCvCatalog({
      roleCodes: ['RTE']
    }),
    {
      message:
        'CV path resolution error: cvFolder is required.'
    }
  );
});

test('requires at least one allowed role code', () => {
  assert.throws(
    () => createCvCatalog({
      cvFolder: 'D:/safe/cvs',
      roleCodes: []
    }),
    {
      message:
        'CV catalog error: roleCodes must be a non-empty array.'
    }
  );
});

test('rejects empty role codes', () => {
  assert.throws(
    () => createCvCatalog({
      cvFolder: 'D:/safe/cvs',
      roleCodes: ['RTE', '   ']
    }),
    {
      message:
        'CV catalog error: roleCodes must not contain empty values.'
    }
  );
});

test('rejects duplicate role codes without case sensitivity', () => {
  assert.throws(
    () => createCvCatalog({
      cvFolder: 'D:/safe/cvs',
      roleCodes: ['RTE', 'rte']
    }),
    {
      message:
        'CV catalog error: roleCodes must not contain duplicates.'
    }
  );
});
