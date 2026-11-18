// New, separate store for workflow automation. It never opens or changes existing databases.
import {openSqlite} from '../sqlite-open.js';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

const fail = message => { throw Object.assign(new Error(message), {code: 'WORKFLOW_AUTOMATION_STORE', statusCode: 503}); };

export function createWorkflowAutomationStore({filePath, clock = () => Date.now()} = {}) {
  if (typeof filePath !== 'string' || !filePath) fail('Explicit workflow automation store path required.');
  if (filePath !== ':memory:') mkdirSync(path.dirname(filePath), {recursive: true});
  const db = openSqlite(filePath);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  if (names.length && !names.includes('workflow_automation_meta')) { db.close(); fail('Unrecognised workflow automation database; nothing overwritten.'); }
  if (names.includes('workflow_automation_meta') && db.prepare("SELECT value FROM workflow_automation_meta WHERE key='schema'").get()?.value !== '1') { db.close(); fail('Unsupported workflow automation schema.'); }
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_automation_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO workflow_automation_meta VALUES('schema','1');
CREATE TABLE IF NOT EXISTS organisation_research(organisation_key TEXT PRIMARY KEY,organisation_name TEXT NOT NULL,research_json TEXT NOT NULL,researched_at INTEGER NOT NULL,origin TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS automatic_research_calls(day TEXT PRIMARY KEY,calls INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS portal_exports(id INTEGER PRIMARY KEY AUTOINCREMENT,review_id TEXT NOT NULL,job_advert_link TEXT NOT NULL,exported_at INTEGER NOT NULL);`);
  const day = () => new Date(clock()).toISOString().slice(0, 10);
  return {
    getResearch(key) {
      const row = db.prepare('SELECT organisation_name,research_json,researched_at,origin FROM organisation_research WHERE organisation_key=?').get(key);
      if (!row) return null;
      try { return {organisationName: row.organisation_name, research: JSON.parse(row.research_json), researchedAt: row.researched_at, origin: row.origin}; } catch { return null; }
    },
    putResearch(key, organisationName, research, origin) {
      db.prepare('INSERT INTO organisation_research VALUES(?,?,?,?,?) ON CONFLICT(organisation_key) DO UPDATE SET organisation_name=excluded.organisation_name,research_json=excluded.research_json,researched_at=excluded.researched_at,origin=excluded.origin')
        .run(key, organisationName, JSON.stringify(research), clock(), origin);
    },
    automaticCallsToday() { return db.prepare('SELECT calls FROM automatic_research_calls WHERE day=?').get(day())?.calls || 0; },
    recordAutomaticCall() { db.prepare('INSERT INTO automatic_research_calls VALUES(?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1').run(day()); },
    recordPortalExport(reviewId, jobAdvertLink) { db.prepare('INSERT INTO portal_exports(review_id,job_advert_link,exported_at) VALUES(?,?,?)').run(String(reviewId), String(jobAdvertLink || ''), clock()); },
    portalExports() { return db.prepare('SELECT review_id AS reviewId,job_advert_link AS jobAdvertLink,exported_at AS exportedAt FROM portal_exports ORDER BY id').all().map(r => ({...r})); },
    close() { db.close(); }
  };
}
