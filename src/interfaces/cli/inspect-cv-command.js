const MAX_PREVIEW_LENGTH = 500;

function commandError(message) {
  return new Error(`CV inspection command error: ${message}`);
}

export function parseInspectCvArguments(argumentsList = []) {
  const values = Array.from(argumentsList);

  const pathFlagIndexes = values
    .map((value, index) => value === '--path' ? index : -1)
    .filter((index) => index !== -1);

  const previewFlagIndexes = values
    .map((value, index) => value === '--preview' ? index : -1)
    .filter((index) => index !== -1);

  if (pathFlagIndexes.length === 0) {
    throw commandError('--path is required.');
  }

  if (pathFlagIndexes.length > 1) {
    throw commandError('--path must be specified once.');
  }

  if (previewFlagIndexes.length > 1) {
    throw commandError('--preview must be specified once.');
  }

  const pathFlagIndex = pathFlagIndexes[0];

  const relativePath = String(
    values[pathFlagIndex + 1] || ''
  ).trim();

  if (!relativePath) {
    throw commandError('--path must have a value.');
  }

  const consumedIndexes = new Set([
    pathFlagIndex,
    pathFlagIndex + 1,
    ...previewFlagIndexes
  ]);

  const unexpectedArguments = values.filter(
    (_, index) => !consumedIndexes.has(index)
  );

  if (unexpectedArguments.length > 0) {
    throw commandError(
      `Unexpected arguments: ${unexpectedArguments.join(', ')}.`
    );
  }

  return {
    relativePath,
    preview: previewFlagIndexes.length === 1
  };
}

function createPreview(text) {
  const value = String(text || '');

  return {
    preview: value.slice(0, MAX_PREVIEW_LENGTH),
    previewTruncated: value.length > MAX_PREVIEW_LENGTH
  };
}

export async function inspectCvCommand({
  argumentsList = [],
  extractor
} = {}) {
  if (!extractor || typeof extractor.extract !== 'function') {
    throw commandError('extractor.extract is required.');
  }

  const {
    relativePath,
    preview
  } = parseInspectCvArguments(argumentsList);

  const result = await extractor.extract({
    relativePath
  });

  const response = {
    relativePath: result.relativePath,
    contentType: result.contentType,
    sizeBytes: result.sizeBytes,
    extractedAt: result.extractedAt,
    warningCount: Array.isArray(result.warnings)
      ? result.warnings.length
      : 0,
    textLength: String(result.text || '').length
  };

  if (preview) {
    Object.assign(response, createPreview(result.text));
  }

  return response;
}
