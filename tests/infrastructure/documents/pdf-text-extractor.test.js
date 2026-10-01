import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPdfTextExtractor } from '../../../src/infrastructure/documents/pdf-text-extractor.js';

async function createCvFolder() {
  return mkdtemp(join(tmpdir(), 'cv-extractor-'));
}

function createExtractor({
  cvFolder,
  maxFileSizeBytes = 1024,
  parsePdf = async () => 'Extracted CV text',
  now = () => new Date('2026-10-01T16:53:00.000Z')
} = {}) {
  return createPdfTextExtractor({
    cvFolder,
    maxFileSizeBytes,
    parsePdf,
    now
  });
}

test('extracts a PDF beneath the configured CV folder', async () => {
  const cvFolder = await createCvFolder();
  const relativePath = 'RTE/candidate-rte.pdf';
  const resolvedPath = join(cvFolder, 'RTE', 'candidate-rte.pdf');

  await mkdir(join(cvFolder, 'RTE'));
  await writeFile(resolvedPath, 'synthetic-pdf');

  const extractor = createExtractor({ cvFolder });
  const result = await extractor.extract({ relativePath });

  assert.deepEqual(result, {
    relativePath,
    resolvedPath,
    text: 'Extracted CV text',
    contentType: 'application/pdf',
    sizeBytes: 13,
    extractedAt: '2026-10-01T16:53:00.000Z',
    warnings: []
  });
});

test('accepts an uppercase PDF extension', async () => {
  const cvFolder = await createCvFolder();

  await writeFile(join(cvFolder, 'candidate.PDF'), 'pdf');

  const extractor = createExtractor({ cvFolder });
  const result = await extractor.extract({
    relativePath: 'candidate.PDF'
  });

  assert.equal(result.contentType, 'application/pdf');
  assert.equal(result.text, 'Extracted CV text');
});

test('rejects a non-PDF document before reading it', async () => {
  const cvFolder = await createCvFolder();
  let parserCalled = false;

  const extractor = createExtractor({
    cvFolder,
    parsePdf: async () => {
      parserCalled = true;
      return 'unexpected';
    }
  });

  await assert.rejects(
    () => extractor.extract({
      relativePath: 'candidate.docx'
    }),
    {
      message:
        'CV PDF extraction error: Only PDF documents are supported.'
    }
  );

  assert.equal(parserCalled, false);
});

test('reports a missing document without exposing its path', async () => {
  const cvFolder = await createCvFolder();
  const extractor = createExtractor({ cvFolder });

  await assert.rejects(
    () => extractor.extract({
      relativePath: 'missing.pdf'
    }),
    {
      message:
        'CV PDF extraction error: Document was not found.'
    }
  );
});

test('rejects a directory', async () => {
  const cvFolder = await createCvFolder();

  await mkdir(join(cvFolder, 'folder.pdf'));

  const extractor = createExtractor({ cvFolder });

  await assert.rejects(
    () => extractor.extract({
      relativePath: 'folder.pdf'
    }),
    {
      message:
        'CV PDF extraction error: Document must be a file.'
    }
  );
});

test('rejects an oversized PDF before parsing it', async () => {
  const cvFolder = await createCvFolder();
  let parserCalled = false;

  await writeFile(
    join(cvFolder, 'large.pdf'),
    'this is larger than the permitted limit'
  );

  const extractor = createExtractor({
    cvFolder,
    maxFileSizeBytes: 10,
    parsePdf: async () => {
      parserCalled = true;
      return 'unexpected';
    }
  });

  await assert.rejects(
    () => extractor.extract({
      relativePath: 'large.pdf'
    }),
    {
      message:
        'CV PDF extraction error: Document exceeds the maximum size of 10 bytes.'
    }
  );

  assert.equal(parserCalled, false);
});

test('wraps parser failures in a controlled extraction error', async () => {
  const cvFolder = await createCvFolder();

  await writeFile(join(cvFolder, 'broken.pdf'), 'not-a-real-pdf');

  const extractor = createExtractor({
    cvFolder,
    parsePdf: async () => {
      throw new Error('parser implementation detail');
    }
  });

  await assert.rejects(
    () => extractor.extract({
      relativePath: 'broken.pdf'
    }),
    {
      message:
        'CV PDF extraction error: Document text extraction failed.'
    }
  );
});

test('propagates traversal rejection from the CV path resolver', async () => {
  const cvFolder = await createCvFolder();
  const extractor = createExtractor({ cvFolder });

  await assert.rejects(
    () => extractor.extract({
      relativePath: '../outside.pdf'
    }),
    {
      message:
        'CV path resolution error: relativePath must remain inside cvFolder.'
    }
  );
});

test('propagates missing CV folder rejection from the CV path resolver', async () => {
  const extractor = createExtractor({
    cvFolder: ''
  });

  await assert.rejects(
    () => extractor.extract({
      relativePath: 'candidate.pdf'
    }),
    {
      message:
        'CV path resolution error: cvFolder is required.'
    }
  );
});

test('requires a positive safe maximum file size', () => {
  assert.throws(
    () => createPdfTextExtractor({
      cvFolder: 'D:/safe/cvs',
      maxFileSizeBytes: 0
    }),
    {
      message:
        'CV PDF extraction error: maxFileSizeBytes must be a positive safe integer.'
    }
  );
});
