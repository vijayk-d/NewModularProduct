// Reads and writes the owner's certifications: <state folder>/owner-certifications-v1.json. A new file of its own;
// no database or existing schema is touched. Reading never throws: a missing or damaged file means "none saved".
import {readFileSync, writeFileSync, renameSync, mkdirSync, lstatSync} from 'node:fs';
import path from 'node:path';
import {normaliseCertifications} from '../domain/cv/owner-certifications.js';

export const CERTIFICATIONS_FILE = 'owner-certifications-v1.json';

export function certificationsPath(stateDirectory) { return path.join(path.resolve(stateDirectory), CERTIFICATIONS_FILE); }

export function readOwnerCertifications(stateDirectory) {
  try {
    const doc = JSON.parse(readFileSync(certificationsPath(stateDirectory), 'utf8'));
    return normaliseCertifications(doc?.certifications);
  } catch { return []; }
}

export function writeOwnerCertifications(stateDirectory, list, now = () => new Date()) {
  const file = certificationsPath(stateDirectory);
  mkdirSync(path.dirname(file), {recursive: true});
  try { if (lstatSync(file).isSymbolicLink()) throw Object.assign(new Error('A linked certifications file is refused.'), {code: 'CERTIFICATIONS_LINKED'}); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temp = file + '.' + process.pid + '.tmp';
  writeFileSync(temp, JSON.stringify({version: 1, updatedAt: now().toISOString(), certifications: normaliseCertifications(list)}, null, 2) + '\n');
  renameSync(temp, file);
  return file;
}

// For the server: a cheap reader that picks up changes made by the maintenance command without a restart.
export function createOwnerCertificationsReader(stateDirectory) {
  return () => readOwnerCertifications(stateDirectory);
}
