import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { PDFParse } from 'pdf-parse';
import { resolveCvPath } from './resolve-cv-path.js';

function extractionError(message, options = {}) {
  return new Error(`CV PDF extraction error: ${message}`, options);
}

function requirePositiveFileSizeLimit(maxFileSizeBytes) {
  if (
    !Number.isSafeInteger(maxFileSizeBytes) ||
    maxFileSizeBytes <= 0
  ) {
    throw extractionError(
      'maxFileSizeBytes must be a positive safe integer.'
    );
  }

  return maxFileSizeBytes;
}

function requirePdfPath(relativePath) {
  if (extname(String(relativePath || '')).toLowerCase() !== '.pdf') {
    throw extractionError('Only PDF documents are supported.');
  }
}

async function readFileMetadata(resolvedPath) {
  try {
    return await stat(resolvedPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw extractionError('Document was not found.', {
        cause: error
      });
    }

    throw extractionError('Document could not be read.', {
      cause: error
    });
  }
}

export function createPdfTextExtractor({
  cvFolder,
  maxFileSizeBytes = 10 * 1024 * 1024,
  parsePdf = async (buffer) => {
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText();

      return result.text;
    } finally {
      await parser.destroy();
    }
  },
  now = () => new Date()
} = {}) {
  const maximumSize = requirePositiveFileSizeLimit(maxFileSizeBytes);

  return {
    async extract({ relativePath } = {}) {
      requirePdfPath(relativePath);

      const resolvedPath = resolveCvPath({
        cvFolder,
        relativePath
      });

      const metadata = await readFileMetadata(resolvedPath);

      if (!metadata.isFile()) {
        throw extractionError('Document must be a file.');
      }

      if (metadata.size > maximumSize) {
        throw extractionError(
          `Document exceeds the maximum size of ${maximumSize} bytes.`
        );
      }

      let buffer;

      try {
        buffer = await readFile(resolvedPath);
      } catch (error) {
        throw extractionError('Document could not be read.', {
          cause: error
        });
      }

      let text;

      try {
        text = await parsePdf(buffer);
      } catch (error) {
        throw extractionError('Document text extraction failed.', {
          cause: error
        });
      }

      return {
        relativePath,
        resolvedPath,
        text: String(text || ''),
        contentType: 'application/pdf',
        sizeBytes: metadata.size,
        extractedAt: now().toISOString(),
        warnings: []
      };
    }
  };
}
