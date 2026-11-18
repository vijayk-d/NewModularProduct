// Email-domain lookups, kept in the state folder (backed up with the other local data), not in the release folder.
// Writes go to a temporary file first, then replace the old one, so a crash mid-write cannot leave half a file.
// An unreadable file is never overwritten: saving stops with an error, and the file is left for inspection.
import {readFile, writeFile, rename, mkdir, unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const fail = message => { throw Object.assign(new Error(message), {code: 'EMAIL_DOMAIN_STORE', statusCode: 503}); };

async function readJson(file) {
  let text;
  try { text = await readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch { fail(`The email-domain file "${path.basename(file)}" is unreadable. It was left unchanged; move it aside to start a new one.`); }
}

export function createJsonEmailDomainStore({filePath, legacyPath = '', clock = () => new Date()} = {}) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) fail('An absolute email-domain store path is required.');
  let queue = Promise.resolve();
  // One write at a time, so two lookups finishing together cannot lose each other's result.
  const serial = task => { const run = queue.then(task, task); queue = run.catch(() => {}); return run; };

  async function load() {
    const current = await readJson(filePath);
    if (current) return current;
    // First run after the move: read the old file once. It is never changed or deleted.
    if (legacyPath) { try { return (await readJson(legacyPath)) || {}; } catch { return {}; } }
    return {};
  }

  async function save(store) {
    await mkdir(path.dirname(filePath), {recursive: true});
    const temp = filePath + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temp, JSON.stringify(store, null, 2), {encoding: 'utf8', flag: 'wx'});
      await rename(temp, filePath);
    } catch (error) { await unlink(temp).catch(() => {}); throw error; }
  }

  return {
    async get(reviewId) { return (await load())[reviewId] || null; },
    save(reviewId, resolution) {
      return serial(async () => {
        const store = await load();
        store[reviewId] = {...resolution, resolvedAt: clock().toISOString()};
        await save(store);
        return store[reviewId];
      });
    }
  };
}
