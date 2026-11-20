import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { applyFeatureToggles, describeFeatures, setFeature, featureFilePath, effectiveStates, FEATURES } from '../../src/config/feature-toggles.js';
import { createFeatureTogglesHandler } from '../../src/interfaces/http/feature-toggles-http.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nmp-toggles-'));

test('evidence library is local, independent, development-on and production-off by default', () => {
  const entry = FEATURES.find(f => f.id === 'evidence-library');
  assert.equal(entry.label, 'Evidence library');
  assert.equal(entry.risk, 'local');
  assert.deepEqual(entry.requires || [], []);
  for (const mode of ['development', 'production']) {
    const file = path.join(tmp(), 'features.json');
    const env = { NMP_ENV: mode };
    applyFeatureToggles(env, { file });
    const evidence = describeFeatures(env, { file }).features.find(f => f.id === entry.id);
    assert.equal(evidence.running, mode === 'development');
    assert.equal(evidence.effective, mode === 'development');
    setFeature(env, { id: entry.id, enabled: mode !== 'development', expectedRevision: evidence.running ? 0 : 1 }, { file });
    applyFeatureToggles(env, { file });
    assert.equal(env.ENABLE_EVIDENCE_LIBRARY, mode === 'development' ? 'false' : 'true');
  }
});

