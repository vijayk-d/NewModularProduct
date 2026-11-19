// Read-only probes for the System check page. Nothing here writes, deletes, sends or makes a paid call.
// Credentials are never read into the report: only whether a feature is on and a key is present.
import {readdir, stat, readFile, statfs} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {openSqlite} from './sqlite-open.js';
import {checkOutputFolder} from './applications/application-output-folder.js';
import {TEMPLATE_FOLDER} from './documents/template-cover-letter.js';
import {providerTimeLimitMs} from './provider-time-limit.js';

const GB = 2 ** 30;
const gb = bytes => (bytes / GB).toFixed(1) + ' GB';
const CORE_DATABASES = ['application-reviews-v1.db', 'job-imports-v1.db', 'outreach.db'];
const OPTIONAL_DATABASES = ['workflow-automation-v1.db', 'cv-tailoring-v1.db', 'application-insights-v1.db', 'application-intelligence-v1.db'];
const WORD_PATHS = ['C:/Program Files/Microsoft Office/root/Office16/WINWORD.EXE', 'C:/Program Files (x86)/Microsoft Office/root/Office16/WINWORD.EXE',
  'C:/Program Files/Microsoft Office/Office16/WINWORD.EXE', 'C:/Program Files (x86)/Microsoft Office/Office16/WINWORD.EXE'];
const on = value => String(value ?? '').trim().toLowerCase() === 'true';

async function folderSize(dir, limit = 20000) {
  let total = 0, seen = 0;
  const walk = async d => {
    for (const e of await readdir(d, {withFileTypes: true})) {
      if (++seen > limit) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full); else if (e.isFile()) total += (await stat(full)).size;
    }
  };
  await walk(dir);
  return total;
}

