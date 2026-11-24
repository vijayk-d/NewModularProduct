// Saved advert readings, one per application: <state folder>/advert-requirements-v1.json. A new file of its own; no
// database or existing schema is touched. Each entry records the advert it was read from (a hash), so a changed advert
// is read again once, and a failed reading is remembered so it is never retried automatically.
// Reading never throws: a missing or damaged file means "nothing saved".
import {readFileSync, writeFileSync, renameSync, mkdirSync, lstatSync} from 'node:fs';
import path from 'node:path';

export const ADVERT_REQUIREMENTS_FILE = 'advert-requirements-v1.json';
const MAX_ENTRIES = 3000;

export function createAdvertRequirementsFileStore(stateDirectory, now = () => new Date()) {
  const file = path.join(path.resolve(stateDirectory), ADVERT_REQUIREMENTS_FILE);
  const read = () => { try { const doc = JSON.parse(readFileSync(file, 'utf8')); return doc && typeof doc.entries === 'object' && doc.entries ? doc.entries : {}; } catch { return {}; } };
  return {
    file,
    get(reviewId) { const entry = read()[reviewId]; return entry && typeof entry === 'object' ? entry : null; },
    set(reviewId, entry) {
      const entries = read();
      entries[reviewId] = {...entry, savedAt: now().toISOString()};
      const keys = Object.keys(entries);
      if (keys.length > MAX_ENTRIES) for (const k of keys.sort((a, b) => String(entries[a].savedAt).localeCompare(String(entries[b].savedAt))).slice(0, keys.length - MAX_ENTRIES)) delete entries[k];
      mkdirSync(path.dirname(file), {recursive: true});
      try { if (lstatSync(file).isSymbolicLink()) throw Object.assign(new Error('A linked advert readings file is refused.'), {code: 'ADVERT_REQUIREMENTS_LINKED'}); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      const temp = file + '.' + process.pid + '.tmp';
      writeFileSync(temp, JSON.stringify({version: 1, entries}) + '\n');
      renameSync(temp, file);
      return entries[reviewId];
    }
  };
}

// For tests and when no state folder is configured.
export function createMemoryAdvertRequirementsStore() {
  const entries = new Map();
  return {get: id => entries.get(id) || null, set: (id, entry) => { entries.set(id, {...entry}); return entry; }};
}
