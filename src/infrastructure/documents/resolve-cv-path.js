import { win32 as path } from 'node:path';

function pathError(message) {
  return new Error(`CV path resolution error: ${message}`);
}

function requireCvFolder(cvFolder) {
  const folder = String(cvFolder || '').trim();

  if (!folder) {
    throw pathError('cvFolder is required.');
  }

  return path.resolve(folder);
}

function requireRelativePath(relativePath) {
  if (typeof relativePath !== 'string') {
    throw pathError('relativePath must be a non-empty string.');
  }

  const value = relativePath.trim();

  if (!value) {
    throw pathError('relativePath must be a non-empty string.');
  }

  if (
    path.isAbsolute(value) ||
    value.startsWith('/') ||
    value.startsWith('\\')
  ) {
    throw pathError('relativePath must not be absolute.');
  }

  return value;
}

function remainsInside(root, candidate) {
  const relative = path.relative(root, candidate);

  return Boolean(relative) &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative);
}

export function resolveCvPath({
  cvFolder,
  relativePath
} = {}) {
  const root = requireCvFolder(cvFolder);
  const relative = requireRelativePath(relativePath);
  const resolved = path.resolve(root, relative);

  if (!remainsInside(root, resolved)) {
    throw pathError('relativePath must remain inside cvFolder.');
  }

  return resolved;
}
