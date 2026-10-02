import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectCvCommand,
  parseInspectCvArguments
} from '../../../src/interfaces/cli/inspect-cv-command.js';

test('parses one required relative CV path', () => {
  assert.deepEqual(
    parseInspectCvArguments([
      '--path',
      'RTE/candidate-rte.pdf'
    ]),
    {
      relativePath: 'RTE/candidate-rte.pdf',
      preview: false
    }
  );
});

test('parses preview in either supported argument order', () => {
  assert.deepEqual(
    parseInspectCvArguments([
      '--preview',
      '--path',
      'RTE/candidate-rte.pdf'
    ]),
    {
      relativePath: 'RTE/candidate-rte.pdf',
      preview: true
    }
  );

  assert.deepEqual(
    parseInspectCvArguments([
      '--path',
      'RTE/candidate-rte.pdf',
      '--preview'
    ]),
    {
      relativePath: 'RTE/candidate-rte.pdf',
      preview: true
    }
  );
});

test('defaults preview to false', () => {
  assert.deepEqual(
    parseInspectCvArguments([
      '--path',
      'RTE/candidate-rte.pdf'
    ]),
    {
      relativePath: 'RTE/candidate-rte.pdf',
      preview: false
    }
  );
});

test('requires the path flag', () => {
  assert.throws(
    () => parseInspectCvArguments([]),
    {
      message:
        'CV inspection command error: --path is required.'
    }
  );
});

test('requires a path value', () => {
  assert.throws(
    () => parseInspectCvArguments(['--path']),
    {
      message:
        'CV inspection command error: --path must have a value.'
    }
  );
});

test('rejects duplicate path flags', () => {
  assert.throws(
    () => parseInspectCvArguments([
      '--path',
      'first.pdf',
      '--path',
      'second.pdf'
    ]),
    {
      message:
        'CV inspection command error: --path must be specified once.'
    }
  );
});

test('rejects duplicate preview flags', () => {
  assert.throws(
    () => parseInspectCvArguments([
      '--path',
      'candidate.pdf',
      '--preview',
      '--preview'
    ]),
    {
      message:
        'CV inspection command error: --preview must be specified once.'
    }
  );
});

test('rejects unexpected arguments', () => {
  assert.throws(
    () => parseInspectCvArguments([
      '--path',
      'candidate.pdf',
      '--verbose'
    ]),
    {
      message:
        'CV inspection command error: Unexpected arguments: --verbose.'
    }
  );
});

test('returns safe metadata without document text or resolved path', async () => {
  const calls = [];

  const result = await inspectCvCommand({
    argumentsList: [
      '--path',
      'RTE/candidate-rte.pdf'
    ],
    extractor: {
      async extract(input) {
        calls.push(input);

        return {
          relativePath: input.relativePath,
          resolvedPath: 'D:\\private\\cvs\\RTE\\candidate-rte.pdf',
          text: 'Confidential CV contents',
          contentType: 'application/pdf',
          sizeBytes: 1234,
          extractedAt: '2026-10-01T17:14:00.000Z',
          warnings: ['Synthetic warning']
        };
      }
    }
  });

  assert.deepEqual(calls, [
    {
      relativePath: 'RTE/candidate-rte.pdf'
    }
  ]);

  assert.deepEqual(result, {
    relativePath: 'RTE/candidate-rte.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1234,
    extractedAt: '2026-10-01T17:14:00.000Z',
    warningCount: 1,
    textLength: 24
  });

  assert.equal(Object.hasOwn(result, 'resolvedPath'), false);
  assert.equal(Object.hasOwn(result, 'text'), false);
  assert.equal(Object.hasOwn(result, 'preview'), false);
  assert.equal(Object.hasOwn(result, 'previewTruncated'), false);
});

test('includes a bounded preview only when requested', async () => {
  const text = 'A'.repeat(600);

  const result = await inspectCvCommand({
    argumentsList: [
      '--path',
      'RTE/candidate-rte.pdf',
      '--preview'
    ],
    extractor: {
      async extract() {
        return {
          relativePath: 'RTE/candidate-rte.pdf',
          text,
          contentType: 'application/pdf',
          sizeBytes: 1234,
          extractedAt: '2026-10-01T22:30:00.000Z',
          warnings: []
        };
      }
    }
  });

  assert.equal(result.preview, 'A'.repeat(500));
  assert.equal(result.previewTruncated, true);
  assert.equal(result.textLength, 600);
});

test('does not include preview properties by default', async () => {
  const result = await inspectCvCommand({
    argumentsList: [
      '--path',
      'RTE/candidate-rte.pdf'
    ],
    extractor: {
      async extract() {
        return {
          relativePath: 'RTE/candidate-rte.pdf',
          text: 'Private CV content',
          contentType: 'application/pdf',
          sizeBytes: 1234,
          extractedAt: '2026-10-01T22:30:00.000Z',
          warnings: []
        };
      }
    }
  });

  assert.equal(Object.hasOwn(result, 'preview'), false);
  assert.equal(Object.hasOwn(result, 'previewTruncated'), false);
});

test('requires an extractor implementation', async () => {
  await assert.rejects(
    () => inspectCvCommand({
      argumentsList: [
        '--path',
        'candidate.pdf'
      ]
    }),
    {
      message:
        'CV inspection command error: extractor.extract is required.'
    }
  );
});
