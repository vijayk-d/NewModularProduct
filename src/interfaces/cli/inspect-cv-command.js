function commandError(message) {
  return new Error(`CV inspection command error: ${message}`);
}

export function parseInspectCvArguments(argumentsList = []) {
  const values = Array.from(argumentsList);
  const pathFlagIndexes = values
    .map((value, index) => value === '--path' ? index : -1)
    .filter((index) => index !== -1);

  if (pathFlagIndexes.length === 0) {
    throw commandError('--path is required.');
  }

  if (pathFlagIndexes.length > 1) {
    throw commandError('--path must be specified once.');
  }

  const pathFlagIndex = pathFlagIndexes[0];
  const relativePath = String(values[pathFlagIndex + 1] || '').trim();

  if (!relativePath) {
    throw commandError('--path must have a value.');
  }

  const unexpectedArguments = values.filter(
    (value, index) =>
      index !== pathFlagIndex &&
      index !== pathFlagIndex + 1
  );

  if (unexpectedArguments.length > 0) {
    throw commandError(
      `Unexpected arguments: ${unexpectedArguments.join(', ')}.`
    );
  }

  return {
    relativePath
  };
}

export async function inspectCvCommand({
  argumentsList = [],
  extractor
} = {}) {
  if (!extractor || typeof extractor.extract !== 'function') {
    throw commandError('extractor.extract is required.');
  }

  const { relativePath } = parseInspectCvArguments(argumentsList);

  const result = await extractor.extract({
    relativePath
  });

  return {
    relativePath: result.relativePath,
    contentType: result.contentType,
    sizeBytes: result.sizeBytes,
    extractedAt: result.extractedAt,
    warningCount: Array.isArray(result.warnings)
      ? result.warnings.length
      : 0,
    textLength: String(result.text || '').length
  };
}
