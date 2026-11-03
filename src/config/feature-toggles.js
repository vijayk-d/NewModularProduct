import fs from 'node:fs';
import path from 'node:path';

// Production feature toggles.
// - Each toggle maps to the existing ENABLE_* environment flag the code already reads.
// - Production: features.json (shared/config) is the source of truth; missing entries are OFF.
//   On first start it is seeded from the current production.env values, so behaviour never changes silently.
// - Development/verification: the file is optional; without it the .env values are used unchanged.
// - Changes are saved immediately and take effect when the server restarts.
export const FEATURES = Object.freeze([
  { id: 'gmail', env: 'ENABLE_GMAIL', label: 'Gmail connection', description: 'Lets the app use the configured Gmail account. Every Gmail feature below needs this.', risk: 'mailbox' },
  { id: 'gmail-mailbox-check', env: 'ENABLE_GMAIL_MAILBOX_CHECK', requires: ['gmail'], label: 'Mailbox check', description: 'Verifies the authenticated mailbox matches the configured sender address.', risk: 'mailbox' },
  { id: 'gmail-drafts', env: 'ENABLE_GMAIL_DRAFT_CREATION', requires: ['gmail'], label: 'Gmail drafts', description: 'Creates Gmail drafts from queued emails. Nothing is sent.', risk: 'mailbox' },
  { id: 'gmail-draft-updates', env: 'ENABLE_GMAIL_DRAFT_UPDATES', requires: ['gmail', 'gmail-drafts'], label: 'Gmail draft updates', description: 'Updates existing Gmail drafts after letter edits.', risk: 'mailbox' },
  { id: 'gmail-signature', env: 'ENABLE_GMAIL_SIGNATURE', requires: ['gmail'], label: 'Gmail signature', description: 'Adds the Gmail signature to drafts and sent emails.', risk: 'mailbox' },
  { id: 'gmail-sending', env: 'ENABLE_GMAIL_SENDING', requires: ['gmail', 'gmail-mailbox-check'], label: 'Send emails', description: 'Allows sending reviewed emails to contacts. Duplicate protection still applies; every send needs a click.', risk: 'sends-email' },
  { id: 'perplexity-research', env: 'ENABLE_PERPLEXITY_RESEARCH', label: 'Organisation research', description: 'Uses the Perplexity API for organisation research (paid API calls).', risk: 'paid-api' },
  { id: 'cover-letter-refinement', env: 'ENABLE_COVER_LETTER_REFINEMENT', label: 'Cover-letter polishing', description: 'Uses the Perplexity API to refine cover letters (paid API calls).', risk: 'paid-api' },
  { id: 'cover-letter-quality-v2', env: 'ENABLE_COVER_LETTER_QUALITY_V2', requires: ['cover-letter-refinement'], label: 'Cover-letter quality V2', description: 'New letter quality checks: evidence audit, source-bound claims and role-focused examples during polishing.', risk: 'paid-api' },
  { id: 'one-click-send', env: 'ENABLE_ONE_CLICK_SEND', requires: ['gmail-sending'], label: 'One-click send', description: 'Send without the extra confirmation popup. The labelled Send click is still required; duplicate protection and the bound-content check stay on.', risk: 'sends-email' }
]);

// Features that the code currently limits to development on port 3000. Shown on the page, not switchable.
export const DEVELOPMENT_ONLY = Object.freeze([
  { id: 'cloud-scheduling', env: 'ENABLE_CLOUD_SCHEDULING', label: 'Cloud scheduling', description: 'Scheduled sending through Google Sheets.' },
  { id: 'template-cover-letter', env: null, label: 'Template cover letter', description: 'Local template-based cover-letter documents.' }
]);

const byId = new Map(FEATURES.map(f => [f.id, f]));
const truthy = v => ['true', '1', 'yes'].includes(String(v ?? '').trim().toLowerCase());

export function featureFilePath(env = process.env) {
  if (env.NMP_FEATURES_PATH) return path.resolve(env.NMP_FEATURES_PATH);
  const mode = String(env.NMP_ENV || 'development');
  const state = path.resolve(env.NMP_STATE_DIRECTORY || 'output');
  // Production state is <root>/shared/data, so the file lives in <root>/shared/config.
  return mode === 'production' ? path.join(state, '..', 'config', 'features.json') : path.join(state, 'features.json');
}

