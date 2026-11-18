// A small record of an unexpected stop, so the next start can say what happened.
// Kept in the state folder. It holds the time, error type and code locations only: never the
// error message, which could contain letter or CV text. Node still prints the full stack to the log.
import {writeFileSync, renameSync, readFileSync, existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const FILE = 'last-crash.json';

export function crashSummary(kind, error, now = new Date()) {
  const frames = String(error?.stack || '').split('\n').slice(1)
    .map(line => line.trim().replace(/^at\s+/, ''))
    .map(line => (/([^\s()]+\.(?:m?js|py)):(\d+)(?::\d+)?\)?$/.exec(line) || [])[0] || '')
    .map(location => location.replace(/^file:\/\/\//, '').replace(/\)$/, '').split(/[\\/]/).slice(-3).join('/'))
    .filter(Boolean).slice(0, 8);
  return {at: now.toISOString(), kind, name: String(error?.name || typeof error).slice(0, 60), code: /^[A-Z0-9_]{1,60}$/.test(String(error?.code || '')) ? error.code : '', frames};
}

export function writeCrashRecord(stateDirectory, summary) {
  mkdirSync(stateDirectory, {recursive: true});
  const target = path.join(stateDirectory, FILE), temp = target + '.' + randomUUID() + '.tmp';
  writeFileSync(temp, JSON.stringify(summary, null, 2), {encoding: 'utf8', flag: 'wx'});
  renameSync(temp, target);
  return target;
}

// At start-up: report a previous unexpected stop once, then move the record aside (never deleted).
export function takePreviousCrash(stateDirectory, now = new Date()) {
  const target = path.join(stateDirectory, FILE);
  if (!existsSync(target)) return null;
  let summary = null;
  try { summary = JSON.parse(readFileSync(target, 'utf8')); } catch { summary = {at: '', kind: 'unknown', name: 'unreadable record', code: '', frames: []}; }
  try { renameSync(target, path.join(stateDirectory, 'last-crash-' + now.toISOString().replace(/[:.]/g, '-') + '.json')); } catch {}
  return summary;
}

export function installCrashHandlers({stateDirectory, processRef = process, log = console.error, exit = code => processRef.exit(code), clock = () => new Date()}) {
  let handling = false;
  const handle = kind => error => {
    if (handling) return;
    handling = true;
    const summary = crashSummary(kind, error, clock());
    let where = '';
    try { where = writeCrashRecord(stateDirectory, summary); } catch { where = '(crash record could not be written)'; }
    log(`[CRASH] ${summary.at} ${kind}: ${summary.name}${summary.code ? ' ' + summary.code : ''}${summary.frames[0] ? ' at ' + summary.frames[0] : ''}. Stopping. Details: ${where}. The full stack is above.`);
    if (error?.stack) log(error.stack);
    exit(1);
  };
  processRef.on('uncaughtException', handle('uncaughtException'));
  processRef.on('unhandledRejection', handle('unhandledRejection'));
}
