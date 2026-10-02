function commandError(message) {
  return new Error(
    `CV inventory generation command error: ${message}`
  );
}

export function parseGenerateCvInventoryArguments(
  argumentsList = []
) {
  const values = Array.from(argumentsList);

  const outputFlagIndexes = values
    .map((value, index) => value === '--output' ? index : -1)
    .filter((index) => index !== -1);

  const forceFlagIndexes = values
    .map((value, index) => value === '--force' ? index : -1)
    .filter((index) => index !== -1);

  if (outputFlagIndexes.length === 0) {
    throw commandError('--output is required.');
  }

  if (outputFlagIndexes.length > 1) {
    throw commandError('--output must be specified once.');
  }

  if (forceFlagIndexes.length > 1) {
    throw commandError('--force must be specified once.');
  }

  const outputFlagIndex = outputFlagIndexes[0];
  const relativeOutputPath = String(
    values[outputFlagIndex + 1] || ''
  ).trim();

  if (!relativeOutputPath) {
    throw commandError('--output must have a value.');
  }

  const consumedIndexes = new Set([
    outputFlagIndex,
    outputFlagIndex + 1,
    ...forceFlagIndexes
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
    relativeOutputPath,
    overwrite: forceFlagIndexes.length === 1
  };
}

export async function generateCvInventoryCommand({
  argumentsList = [],
  catalog,
  writer
} = {}) {
  if (!catalog || typeof catalog.list !== 'function') {
    throw commandError('catalog.list is required.');
  }

  if (!writer || typeof writer.write !== 'function') {
    throw commandError('writer.write is required.');
  }

  const {
    relativeOutputPath,
    overwrite
  } = parseGenerateCvInventoryArguments(argumentsList);

  const cvs = await catalog.list();

  return writer.write({
    relativeOutputPath,
    cvs,
    overwrite
  });
}
