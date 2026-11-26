import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync, rmSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runSystemCheck, summaryLine} from '../../src/application/system-check.js';
import {createSystemCheckProbes} from '../../src/infrastructure/system-check-probes.js';
import {openSqlite} from '../../src/infrastructure/sqlite-open.js';
import {renderSystemCheck} from '../../src/interfaces/http/system-check-http.js';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';

function folder(t) { const dir = mkdtempSync(path.join(tmpdir(), 'syscheck-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; }
const now = () => new Date('2026-11-18T12:00:00.000Z');
const byId = report => Object.fromEntries(report.groups.flatMap(g => g.items).map(i => [i.id, i]));

test('checks run in order, a throwing check is a failure, and the summary names the worst result', async () => {
  const report = await runSystemCheck([
    {id: 'a', group: 'G1', label: 'A', run: async () => ({status: 'pass', detail: 'fine'})},
    {id: 'b', group: 'G1', label: 'B', run: async () => { throw new Error('boom'); }},
    {id: 'c', group: 'G2', label: 'C', run: async () => ({status: 'off', detail: 'off'})}
  ], {clock: now});
  assert.equal(report.overall, 'fail');
  assert.deepEqual(report.counts, {pass: 1, warn: 0, fail: 1, off: 1});
  assert.deepEqual(report.groups.map(g => g.group), ['G1', 'G2']);
  assert.match(byId(report).b.detail, /could not run/);
  assert.equal(summaryLine(report), '1 problem to fix, 0 warnings.');
  const html = renderSystemCheck(report);
  assert.match(html, /<title>System check<\/title>/);
  assert.match(html, /data-check="b" data-status="fail"/);
});

function healthyState(dir) {
  const state = path.join(dir, 'data');
  mkdirSync(path.join(state, 'cover-letter-export'), {recursive: true});
  for (const name of ['application-reviews-v1.db', 'job-imports-v1.db', 'outreach.db']) { const db = openSqlite(path.join(state, name)); db.exec('CREATE TABLE t(x)'); db.close(); }
  writeFileSync(path.join(state, 'cover-letter-export', 'settings.json'), '{}');
  writeFileSync(path.join(state, 'cover-letter-export', 'template.docx'), 'PK');
  mkdirSync(path.join(dir, 'backups', 'before-abc'), {recursive: true});
  writeFileSync(path.join(dir, 'backups', 'before-abc', 'a.db'), 'x'.repeat(1000));
  const output = path.join(dir, 'out');
  mkdirSync(output);
  return {state, output};
}

test('a healthy setup passes, features that are off show as off, and no credential appears', async t => {
  const dir = folder(t), {state, output} = healthyState(dir);
  const probes = createSystemCheckProbes({stateDirectory: state, cvFolder: dir, outputFolder: output, platform: 'win32', wordPaths: [path.join(state, 'cover-letter-export', 'template.docx')], now,
    cvTailoringService: {checkLibrary: async () => ({checked: 2, ready: 2, rows: []})},
    cvLibrary: async () => [{role_code: 'PM', local_path: 'PM/cv.pdf'}], locateWord: async () => ({relativePath: 'PM/cv.docx'}),
    probeFiles: async (root, paths) => ({commitFreeGb: 12.5, files: paths.map(() => ({exists: true, cloudOnly: false}))}),
    config: {features: {enablePerplexityResearch: true, enableCoverLetterRefinement: false}, integrations: {perplexity: {apiKey: 'sk-SECRET'}}}, env: {ENABLE_GMAIL: 'false'}});
  const report = await runSystemCheck(probes, {clock: now});
  const r = byId(report);
  for (const id of ['databases', 'email-domains', 'previous-crash', 'cv-library', 'cv-files', 'letter-template', 'output-folder', 'word', 'feature-research', 'memory', 'backups']) assert.equal(r[id].status, 'pass', id + ': ' + r[id].detail);
  assert.equal(r['feature-polish'].status, 'off');
  assert.equal(r['feature-gmail'].status, 'off');
  assert.match(r.backups.detail, /1 backup, /);
  assert.match(r['feature-research'].detail, /stops after 90 s/);
  assert.doesNotMatch(JSON.stringify(report), /SECRET/);
});

test('problems are reported with a fix: corrupt database, online-only CV, missing key, low memory, recent crash', async t => {
  const dir = folder(t), {state} = healthyState(dir);
  writeFileSync(path.join(state, 'broken.db'), 'not a database at all, just text that is long enough to be read as a header'.repeat(20));
  writeFileSync(path.join(state, 'last-crash-2026-11-18T10-00-00-000Z.json'), JSON.stringify({at: '2026-11-18T10:00:00.000Z', kind: 'uncaughtException', name: 'TypeError', frames: ['a.js:1:1']}));
  const probes = createSystemCheckProbes({stateDirectory: state, cvFolder: dir, outputFolder: '', platform: 'win32', wordPaths: [], now,
    cvLibrary: async () => [{role_code: 'PM', local_path: 'PM/cv.pdf'}, {role_code: 'SM', local_path: 'SM/cv.pdf'}], locateWord: async () => null,
    probeFiles: async () => ({commitFreeGb: 1.2, files: [{exists: true, cloudOnly: true}, {exists: true, cloudOnly: false}]}),
    config: {features: {enablePerplexityResearch: true}, integrations: {perplexity: {apiKey: ''}}}, env: {}});
  const r = byId(await runSystemCheck(probes, {clock: now}));
  assert.equal(r.databases.status, 'fail');
  assert.match(r.databases.detail, /broken\.db/);
  assert.match(r.databases.fix, /Do not delete/);
  assert.equal(r['cv-files'].status, 'warn');
  assert.match(r['cv-files'].fix, /Always keep on this device/);
  assert.equal(r['feature-research'].status, 'fail');
  assert.equal(r.memory.status, 'warn');
  assert.equal(r['previous-crash'].status, 'warn');
  assert.equal(r['output-folder'].status, 'warn');
  assert.equal(r.word.status, 'warn');
  assert.equal(r['cv-library'].status, 'off');
});

test('a missing CV file is a failure', async t => {
  const dir = folder(t), {state} = healthyState(dir);
  const probes = createSystemCheckProbes({stateDirectory: state, cvFolder: dir, now, cvLibrary: async () => [{role_code: 'PM', local_path: 'PM/cv.pdf'}],
    probeFiles: async () => ({commitFreeGb: 8, files: [{exists: false, cloudOnly: false}]}), config: {}, env: {}});
  const r = byId(await runSystemCheck(probes, {clock: now}));
  assert.equal(r['cv-files'].status, 'fail');
  assert.match(r['cv-files'].detail, /PM PDF "PM\/cv\.pdf"/);
});

test('the page and JSON are served by the local server and listed under System', async t => {
  const server = createLocalServer({systemCheck: async () => runSystemCheck([{id: 'x', group: 'Local data', label: 'X', run: async () => ({status: 'warn', detail: 'look'})}], {clock: now}),
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const page = await fetch(base + '/system-check');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /No problems; 1 warning to review\./);
  assert.match(html, /href="\/system-check"/);
  const json = await (await fetch(base + '/api/system-check')).json();
  assert.equal(json.overall, 'warn');
  assert.equal((await fetch(base + '/api/system-check', {headers: {'sec-fetch-site': 'cross-site'}})).status, 403);
});

test('link-click tracker: off makes no request; on checks the privacy page and the read key once each, never showing keys', async t => {
  const dir = folder(t), {state} = healthyState(dir);
  const base = {ENABLE_LINK_TRACKING: 'true', LINK_TRACKING_BASE_URL: 'https://links.example.test', LINK_TRACKING_SIGNING_KEY: 'S'.repeat(40), LINK_TRACKING_PROFILE_URL: 'https://www.linkedin.com/in/test-candidate/'};
  const run = async (env, answer) => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({url, auth: init.headers.authorization || ''}); const r = answer(url); if (r instanceof Error) throw r; return {status: r}; };
    const probes = createSystemCheckProbes({stateDirectory: state, now, env, config: {}, fetchImpl});
    return {r: byId(await runSystemCheck(probes.filter(p => p.id === 'feature-link-tracking'), {clock: now}))['feature-link-tracking'], calls};
  };
  let out = await run({}, () => 200);
  assert.equal(out.r.status, 'off'); assert.equal(out.calls.length, 0);
  out = await run({...base, LINK_TRACKING_SIGNING_KEY: 'short'}, () => 200);
  assert.equal(out.r.status, 'fail'); assert.match(out.r.detail, /LINK_TRACKING_SIGNING_KEY/); assert.equal(out.calls.length, 0);
  out = await run({...base, LINK_TRACKING_READ_KEY: 'R'.repeat(40)}, () => 200);
  assert.equal(out.r.status, 'pass', out.r.detail);
  assert.deepEqual(out.calls.map(c => new URL(c.url).pathname), ['/privacy', '/api/clicks']);
  assert.equal(out.calls[1].auth, 'Bearer ' + 'R'.repeat(40));
  assert.doesNotMatch(JSON.stringify(out.r), /RRRR|SSSS/);
  out = await run(base, () => 200);
  assert.equal(out.r.status, 'warn'); assert.match(out.r.fix, /LINK_TRACKING_READ_KEY/); assert.equal(out.calls.length, 1);
  out = await run({...base, LINK_TRACKING_READ_KEY: 'R'.repeat(40)}, url => url.includes('/api/clicks') ? 401 : 200);
  assert.equal(out.r.status, 'fail'); assert.match(out.r.detail, /refused the read key/);
  out = await run({...base, LINK_TRACKING_READ_KEY: 'R'.repeat(40)}, () => new TypeError('fetch failed'));
  assert.equal(out.r.status, 'fail'); assert.match(out.r.detail, /not reachable/); assert.equal(out.calls.length, 1, 'no retry');
});

test('/healthz reports the link tracker from settings only, and stays ok when it is not set up', async t => {
  for (const [tracker, expected] of [[null, 'off'], [{status: () => ({enabled: true, ready: false})}, 'not-set-up'], [{status: () => ({enabled: true, ready: true})}, 'ready']]) {
    const server = createLocalServer({linkTracker: tracker});
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const body = await (await fetch('http://127.0.0.1:' + server.address().port + '/healthz')).json();
    server.closeAllConnections(); server.close();
    assert.equal(body.ok, true); assert.equal(body.service, 'NewModularProduct'); assert.equal(body.dependencies.linkTracker, expected);
  }
});
