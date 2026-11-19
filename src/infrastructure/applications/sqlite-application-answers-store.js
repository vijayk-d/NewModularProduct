// New, separate store for saved portal answers. It never opens or changes existing databases.
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {openSqlite} from '../sqlite-open.js';

const fail = message => { throw Object.assign(new Error(message), {code: 'ANSWERS_STORE', statusCode: 503}); };

export function createApplicationAnswersStore({filePath, clock = () => Date.now()} = {}) {
  if (typeof filePath !== 'string' || !filePath) fail('Explicit answers store path required.');
  if (filePath !== ':memory:') mkdirSync(path.dirname(filePath), {recursive: true});
  const db = openSqlite(filePath);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  if (names.length && !names.includes('answers_meta')) { db.close(); fail('Unrecognised answers database; nothing overwritten.'); }
  if (names.includes('answers_meta') && db.prepare("SELECT value FROM answers_meta WHERE key='schema'").get()?.value !== '1') { db.close(); fail('Unsupported answers schema.'); }
  db.exec(`CREATE TABLE IF NOT EXISTS answers_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO answers_meta VALUES('schema','1');
CREATE TABLE IF NOT EXISTS application_answers(id INTEGER PRIMARY KEY AUTOINCREMENT,review_id TEXT NOT NULL,question TEXT NOT NULL,unit TEXT NOT NULL,limit_value INTEGER NOT NULL,answer TEXT NOT NULL,origin TEXT NOT NULL,saved_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS application_answers_review ON application_answers(review_id);`);
  const row = r => ({id: r.id, reviewId: r.review_id, question: r.question, unit: r.unit, limit: r.limit_value, answer: r.answer, origin: r.origin, savedAt: r.saved_at});
  return {
    save(reviewId, {question, unit, limit, answer, origin}) {
      const r = db.prepare('INSERT INTO application_answers(review_id,question,unit,limit_value,answer,origin,saved_at) VALUES(?,?,?,?,?,?,?)').run(String(reviewId), question, unit, limit, answer, origin, clock());
      return row(db.prepare('SELECT * FROM application_answers WHERE id=?').get(Number(r.lastInsertRowid)));
    },
    list(reviewId) { return db.prepare('SELECT * FROM application_answers WHERE review_id=? ORDER BY saved_at DESC,id DESC').all(String(reviewId)).map(row); },
    remove(reviewId, id) { return db.prepare('DELETE FROM application_answers WHERE review_id=? AND id=?').run(String(reviewId), Number(id)).changes === 1; },
    close() { db.close(); }
  };
}
