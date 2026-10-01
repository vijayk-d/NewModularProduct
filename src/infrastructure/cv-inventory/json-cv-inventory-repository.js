import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const allowedPriorities = new Set([
  'very-high',
  'high',
  'medium',
  'low'
]);

function repositoryError(message) {
  return new Error(`CV inventory repository error: ${message}`);
}

function requireInventoryPath(inventoryPath) {
  const value = String(inventoryPath || '').trim();

  if (!value) {
    throw repositoryError('inventoryPath is required.');
  }

  return resolve(value);
}

function requireString(value, field, index) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    throw repositoryError(
      `CV entry at index ${index} requires a non-empty ${field}.`
    );
  }

  return normalized;
}

function normalizeStringArray(value, field, index) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw repositoryError(
      `CV entry at index ${index} field ${field} must be an array.`
    );
  }

  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizePriority(value, index) {
  if (value === undefined || value === null || value === '') {
    return 'medium';
  }

  const priority = String(value).trim().toLowerCase();

  if (!allowedPriorities.has(priority)) {
    throw repositoryError(
      `CV entry at index ${index} has unsupported priority "${priority}".`
    );
  }

  return priority;
}

function normalizeCv(cv, index) {
  if (!cv || typeof cv !== 'object' || Array.isArray(cv)) {
    throw repositoryError(
      `CV entry at index ${index} must be an object.`
    );
  }

  return {
    ...cv,
    role_code: requireString(cv.role_code, 'role_code', index),
    role_name: requireString(cv.role_name, 'role_name', index),
    local_path: String(cv.local_path || '').trim(),
    tags: normalizeStringArray(cv.tags, 'tags', index),
    use_cases: normalizeStringArray(cv.use_cases, 'use_cases', index),
    priority: normalizePriority(cv.priority, index)
  };
}

function extractCvs(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw repositoryError(
      'inventory root must be an object containing a CV array.'
    );
  }

  const cvs = parsed.cv_inventory?.cvs || parsed.cvs;

  if (!Array.isArray(cvs)) {
    throw repositoryError(
      'inventory must contain cv_inventory.cvs or cvs as an array.'
    );
  }

  return cvs;
}

function ensureUniqueRoleCodes(cvs) {
  const seen = new Set();

  for (const cv of cvs) {
    if (seen.has(cv.role_code)) {
      throw repositoryError(
        `duplicate role_code "${cv.role_code}".`
      );
    }

    seen.add(cv.role_code);
  }
}

export function createJsonCvInventoryRepository({
  inventoryPath
} = {}) {
  const sourcePath = requireInventoryPath(inventoryPath);

  async function load() {
    let parsed;

    try {
      const contents = await readFile(sourcePath, 'utf8');
      parsed = JSON.parse(contents);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw repositoryError('inventory file was not found.');
      }

      if (error instanceof SyntaxError) {
        throw repositoryError('inventory file contains invalid JSON.');
      }

      throw repositoryError('inventory file could not be read.');
    }

    const cvs = extractCvs(parsed).map(normalizeCv);

    ensureUniqueRoleCodes(cvs);

    return {
      cv_inventory: {
        cvs
      }
    };
  }

  return {
    load
  };
}