export function readFeatureFile(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  const doc = JSON.parse(raw);
  if (!doc || doc.version !== 1 || typeof doc.features !== 'object' || !Number.isInteger(doc.revision)) throw new Error('Invalid features.json; fix or remove it.');
  const features = {};
  for (const [id, value] of Object.entries(doc.features)) if (byId.has(id) && typeof value === 'boolean') features[id] = value;
  return { version: 1, revision: doc.revision, updatedAt: doc.updatedAt || null, features };
}

function writeAtomic(file, doc) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

export function effectiveStates(saved) {
  const out = {};
  const resolve = (id, seen = new Set()) => {
    if (id in out) return out[id];
    if (seen.has(id)) return false;
    seen.add(id);
    const f = byId.get(id);
    out[id] = saved[id] === true && (f.requires || []).every(r => resolve(r, seen));
    return out[id];
  };
  for (const f of FEATURES) resolve(f.id);
  return out;
}

// Called once at server start, before any module reads the ENABLE_* flags.
export function applyFeatureToggles(env = process.env, { file = featureFilePath(env), now = () => new Date().toISOString() } = {}) {
  const mode = String(env.NMP_ENV || 'development');
  let doc = readFeatureFile(file), seeded = false;
  if (!doc) {
    if (mode !== 'production') return { mode, file, applied: false, seeded: false };
    const features = Object.fromEntries(FEATURES.map(f => [f.id, truthy(env[f.env])]));
    doc = { version: 1, revision: 1, updatedAt: now(), features };
    writeAtomic(file, doc);
    appendAudit(file, { at: now(), action: 'seeded-from-environment', features });
    seeded = true;
  }
  const effective = effectiveStates(doc.features);
  for (const f of FEATURES) env[f.env] = effective[f.id] ? 'true' : 'false';
  return { mode, file, applied: true, seeded, revision: doc.revision };
}

function appendAudit(file, entry) {
  try { fs.appendFileSync(path.join(path.dirname(file), 'features-audit.log'), JSON.stringify(entry) + '\n', 'utf8'); } catch { /* audit is best effort */ }
}

export function describeFeatures(env = process.env, { file = featureFilePath(env) } = {}) {
  const doc = readFeatureFile(file);
  const saved = doc ? doc.features : Object.fromEntries(FEATURES.map(f => [f.id, truthy(env[f.env])]));
  const effective = effectiveStates(saved);
  return {
    environment: String(env.NMP_ENV || 'development'),
    release: env.NMP_RELEASE_COMMIT || 'development',
    file,
    fileExists: Boolean(doc),
    revision: doc ? doc.revision : 0,
    updatedAt: doc ? doc.updatedAt : null,
    features: FEATURES.map(f => {
      const running = truthy(env[f.env]);
      return { id: f.id, env: f.env, label: f.label, description: f.description, risk: f.risk, requires: f.requires || [], saved: saved[f.id] === true, effective: effective[f.id], running, restartNeeded: running !== effective[f.id] };
    }),
    developmentOnly: DEVELOPMENT_ONLY.map(f => ({ ...f, running: f.env ? truthy(env[f.env]) : null }))
  };
}

export function setFeature(env = process.env, { id, enabled, expectedRevision, confirmed = false }, { file = featureFilePath(env), now = () => new Date().toISOString() } = {}) {
  const f = byId.get(id);
  if (!f) throw Object.assign(new Error('Unknown or locked feature.'), { status: 400 });
  if (typeof enabled !== 'boolean') throw Object.assign(new Error('enabled must be true or false.'), { status: 400 });
  if (enabled && f.risk === 'sends-email' && confirmed !== true) throw Object.assign(new Error('Sending needs explicit confirmation.'), { status: 400 });
  const current = readFeatureFile(file) || { version: 1, revision: 0, features: Object.fromEntries(FEATURES.map(x => [x.id, truthy(env[x.env])])) };
  if (expectedRevision !== current.revision) throw Object.assign(new Error('Toggles changed elsewhere. Reload the page.'), { status: 409 });
  const features = { ...current.features, [id]: enabled };
  // Switching a feature off also switches off anything that depends on it, so saved state stays honest.
  if (!enabled) { let changed = true; while (changed) { changed = false; for (const other of FEATURES) if (features[other.id] && (other.requires || []).some(r => features[r] === false || features[r] === undefined)) { features[other.id] = false; changed = true; } } }
  const doc = { version: 1, revision: current.revision + 1, updatedAt: now(), features };
  writeAtomic(file, doc);
  appendAudit(file, { at: doc.updatedAt, action: 'set', id, enabled, revision: doc.revision, environment: String(env.NMP_ENV || 'development') });
  return describeFeatures(env, { file });
}