test('existing files default evidence on only in development, explicit off is respected', () => {
  for (const mode of ['development', 'production']) {
    const file = path.join(tmp(), 'features.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, revision: 1, features: {} }));
    const env = { NMP_ENV: mode, ENABLE_EVIDENCE_LIBRARY: 'true' };
    applyFeatureToggles(env, { file });
    assert.equal(env.ENABLE_EVIDENCE_LIBRARY, mode === 'development' ? 'true' : 'false');
    setFeature(env, { id: 'evidence-library', enabled: false, expectedRevision: 1 }, { file });
    applyFeatureToggles(env, { file });
    assert.equal(env.ENABLE_EVIDENCE_LIBRARY, 'false');
  }
});

test('production file lives in shared/config next to shared/data', () => {
  const root = path.resolve('/prod');
  assert.equal(featureFilePath({ NMP_ENV: 'production', NMP_STATE_DIRECTORY: path.join(root, 'shared', 'data') }), path.join(root, 'shared', 'config', 'features.json'));
  assert.equal(featureFilePath({ NMP_ENV: 'development', NMP_STATE_DIRECTORY: path.join(root, 'output') }), path.join(root, 'output', 'features.json'));
  assert.equal(featureFilePath({ NMP_FEATURES_PATH: path.join(root, 'x.json') }), path.join(root, 'x.json'));
});

test('first production start seeds the file from current env so nothing changes silently', () => {
  const file = path.join(tmp(), 'features.json');
  const env = { NMP_ENV: 'production', ENABLE_GMAIL: 'true', ENABLE_GMAIL_DRAFT_CREATION: 'true', ENABLE_GMAIL_SENDING: 'false' };
  const r = applyFeatureToggles(env, { file });
  assert.equal(r.seeded, true);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(doc.features.gmail, true);
  assert.equal(doc.features['gmail-drafts'], true);
  assert.equal(doc.features['gmail-sending'], false);
  assert.equal(env.ENABLE_GMAIL_DRAFT_CREATION, 'true');
  assert.equal(env.ENABLE_PERPLEXITY_RESEARCH, 'false');
  assert.ok(fs.existsSync(path.join(path.dirname(file), 'features-audit.log')));
});

test('production file overrides production.env and missing entries are OFF', () => {
  const file = path.join(tmp(), 'features.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, revision: 4, features: { 'perplexity-research': true } }));
  const env = { NMP_ENV: 'production', ENABLE_GMAIL: 'true', ENABLE_PERPLEXITY_RESEARCH: 'false' };
  applyFeatureToggles(env, { file });
  assert.equal(env.ENABLE_PERPLEXITY_RESEARCH, 'true');
  assert.equal(env.ENABLE_GMAIL, 'false');
  for (const f of FEATURES) assert.ok(['true', 'false'].includes(env[f.env]));
});

test('development without a file leaves .env untouched', () => {
  const file = path.join(tmp(), 'features.json');
  const env = { NMP_ENV: 'development', ENABLE_GMAIL: 'true' };
  const r = applyFeatureToggles(env, { file });
  assert.equal(r.applied, false);
  assert.equal(env.ENABLE_GMAIL, 'true');
  assert.equal(fs.existsSync(file), false);
});

test('dependencies: a feature stays off until what it needs is on', () => {
  const e = effectiveStates({ 'gmail-sending': true, gmail: true });
  assert.equal(e['gmail-sending'], false, 'needs mailbox check');
  assert.equal(effectiveStates({ 'gmail-sending': true, gmail: true, 'gmail-mailbox-check': true })['gmail-sending'], true);
});

test('setFeature saves, bumps revision, rejects stale revision and needs confirmation for sending', () => {
  const file = path.join(tmp(), 'features.json');
  const env = { NMP_ENV: 'production' };
  applyFeatureToggles(env, { file });
  let view = setFeature(env, { id: 'gmail', enabled: true, expectedRevision: 1 }, { file });
  assert.equal(view.revision, 2);
  assert.equal(view.features.find(f => f.id === 'gmail').saved, true);
  assert.equal(view.features.find(f => f.id === 'gmail').restartNeeded, true, 'running env is unchanged until restart');
  assert.throws(() => setFeature(env, { id: 'gmail', enabled: false, expectedRevision: 1 }, { file }), /changed elsewhere/);
  assert.throws(() => setFeature(env, { id: 'gmail-sending', enabled: true, expectedRevision: 2 }, { file }), /confirmation/);
  view = setFeature(env, { id: 'gmail-sending', enabled: true, expectedRevision: 2, confirmed: true }, { file });
  view = setFeature(env, { id: 'gmail', enabled: false, expectedRevision: 3 }, { file });
  assert.equal(view.features.find(f => f.id === 'gmail-sending').saved, false, 'dependents switch off with their parent');
  assert.throws(() => setFeature(env, { id: 'template-cover-letter', enabled: true, expectedRevision: 4 }, { file }), /Unknown or locked/);
});

test('one-click send and quality V2 are switchable in production, off by default, and depend on their parents', () => {
  const file = path.join(tmp(), 'features.json');
  const env = { NMP_ENV: 'production', ENABLE_ONE_CLICK_SEND: 'true', ENABLE_COVER_LETTER_QUALITY_V2: 'true' };
  fs.writeFileSync(file, JSON.stringify({ version: 1, revision: 1, features: { gmail: true, 'gmail-mailbox-check': true, 'gmail-sending': true, 'cover-letter-refinement': true } }));
  applyFeatureToggles(env, { file });
  assert.equal(env.ENABLE_ONE_CLICK_SEND, 'false', 'existing production files keep new features OFF');
  assert.equal(env.ENABLE_COVER_LETTER_QUALITY_V2, 'false');
  assert.throws(() => setFeature(env, { id: 'one-click-send', enabled: true, expectedRevision: 1 }, { file }), /confirmation/);
  let view = setFeature(env, { id: 'one-click-send', enabled: true, expectedRevision: 1, confirmed: true }, { file });
  view = setFeature(env, { id: 'cover-letter-quality-v2', enabled: true, expectedRevision: 2 }, { file });
  const e2 = { NMP_ENV: 'production' };
  applyFeatureToggles(e2, { file });
  assert.equal(e2.ENABLE_ONE_CLICK_SEND, 'true');
  assert.equal(e2.ENABLE_COVER_LETTER_QUALITY_V2, 'true');
  view = setFeature(env, { id: 'gmail', enabled: false, expectedRevision: 3 }, { file });
  assert.equal(view.features.find(f => f.id === 'one-click-send').saved, false, 'switching Gmail off also switches one-click off');
  view = setFeature(env, { id: 'cover-letter-refinement', enabled: false, expectedRevision: 4 }, { file });
  assert.equal(view.features.find(f => f.id === 'cover-letter-quality-v2').saved, false);
  assert.ok(!view.developmentOnly.some(f => ['one-click-send', 'cover-letter-quality-v2'].includes(f.id)));
});

test('invalid file is reported, not guessed', () => {
  const file = path.join(tmp(), 'features.json');
  fs.writeFileSync(file, '{"version":2}');
  assert.throws(() => describeFeatures({ NMP_ENV: 'production' }, { file }), /Invalid features.json/);
});

function serve(handler) {
  return new Promise(resolve => {
    const server = http.createServer(async (req, res) => { const url = new URL(req.url, 'http://localhost'); if (!(await handler(req, res, url))) { res.writeHead(404); res.end(); } });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('settings page and API: same-origin JSON only', async () => {
  const file = path.join(tmp(), 'features.json');
  const env = { NMP_ENV: 'production', NMP_RELEASE_COMMIT: 'abc' };
  applyFeatureToggles(env, { file });
  const server = await serve(createFeatureTogglesHandler({ env, file }));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base + '/settings/features');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Feature toggles/);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    const list = await (await fetch(base + '/api/settings/features')).json();
    assert.equal(list.environment, 'production');
    assert.equal(list.revision, 1);
    const form = await fetch(base + '/api/settings/features', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'id=gmail' });
    assert.equal(form.status, 415);
    const cross = await fetch(base + '/api/settings/features', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
    assert.equal(cross.status, 403);
    const ok = await fetch(base + '/api/settings/features', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'perplexity-research', enabled: true, expectedRevision: 1 }) });
    const saved = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(saved.features.find(f => f.id === 'perplexity-research').saved, true);
    const stale = await fetch(base + '/api/settings/features', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'gmail', enabled: true, expectedRevision: 1 }) });
    assert.equal(stale.status, 409);
  } finally { server.close(); }
});