export function createSystemCheckProbes({stateDirectory, cvFolder = '', outputFolder = '', outputForbidden = [], cvTailoringService = null, cvLibrary = null, locateWord = null, probeFiles = null,
  config = {}, env = process.env, platform = process.platform, wordPaths = WORD_PATHS, now = () => new Date(), minFreeMemoryGb = Number(env.NMP_MIN_FREE_MEMORY_GB) || 3}) {
  let host = null;
  // One probe call for memory and CV file availability, shared by the checks that need it.
  async function hostProbe() {
    if (host) return host;
    const entries = typeof cvLibrary === 'function' ? (await cvLibrary()) || [] : [];
    const paths = [];
    for (const e of entries) {
      if (!e?.local_path) continue;
      paths.push({roleCode: e.role_code, kind: 'PDF', path: e.local_path});
      const word = typeof locateWord === 'function' ? await locateWord(e.local_path).catch(() => null) : null;
      if (word?.relativePath) paths.push({roleCode: e.role_code, kind: 'Word', path: word.relativePath});
    }
    const result = typeof probeFiles === 'function' && cvFolder ? await probeFiles(cvFolder, paths.map(p => p.path)) : {commitFreeGb: null, files: []};
    host = {commitFreeGb: result.commitFreeGb, files: paths.map((p, i) => ({...p, ...(result.files?.[i] || {exists: null, cloudOnly: false})}))};
    return host;
  }

  return [
    {id: 'databases', group: 'Local data', label: 'Databases open and pass an integrity check', async run() {
      const names = (await readdir(stateDirectory).catch(() => [])).filter(n => /\.db$/i.test(n));
      const missing = CORE_DATABASES.filter(n => !names.includes(n));
      const bad = [];
      for (const name of names) {
        let db;
        try { db = openSqlite(path.join(stateDirectory, name), {readOnly: true}); const r = Object.values(db.prepare('PRAGMA quick_check').get() || {})[0]; if (r !== 'ok') bad.push(`${name} (${String(r).slice(0, 80)})`); }
        catch (error) { bad.push(`${name} (${error.code || 'cannot open'})`); }
        finally { try { db?.close(); } catch {} }
      }
      if (bad.length) return {status: 'fail', detail: `Integrity problem: ${bad.join('; ')}.`, fix: 'Stop the app and keep a copy of the state folder. Do not delete the file; restore it from the latest backup in shared\\backups if needed.'};
      const optional = OPTIONAL_DATABASES.filter(n => !names.includes(n));
      return {status: missing.length ? 'warn' : 'pass', detail: `${names.length} database${names.length === 1 ? '' : 's'} checked, all ok.${missing.length ? ` Not created yet: ${missing.join(', ')}.` : ''}${optional.length ? ` Created on first use: ${optional.join(', ')}.` : ''}`,
        fix: missing.length ? 'A core database is created on first use. If you have used that feature before, check the state folder setting.' : ''};
    }},
    {id: 'email-domains', group: 'Local data', label: 'Email-domain lookups file is readable', async run() {
      const file = path.join(stateDirectory, 'email-domain-resolutions-v1.json');
      if (!existsSync(file)) return {status: 'pass', detail: 'Not created yet; it is created after the first Find email domain.'};
      try { const v = JSON.parse(await readFile(file, 'utf8')); return {status: 'pass', detail: `${Object.keys(v || {}).length} saved lookups.`}; }
      catch { return {status: 'fail', detail: 'The file is unreadable, so new lookups cannot be saved.', fix: 'Move email-domain-resolutions-v1.json out of the state folder; a new one is created on the next lookup.'}; }
    }},
    {id: 'previous-crash', group: 'Local data', label: 'No recent unexpected stop', async run() {
      const records = (await readdir(stateDirectory).catch(() => [])).filter(n => /^last-crash(-.+)?\.json$/.test(n)).sort();
      if (!records.length) return {status: 'pass', detail: 'No unexpected stop recorded.'};
      let latest = {};
      try { latest = JSON.parse(await readFile(path.join(stateDirectory, records.at(-1)), 'utf8')); } catch {}
      const at = Date.parse(latest.at || ''), recent = Number.isFinite(at) && now() - at < 7 * 86400000;
      return {status: recent ? 'warn' : 'pass', detail: `${records.length} recorded stop${records.length === 1 ? '' : 's'}; latest ${latest.at || 'unknown time'} (${latest.kind || '?'}: ${latest.name || '?'}${latest.frames?.[0] ? ' at ' + latest.frames[0] : ''}).`,
        fix: recent ? 'Look at the log from that time (production: shared\\logs). If it happens again, share the [CRASH] line.' : ''};
    }},
    {id: 'cv-library', group: 'CV library', label: 'Every CV has a Word file with recognised sections', async run() {
      if (!cvTailoringService?.checkLibrary) return {status: 'off', detail: 'Tailored CV is unavailable in this configuration.'};
      const report = await cvTailoringService.checkLibrary();
      const notReady = report.rows.filter(r => !r.ready);
      if (!report.checked) return {status: 'warn', detail: 'The CV library is empty.', fix: 'Add CVs on the CV library page.'};
      return notReady.length
        ? {status: 'warn', detail: `${report.ready} of ${report.checked} CVs ready. Not ready: ${notReady.map(r => `${r.roleCode} (${r.problem})`).join('; ')}`, fix: 'Open Tailored CV on an application that uses that CV to choose its Word file or headings, or fix the file in the CV folder.'}
        : {status: 'pass', detail: `All ${report.checked} CVs ready for tailoring.`};
    }},
    {id: 'cv-files', group: 'CV library', label: 'CV files are on this PC (not online-only)', async run() {
      const {files} = await hostProbe();
      if (!files.length) return {status: 'off', detail: 'No CV files to check.'};
      const missing = files.filter(f => f.exists === false), cloud = files.filter(f => f.cloudOnly);
      if (missing.length) return {status: 'fail', detail: `Missing: ${missing.map(f => `${f.roleCode} ${f.kind} "${f.path}"`).join('; ')}.`, fix: 'Restore the file in the CV folder, or update the CV library entry.'};
      if (cloud.length) return {status: 'warn', detail: `Online-only in OneDrive: ${cloud.map(f => `${f.roleCode} ${f.kind} "${f.path}"`).join('; ')}.`, fix: 'In File Explorer, right-click the CV folder → Always keep on this device, so drafts and exports never wait for a download.'};
      return {status: 'pass', detail: `${files.length} CV files present and stored on this PC.`};
    }},
    {id: 'letter-template', group: 'Documents', label: 'Cover-letter Word template is set', async run() {
      const folder = path.join(stateDirectory, TEMPLATE_FOLDER);
      const ready = existsSync(path.join(folder, 'settings.json')) && existsSync(path.join(folder, 'template.docx'));
      return ready ? {status: 'pass', detail: 'Export pack uses your Word template (letterhead, bullets, highlights) and makes a PDF.'}
        : {status: 'warn', detail: 'No template is set, so the Export pack falls back to a plain Word letter.', fix: 'Run tools\\maintenance\\set-cover-letter-template.mjs with your template (see docs/cover-letter-template.md).'};
    }},
    {id: 'output-folder', group: 'Documents', label: 'Save to folder destination', async run() {
      try { const folder = await checkOutputFolder(outputFolder, {forbidden: outputForbidden}); return {status: 'pass', detail: `Files are saved to ${folder}.`}; }
      catch (error) { return {status: error.code === 'OUTPUT_FOLDER_NOT_SET' ? 'warn' : 'fail', detail: error.message, fix: 'Set APPLICATION_OUTPUT_FOLDER in the .env file to an existing folder outside the app and CV folders, then restart.'}; }
    }},
    {id: 'word', group: 'Documents', label: 'Microsoft Word is available for PDFs', async run() {
      if (platform !== 'win32') return {status: 'off', detail: 'Word PDFs are made on Windows only.'};
      const found = wordPaths.find(p => existsSync(p));
      return found ? {status: 'pass', detail: 'Word found; tailored CV and letter PDFs can be made.'}
        : {status: 'warn', detail: 'Word was not found in the usual Office folders.', fix: 'Tailored-CV PDFs need Microsoft Word installed. Downloads and DOCX still work.'};
    }},
    ...[['research', 'Organisation research (Perplexity)', config.features?.enablePerplexityResearch],
      ['polish', 'Cover-letter and CV polish (Perplexity)', config.features?.enableCoverLetterRefinement]].map(([id, label, enabled]) => ({
      id: 'feature-' + id, group: 'Services', label, async run() {
        const key = Boolean(String(config.integrations?.perplexity?.apiKey || '').trim());
        if (!enabled) return {status: 'off', detail: 'Switched off in configuration.'};
        return key ? {status: 'pass', detail: `On, with an API key configured. Each call stops after ${providerTimeLimitMs(env) / 1000} s and is never retried.`}
          : {status: 'fail', detail: 'On, but no Perplexity API key is configured.', fix: 'Add PERPLEXITY_API_KEY to the .env file, or switch the feature off, then restart.'};
      }})),
    {id: 'feature-gmail', group: 'Services', label: 'Gmail', async run() {
      if (!on(env.ENABLE_GMAIL)) return {status: 'off', detail: 'Gmail is switched off in configuration.'};
      const parts = [['drafts', env.ENABLE_GMAIL_DRAFT_CREATION], ['sending', env.ENABLE_GMAIL_SENDING], ['mailbox check', env.ENABLE_GMAIL_MAILBOX_CHECK], ['signature', env.ENABLE_GMAIL_SIGNATURE]];
      const configured = Boolean(String(config.integrations?.gmail?.clientId || '').trim() && String(config.integrations?.gmail?.clientSecret || '').trim());
      const detail = 'On: ' + parts.map(([n, v]) => `${n} ${on(v) ? 'on' : 'off'}`).join(', ') + '.';
      return configured ? {status: 'pass', detail} : {status: 'fail', detail: detail + ' Gmail client credentials are not configured.', fix: 'Add the Gmail OAuth client settings to the .env file, or set ENABLE_GMAIL=false, then restart.'};
    }},
    {id: 'disk', group: 'This PC', label: 'Free disk space for local data', async run() {
      const s = await statfs(stateDirectory);
      const free = Number(s.bavail) * Number(s.bsize);
      return free < GB ? {status: 'fail', detail: `Only ${gb(free)} free.`, fix: 'Free disk space now: saving and shipping can fail on a full disk.'}
        : free < 5 * GB ? {status: 'warn', detail: `${gb(free)} free.`, fix: 'Free some disk space; old release backups are a large part (see below).'}
        : {status: 'pass', detail: `${gb(free)} free.`};
    }},
    {id: 'memory', group: 'This PC', label: 'Free memory for shipping a release', async run() {
      const {commitFreeGb} = await hostProbe();
      if (commitFreeGb == null) return {status: 'off', detail: 'Free commit charge can only be read on Windows.'};
      return commitFreeGb < minFreeMemoryGb ? {status: 'warn', detail: `${commitFreeGb} GB free commit charge; shipping needs ${minFreeMemoryGb} GB.`, fix: 'Close browsers and large apps, or restart Windows, before running ship.cmd.'}
        : {status: 'pass', detail: `${commitFreeGb} GB free commit charge.`};
    }},
    {id: 'backups', group: 'This PC', label: 'Release backups', async run() {
      const folder = path.join(path.dirname(stateDirectory), 'backups');
      if (path.basename(stateDirectory).toLowerCase() !== 'data' || !existsSync(folder)) return {status: 'off', detail: 'Release backups exist only in production.'};
      const items = (await readdir(folder, {withFileTypes: true})).filter(d => d.isDirectory());
      const size = await folderSize(folder);
      return {status: items.length > 30 || size > 20 * GB ? 'warn' : 'pass', detail: `${items.length} backup${items.length === 1 ? '' : 's'}, ${gb(size)} in total.`,
        fix: items.length > 30 || size > 20 * GB ? 'Preview a clean-up with: python tools\\deploy\\release_backups.py --production-root <production folder> --keep 10 (nothing changes without --apply).' : ''};
    }}
  ];
}
