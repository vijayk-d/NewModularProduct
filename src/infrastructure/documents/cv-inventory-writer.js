import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, win32 as path } from 'node:path';

function writerError(message, options = {}) {
  return new Error(`CV inventory writer error: ${message}`, options);
}

function requireDataDirectory(dataDirectory) {
  const directory = String(dataDirectory || '').trim();

  if (!directory) {
    throw writerError('dataDirectory is required.');
  }

  return path.resolve(directory);
}

function requireRelativeOutputPath(relativeOutputPath) {
  if (typeof relativeOutputPath !== 'string') {
    throw writerError(
      'relativeOutputPath must be a non-empty string.'
    );
  }

  const value = relativeOutputPath.trim();

  if (!value) {
    throw writerError(
      'relativeOutputPath must be a non-empty string.'
    );
  }

  if (
    path.isAbsolute(value) ||
    value.startsWith('/') ||
    value.startsWith('\\')
  ) {
    throw writerError('relativeOutputPath must not be absolute.');
  }

  if (extname(value).toLowerCase() !== '.json') {
    throw writerError(
      'relativeOutputPath must use the .json extension.'
    );
  }

  return value;
}

function remainsInside(root, candidate) {
  const relative = path.relative(root, candidate);

  return Boolean(relative) &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative);
}

function resolveOutputPath({
  dataDirectory,
  relativeOutputPath
}) {
  const root = requireDataDirectory(dataDirectory);
  const relative = requireRelativeOutputPath(relativeOutputPath);
  const resolved = path.resolve(root, relative);

  if (!remainsInside(root, resolved)) {
    throw writerError(
      'relativeOutputPath must remain inside dataDirectory.'
    );
  }

  return {
    root,
    relative,
    resolved
  };
}

function normalizeCvs(cvs) {
  if (!Array.isArray(cvs)) {
    throw writerError('cvs must be an array.');
  }

  return cvs.map((cv) => ({
    relativePath: String(cv?.relativePath || ''),
    roleCode: String(cv?.roleCode || ''),
    sizeBytes: Number(cv?.sizeBytes)
  }));
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }

    throw writerError('Output path could not be checked.', {
      cause: error
    });
  }
}

export function createCvInventoryWriter({
  dataDirectory
} = {}) {
  const configuredDataDirectory = requireDataDirectory(dataDirectory);

  return {
    async write({
      relativeOutputPath,
      cvs,
      overwrite = false
    } = {}) {
      if (typeof overwrite !== 'boolean') {
        throw writerError('overwrite must be a boolean.');
      }

      const output = resolveOutputPath({
        dataDirectory: configuredDataDirectory,
        relativeOutputPath
      });

      const safeCvs = normalizeCvs(cvs);
      const exists = await fileExists(output.resolved);

      if (exists && !overwrite) {
        throw writerError(
          'Output already exists. Use overwrite: true to replace it.'
        );
      }

      try {
        await mkdir(path.dirname(output.resolved), {
          recursive: true
        });

        await writeFile(
          output.resolved,
          `${JSON.stringify({ cvs: safeCvs }, null, 2)}\n`,
          'utf8'
        );
      } catch (error) {
        throw writerError('Inventory output could not be written.', {
          cause: error
        });
      }

      return {
        output: output.relative,
        created: safeCvs.length,
        overwritten: exists
      };
    }
  };
}
