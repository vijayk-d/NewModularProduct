import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';

function repositoryError(message) {
  return new Error(`Template repository error: ${message}`);
}

function validateTemplateDirectory(templateDirectory) {
  const value = String(templateDirectory || '').trim();

  if (!value) {
    throw repositoryError('templateDirectory is required.');
  }

  return resolve(value);
}

function validateTemplateId(templateId) {
  if (typeof templateId !== 'string') {
    throw repositoryError('templateId must be a non-empty string.');
  }

  const id = templateId.trim();

  if (!id) {
    throw repositoryError('templateId must be a non-empty string.');
  }

  if (
    id.includes('..') ||
    id.includes('/') ||
    id.includes('\\') ||
    isAbsolute(id) ||
    basename(id) !== id
  ) {
    throw repositoryError(
      'templateId must be a simple template name without paths.'
    );
  }

  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
    throw repositoryError(
      'templateId may contain only letters, numbers, hyphens, and underscores.'
    );
  }

  return id;
}

function isWithinDirectory(directory, candidate) {
  const pathFromDirectory = relative(directory, candidate);

  return pathFromDirectory &&
    !pathFromDirectory.startsWith('..') &&
    !isAbsolute(pathFromDirectory);
}

export function createFileTemplateRepository({
  templateDirectory
} = {}) {
  const rootDirectory = validateTemplateDirectory(templateDirectory);

  async function load(templateId) {
    const id = validateTemplateId(templateId);
    const sourcePath = resolve(rootDirectory, `${id}.md`);

    if (!isWithinDirectory(rootDirectory, sourcePath)) {
      throw repositoryError('resolved template path escapes templateDirectory.');
    }

    try {
      const content = await readFile(sourcePath, 'utf8');

      return {
        id,
        content,
        sourcePath
      };
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw repositoryError(`template "${id}" was not found.`);
      }

      throw repositoryError(
        `template "${id}" could not be read.`
      );
    }
  }

  return {
    load
  };
}
