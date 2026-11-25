// Email-open alerts read from Gmail and the counts per application: <state folder>/email-open-signals-v1.json.
// A new file of its own; no database or existing schema is touched. Reading never throws.
import {readFileSync, writeFileSync, renameSync, mkdirSync, lstatSync} from 'node:fs';
import path from 'node:path';

export const EMAIL_OPEN_SIGNALS_FILE = 'email-open-signals-v1.json';

export function createEmailOpenSignalsFileStore(stateDirectory) {
  const file = path.join(path.resolve(stateDirectory), EMAIL_OPEN_SIGNALS_FILE);
  return {
    file,
    read() { try { const doc = JSON.parse(readFileSync(file, 'utf8')); return doc && typeof doc === 'object' && doc.state && typeof doc.state === 'object' ? doc.state : {}; } catch { return {}; } },
    write(state) {
      mkdirSync(path.dirname(file), {recursive: true});
      try { if (lstatSync(file).isSymbolicLink()) throw Object.assign(new Error('A linked email-opens file is refused.'), {code: 'OPENS_FILE_LINKED'}); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      const temp = file + '.' + process.pid + '.tmp';
      writeFileSync(temp, JSON.stringify({version: 1, state}) + '\n');
      renameSync(temp, file);
    }
  };
}

export function createMemoryEmailOpenSignalsStore() {
  let state = {};
  return {read: () => state, write: next => { state = JSON.parse(JSON.stringify(next)); }};
}
