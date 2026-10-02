import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCvInventoryWriter
} from '../../../src/infrastructure/documents/cv-inventory-writer.js';

async function createDataDirectory() {
  return mkdtemp(join(tmpdir(), 'cv-inventory-writer-'));
}

const sampleCvs = [
  {
    relativePath: 'RTE/candidate-rte.pdf',
    roleCode: 'RTE',
    sizeBytes: 123
  }
];

test('writes a minimal inventory beneath the configured data directory', async () => {
  const dataDirectory = await createDataDirectory();

  const writer = createCvInventoryWriter({
    dataDirectory
  });

  const result = await writer.write({
    relativeOutputPath: 'inventories/cvs.json',
    cvs: sampleCvs
  });

  assert.deepEqual(result, {
    output: 'inventories/cvs.json',
    created: 1,
    overwritten: false
  });

  const content = await readFile(
    join(dataDirectory, 'inventories', 'cvs.json'),
    'utf8'
  );

  assert.deepEqual(
    JSON.parse(content),
    {
      cvs: sampleCvs
    }
  );
});

test('creates a valid empty inventory', async () => {
  const dataDirectory = await createDataDirectory();

  const writer = createCvInventoryWriter({
    dataDirectory
  });

  const result = await writer.write({
    relativeOutputPath: 'empty.json',
    cvs: []
  });

  assert.equal(result.created, 0);

  const content = await readFile(
    join(dataDirectory, 'empty.json'),
    'utf8'
  );

  assert.deepEqual(
    JSON.parse(content),
    {
      cvs: []
    }
  );
});

test('refuses to overwrite an existing inventory by default', async () => {
  const dataDirectory = await createDataDirectory();
  const outputPath = join(dataDirectory, 'existing.json');

  await writeFile(outputPath, '{"cvs":[]}\n');

  const writer = createCvInventoryWriter({
    dataDirectory
  });

  await assert.rejects(
    () => writer.write({
      relativeOutputPath: 'existing.json',
      cvs: sampleCvs
    }),
    {
      message:
        'CV inventory writer error: Output already exists. Use overwrite: true to replace it.'
    }
  );
});

test('overwrites an existing inventory only when explicitly allowed', async () => {
  const dataDirectory = await createDataDirectory();
  const outputPath = join(dataDirectory, 'existing.json');

  await writeFile(outputPath, '{"cvs":[]}\n');

  const writer = createCvInventoryWriter({
    dataDirectory
  });

  const result = await writer.write({
    relativeOutputPath: 'existing.json',
    cvs: sampleCvs,
    overwrite: true
  });

  assert.deepEqual(result, {
    output: 'existing.json',
    created: 1,
    overwritten: true
  });

  assert.deepEqual(
    JSON.parse(await readFile(outputPath, 'utf8')),
    {
      cvs: sampleCvs
    }
  );
});

test('requires a data directory', () => {
  assert.throws(
    () => createCvInventoryWriter(),
    {
      message:
        'CV inventory writer error: dataDirectory is required.'
    }
  );
});

test('requires a non-empty relative output path', async () => {
  const dataDirectory = await createDataDirectory();
  const writer = createCvInventoryWriter({
    dataDirectory
  });

  await assert.rejects(
    () => writer.write({
      relativeOutputPath: '   ',
      cvs: []
    }),
    {
      message:
        'CV inventory writer error: relativeOutputPath must be a non-empty string.'
    }
  );
});

test('rejects absolute and traversal output paths', async () => {
  const dataDirectory = await createDataDirectory();
  const writer = createCvInventoryWriter({
    dataDirectory
  });

  for (const relativeOutputPath of [
    'D:\\other\\inventory.json',
    '\\\\server\\share\\inventory.json',
    '/other/inventory.json'
  ]) {
    await assert.rejects(
      () => writer.write({
        relativeOutputPath,
        cvs: []
      }),
      {
        message:
          'CV inventory writer error: relativeOutputPath must not be absolute.'
      }
    );
  }

  await assert.rejects(
    () => writer.write({
      relativeOutputPath: '../outside.json',
      cvs: []
    }),
    {
      message:
        'CV inventory writer error: relativeOutputPath must remain inside dataDirectory.'
    }
  );
});

test('requires a JSON output file extension', async () => {
  const dataDirectory = await createDataDirectory();
  const writer = createCvInventoryWriter({
    dataDirectory
  });

  await assert.rejects(
    () => writer.write({
      relativeOutputPath: 'inventory.txt',
      cvs: []
    }),
    {
      message:
        'CV inventory writer error: relativeOutputPath must use the .json extension.'
    }
  );
});

test('requires an array of CVs and a boolean overwrite value', async () => {
  const dataDirectory = await createDataDirectory();
  const writer = createCvInventoryWriter({
    dataDirectory
  });

  await assert.rejects(
    () => writer.write({
      relativeOutputPath: 'inventory.json',
      cvs: {}
    }),
    {
      message:
        'CV inventory writer error: cvs must be an array.'
    }
  );

  await assert.rejects(
    () => writer.write({
      relativeOutputPath: 'inventory.json',
      cvs: [],
      overwrite: 'true'
    }),
    {
      message:
        'CV inventory writer error: overwrite must be a boolean.'
    }
  );
});
