// Your certifications, saved once for every application (role-specific CVs often list only some of them).
// Usage (from the app folder):
//   node tools/maintenance/owner-certifications.mjs list   [--state "<state folder>"]
//   node tools/maintenance/owner-certifications.mjs add    "PRINCE2 Practitioner" "SAFe SPC" [--state "<state folder>"]
//   node tools/maintenance/owner-certifications.mjs remove "PRINCE2 Practitioner" [--state "<state folder>"]
// The state folder defaults to NMP_STATE_DIRECTORY, else ./output. The app reads the file on each request; no restart needed.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {addCertifications, removeCertification} from '../../src/domain/cv/owner-certifications.js';
import {readOwnerCertifications, writeOwnerCertifications, certificationsPath} from '../../src/infrastructure/owner-certifications-file.js';

export function parseArguments(args, env = process.env) {
  const i = args.indexOf('--state');
  if (i >= 0 && !args[i + 1]) throw Error('Give a folder after --state.');
  const rest = i >= 0 ? args.filter((a, n) => n !== i && n !== i + 1) : [...args];
  const [action, ...names] = rest;
  if (!['list', 'add', 'remove'].includes(action)) throw Error('Start with list, add or remove.');
  if (action === 'add' && !names.length) throw Error('Give at least one certification name in quotes.');
  if (action === 'remove' && names.length !== 1) throw Error('Give exactly one certification name in quotes to remove.');
  if (action === 'list' && names.length) throw Error('list takes no names.');
  return {action, names, stateDirectory: i >= 0 ? args[i + 1] : (env.NMP_STATE_DIRECTORY || path.resolve('output'))};
}

export function runCertifications({action, names, stateDirectory}) {
  const current = readOwnerCertifications(stateDirectory), lines = [];
  if (action === 'add') {
    const {list, added} = addCertifications(current, names);
    if (added.length) writeOwnerCertifications(stateDirectory, list);
    lines.push(added.length ? 'ADDED: ' + added.join('; ') : 'NOTHING ADDED: already saved.');
    return {list, lines: [...lines, ...listing(list, stateDirectory)]};
  }
  if (action === 'remove') {
    const {list, removed} = removeCertification(current, names[0]);
    if (removed) writeOwnerCertifications(stateDirectory, list);
    lines.push(removed ? 'REMOVED: ' + names[0].trim() : 'NOT FOUND: nothing removed.');
    return {list, lines: [...lines, ...listing(list, stateDirectory)]};
  }
  return {list: current, lines: listing(current, stateDirectory)};
}

function listing(list, stateDirectory) {
  return [`SAVED CERTIFICATIONS (${list.length}) in ${certificationsPath(stateDirectory)}:`, ...(list.length ? list.map(c => '  - ' + c) : ['  (none yet)'])];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { for (const line of runCertifications(parseArguments(process.argv.slice(2))).lines) console.log(line); }
  catch (e) { console.error('CERTIFICATIONS NOT CHANGED: ' + e.message); process.exitCode = 1; }
}
