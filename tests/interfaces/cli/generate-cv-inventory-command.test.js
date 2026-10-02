import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCvInventoryCommand,
  parseGenerateCvInventoryArguments
} from '../../../src/interfaces/cli/generate-cv-inventory-command.js';

test('parses a required relative output path', () => {
  assert.deepEqual(
    parseGenerateCvInventoryArguments([
      '--output',
      'inventory.json'
    ]),
    {
      relativeOutputPath: 'inventory.json',
      overwrite: false
    }
  );
});

test('parses force in either supported argument order', () => {
  assert.deepEqual(
    parseGenerateCvInventoryArguments([
      '--force',
      '--output',
      'inventory.json'
    ]),
    {
      relativeOutputPath: 'inventory.json',
      overwrite: true
    }
  );

  assert.deepEqual(
    parseGenerateCvInventoryArguments([
      '--output',
      'inventory.json',
      '--force'
    ]),
    {
      relativeOutputPath: 'inventory.json',
      overwrite: true
    }
  );
});

test('requires the output flag', () => {
  assert.throws(
    () => parseGenerateCvInventoryArguments([]),
    {
      message:
        'CV inventory generation command error: --output is required.'
    }
  );
});

test('requires an output value', () => {
  assert.throws(
    () => parseGenerateCvInventoryArguments(['--output']),
    {
      message:
        'CV inventory generation command error: --output must have a value.'
    }
  );
});

test('rejects duplicate output and force flags', () => {
  assert.throws(
    () => parseGenerateCvInventoryArguments([
      '--output',
      'one.json',
      '--output',
      'two.json'
    ]),
    {
      message:
        'CV inventory generation command error: --output must be specified once.'
    }
  );

  assert.throws(
    () => parseGenerateCvInventoryArguments([
      '--output',
      'inventory.json',
      '--force',
      '--force'
    ]),
    {
      message:
        'CV inventory generation command error: --force must be specified once.'
    }
  );
});

test('rejects unexpected arguments', () => {
  assert.throws(
    () => parseGenerateCvInventoryArguments([
      '--output',
      'inventory.json',
      '--verbose'
    ]),
    {
      message:
        'CV inventory generation command error: Unexpected arguments: --verbose.'
    }
  );
});

test('lists catalog entries once and writes a safe inventory', async () => {
  const calls = [];
  const cvs = [
    {
      relativePath: 'RTE/candidate-rte.pdf',
      roleCode: 'RTE',
      sizeBytes: 123
    }
  ];

  const result = await generateCvInventoryCommand({
    argumentsList: [
      '--output',
      'inventory.json',
      '--force'
    ],
    catalog: {
      async list() {
        calls.push('list');
        return cvs;
      }
    },
    writer: {
      async write(input) {
        calls.push(input);

        return {
          output: input.relativeOutputPath,
          created: input.cvs.length,
          overwritten: input.overwrite
        };
      }
    }
  });

  assert.deepEqual(calls, [
    'list',
    {
      relativeOutputPath: 'inventory.json',
      cvs,
      overwrite: true
    }
  ]);

  assert.deepEqual(result, {
    output: 'inventory.json',
    created: 1,
    overwritten: true
  });
});

test('requires catalog and writer implementations', async () => {
  await assert.rejects(
    () => generateCvInventoryCommand({
      argumentsList: [
        '--output',
        'inventory.json'
      ],
      writer: {
        async write() {}
      }
    }),
    {
      message:
        'CV inventory generation command error: catalog.list is required.'
    }
  );

  await assert.rejects(
    () => generateCvInventoryCommand({
      argumentsList: [
        '--output',
        'inventory.json'
      ],
      catalog: {
        async list() {
          return [];
        }
      }
    }),
    {
      message:
        'CV inventory generation command error: writer.write is required.'
    }
  );
});
