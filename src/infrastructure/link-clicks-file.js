// Clicks read from the link tracker: <state folder>/link-clicks-v1.json. A new file of its own that stays on this PC;
// no database or existing schema is touched. Reading never throws.
import {readFileSync, writeFileSync, renameSync, mkdirSync, lstatSync} from 'node:fs';
import path from 'node:path';

export const LINK_CLICKS_FILE = 'link-clicks-v1.json';

export function createLinkClicksFileStore(stateDirectory) {
  const file = path.join(path.resolve(stateDirectory), LINK_CLICKS_FILE);
  return {
    file,
    read() { try { const doc = JSON.parse(readFileSync(file, 'utf8')); return doc && typeof doc === 'object' && doc.state && typeof doc.state === 'object' ? doc.state : {}; } catch { return {}; } },
    write(state) {
      mkdirSync(path.dirname(file), {recursive: true});
      try { if (lstatSync(file).isSymbolicLink()) throw Object.assign(new Error('A linked link-clicks file is refused.'), {code: 'LINK_CLICKS_FILE_LINKED'}); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      const temp = file + '.' + process.pid + '.tmp';
      writeFileSync(temp, JSON.stringify({version: 1, state}) + '\n');
      renameSync(temp, file);
    }
  };
}

export function createMemoryLinkClicksStore() {
  let state = {};
  return {read: () => state, write: next => { state = JSON.parse(JSON.stringify(next)); }};
}

// Reads one page of clicks from the tracker's /api/clicks with the read key. One request, no retries, 15-second limit.
// Returns null (not set up) unless both the tracker address and a read key of at least 32 characters are configured.
export function createLinkClickReader({env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 15000} = {}) {
  let base = '';
  try { const u = new URL(String(env.LINK_TRACKING_BASE_URL || '').trim()); if (u.protocol === 'https:' && !u.username && !u.search) base = u.origin; } catch { base = ''; }
  const key = String(env.LINK_TRACKING_READ_KEY || '').trim();
  if (!base || key.length < 32 || typeof fetchImpl !== 'function') return null;
  return async ({since = '', cursor = ''} = {}) => {
    const url = new URL('/api/clicks', base);
    if (since) url.searchParams.set('since', since);
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetchImpl(url, {headers: {authorization: 'Bearer ' + key, accept: 'application/json'}, redirect: 'error', signal: AbortSignal.timeout(timeoutMs)});
    if (!response.ok) throw new Error('Tracker answered ' + response.status);
    const body = await response.json();
    if (!body || body.ok !== true) throw new Error('Tracker refused the request');
    return {clicks: body.clicks, cursor: body.cursor || '', complete: body.complete === true};
  };
}
