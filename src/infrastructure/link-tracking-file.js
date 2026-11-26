// Which random tracker link id belongs to which application and recipient: <state folder>/link-tracking-v1.json.
// A new file of its own that stays on this PC; no database or existing schema is touched. Reading never throws.
import {readFileSync, writeFileSync, renameSync, mkdirSync, lstatSync} from 'node:fs';
import path from 'node:path';

export const LINK_TRACKING_FILE = 'link-tracking-v1.json';

export function createLinkTrackingFileStore(stateDirectory) {
  const file = path.join(path.resolve(stateDirectory), LINK_TRACKING_FILE);
  return {
    file,
    read() { try { const doc = JSON.parse(readFileSync(file, 'utf8')); return doc && typeof doc === 'object' && doc.state && typeof doc.state === 'object' ? doc.state : {}; } catch { return {}; } },
    write(state) {
      mkdirSync(path.dirname(file), {recursive: true});
      try { if (lstatSync(file).isSymbolicLink()) throw Object.assign(new Error('A linked link-tracking file is refused.'), {code: 'LINK_TRACKING_FILE_LINKED'}); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      const temp = file + '.' + process.pid + '.tmp';
      writeFileSync(temp, JSON.stringify({version: 1, state}) + '\n');
      renameSync(temp, file);
    }
  };
}

export function createMemoryLinkTrackingStore() {
  let state = {};
  return {read: () => state, write: next => { state = JSON.parse(JSON.stringify(next)); }};
}
