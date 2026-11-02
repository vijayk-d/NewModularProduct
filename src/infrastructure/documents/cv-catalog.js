import { readdir, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { win32 as path } from 'node:path';
import { resolveCvPath } from './resolve-cv-path.js';

const DEFAULT_ROLE_CODES = [
  'RTE',
  'AgileCoach',
  'ADL',
  'DM',
  'SM',
  'ProgMgr',
  'ProjectMgr',
  'Technical-PM',
  'PM - AI',
  'Agile PM',
  'GCC-UAE',
  'Saudi'
];

function catalogError(message, options = {}) {
  return new Error(`CV catalog error: ${message}`, options);
}

function normalizeRoleCodes(roleCodes) {
  if (!Array.isArray(roleCodes) || roleCodes.length === 0) {
    throw catalogError('roleCodes must be a non-empty array.');
  }

  const values = roleCodes.map((roleCode) => String(roleCode || '').trim());

  if (values.some((roleCode) => !roleCode)) {
    throw catalogError('roleCodes must not contain empty values.');
  }

  if (new Set(values.map((roleCode) => roleCode.toLowerCase())).size !== values.length) {
    throw catalogError('roleCodes must not contain duplicates.');
  }

  return values;
}

async function readRoleDirectory(roleDirectory) {
  try {
    return await readdir(roleDirectory, {
      withFileTypes: true
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    throw catalogError('Role directory could not be read.', {
      cause: error
    });
  }
}

export function createCvCatalog({
  cvFolder,
  roleCodes = DEFAULT_ROLE_CODES
} = {}) {
  const allowedRoleCodes = normalizeRoleCodes(roleCodes);

  resolveCvPath({
    cvFolder,
    relativePath: allowedRoleCodes[0]
  });

  return {
    async list() {
      const cvs = [];

      for (const roleCode of allowedRoleCodes) {
        const roleDirectory = resolveCvPath({
          cvFolder,
          relativePath: roleCode
        });

        const entries = await readRoleDirectory(roleDirectory);

        for (const entry of entries) {
          if (
            !entry.isFile() ||
            !['.pdf','.docx'].includes(extname(entry.name).toLowerCase())
          ) {
            continue;
          }

          const relativePath = path.join(roleCode, entry.name);
          const resolvedPath = resolveCvPath({
            cvFolder,
            relativePath
          });

          let metadata;

          try {
            metadata = await stat(resolvedPath);
          } catch (error) {
            throw catalogError('CV file metadata could not be read.', {
              cause: error
            });
          }

          if (!metadata.isFile()) {
            continue;
          }

          cvs.push({
            relativePath,
            roleCode,
            sizeBytes: metadata.size
          });
        }
      }

      return cvs;
    }
  };
}
