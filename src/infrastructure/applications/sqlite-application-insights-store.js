// New, separate store for application outcomes (insights phase 1). It never opens or changes existing databases.
// Each outcome entry is kept; the current outcome is derived. The payload column matches the dashboard reader's contract.
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {openSqlite} from '../sqlite-open.js';

const fail = message => { throw Object.assign(new Error(message), {code: 'INSIGHTS_STORE', statusCode: 503}); };

export function createApplicationInsightsStore({filePath, clock = () => Date.now()} = {}) {
  if (typeof filePath !== 'string' || !filePath) fail('Explicit insights store path required.');
  if (filePath !== ':memory:') mkdirSync(path.dirname(filePath), {recursive: true});
  const db = openSqlite(filePath);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  if (names.length && !names.includes('insights_meta')) { db.close(); fail('Unrecognised insights database; nothing overwritten.'); }
  if (names.includes('insights_meta') && db.prepare("SELECT value FROM insights_meta WHERE key='schema'").get()?.value !== '1') { db.close(); fail('Unsupported insights schema.'); }
  db.exec(`CREATE TABLE IF NOT EXISTS insights_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO insights_meta VALUES('schema','1');
CREATE TABLE IF NOT EXISTS outcome_events(id INTEGER PRIMARY KEY AUTOINCREMENT,review_id TEXT NOT NULL,outcome TEXT NOT NULL,occurred_on TEXT NOT NULL,recorded_at INTEGER NOT NULL,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS outcome_events_review ON outcome_events(review_id);
CREATE TABLE IF NOT EXISTS application_features(review_id TEXT PRIMARY KEY,built_at INTEGER NOT NULL,payload TEXT NOT NULL);`);
  const row = r => ({id: r.id, reviewId: r.review_id, outcome: r.outcome, occurredOn: r.occurred_on, recordedAt: r.recorded_at, note: (() => { try { return JSON.parse(r.payload).note || ''; } catch { return ''; } })()});
  return {
    record(reviewId, {outcome, occurredOn, note = ''}) {
      const recordedAt = clock();
      const payload = JSON.stringify({reviewId: String(reviewId), outcome, occurredOn, note, recordedAt});
      const r = db.prepare('INSERT INTO outcome_events(review_id,outcome,occurred_on,recorded_at,payload) VALUES(?,?,?,?,?)').run(String(reviewId), outcome, occurredOn, recordedAt, payload);
      return {id: Number(r.lastInsertRowid), reviewId: String(reviewId), outcome, occurredOn, recordedAt, note};
    },
    history(reviewId) { return db.prepare('SELECT * FROM outcome_events WHERE review_id=? ORDER BY occurred_on,recorded_at,id').all(String(reviewId)).map(row); },
    // Removes one entry recorded by mistake, for this application only.
    remove(reviewId, id) { return db.prepare('DELETE FROM outcome_events WHERE review_id=? AND id=?').run(String(reviewId), Number(id)).changes === 1; },
    all() { return db.prepare('SELECT * FROM outcome_events ORDER BY review_id,occurred_on,recorded_at,id').all().map(row); },
    // The feature snapshot is derived data: each rebuild replaces it in one transaction.
    replaceFeatures(rows, builtAt = clock()) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec('DELETE FROM application_features');
        const insert = db.prepare('INSERT INTO application_features(review_id,built_at,payload) VALUES(?,?,?)');
        for (const r of rows) insert.run(String(r.reviewId), builtAt, JSON.stringify(r));
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return {count: rows.length, builtAt};
    },
    features() {
      const rows = db.prepare('SELECT payload,built_at FROM application_features ORDER BY review_id').all();
      return {builtAt: rows[0]?.built_at || null, rows: rows.map(r => JSON.parse(r.payload))};
    },
    close() { db.close(); }
  };
}
