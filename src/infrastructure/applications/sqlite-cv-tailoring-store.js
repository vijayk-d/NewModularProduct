// New, separate store for tailored CVs. The base CV files are never written; each build is a new version.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

const fail = message => { throw Object.assign(new Error(message), {code: 'CV_TAILORING_STORE', statusCode: 503}); };
const LIMIT = 20 * 1024 * 1024;

export function createCvTailoringStore({filePath, clock = () => Date.now()} = {}) {
  if (typeof filePath !== 'string' || !filePath) fail('Explicit tailored CV store path required.');
  if (filePath !== ':memory:') mkdirSync(path.dirname(filePath), {recursive: true});
  const db = new DatabaseSync(filePath);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  if (names.length && !names.includes('cv_tailoring_meta')) { db.close(); fail('Unrecognised tailored CV database; nothing overwritten.'); }
  if (names.includes('cv_tailoring_meta') && db.prepare("SELECT value FROM cv_tailoring_meta WHERE key='schema'").get()?.value !== '1') { db.close(); fail('Unsupported tailored CV schema.'); }
  db.exec(`CREATE TABLE IF NOT EXISTS cv_tailoring_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO cv_tailoring_meta VALUES('schema','1');
CREATE TABLE IF NOT EXISTS tailored_cvs(id INTEGER PRIMARY KEY AUTOINCREMENT,review_id TEXT NOT NULL,version INTEGER NOT NULL,role_code TEXT NOT NULL,base_name TEXT NOT NULL,base_sha256 TEXT NOT NULL,profile_json TEXT NOT NULL,achievements_json TEXT NOT NULL,docx BLOB NOT NULL,docx_sha256 TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(review_id,version));
CREATE TABLE IF NOT EXISTS cv_preferences(role_code TEXT PRIMARY KEY,word_file TEXT NOT NULL DEFAULT '',profile_heading TEXT NOT NULL DEFAULT '',achievements_heading TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL);`);
  const meta = r => r ? {reviewId: r.review_id, version: r.version, roleCode: r.role_code, baseName: r.base_name, baseSha256: r.base_sha256,
    profile: JSON.parse(r.profile_json), achievements: JSON.parse(r.achievements_json), sha256: r.docx_sha256, createdAt: r.created_at} : null;
  const cols = 'review_id,version,role_code,base_name,base_sha256,profile_json,achievements_json,docx_sha256,created_at';
  return {
    save({reviewId, roleCode, baseName, baseSha256, profile, achievements, bytes, sha256}) {
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > LIMIT) fail('Tailored CV is empty or exceeds 20 MiB.');
      db.exec('BEGIN IMMEDIATE');
      try {
        const version = (db.prepare('SELECT MAX(version) AS v FROM tailored_cvs WHERE review_id=?').get(String(reviewId))?.v || 0) + 1;
        db.prepare('INSERT INTO tailored_cvs(review_id,version,role_code,base_name,base_sha256,profile_json,achievements_json,docx,docx_sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
          .run(String(reviewId), version, String(roleCode), String(baseName), String(baseSha256), JSON.stringify(profile), JSON.stringify(achievements), bytes, String(sha256), clock());
        db.exec('COMMIT');
        return this.get(reviewId, version, {withBytes: false});
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    // Per-CV choices (Word file and section headings), shared by every application that uses that CV.
    preferences(roleCode) {
      const r = db.prepare('SELECT word_file,profile_heading,achievements_heading FROM cv_preferences WHERE role_code=?').get(String(roleCode));
      return r ? {wordFile: r.word_file, profileHeading: r.profile_heading, achievementsHeading: r.achievements_heading} : {wordFile: '', profileHeading: '', achievementsHeading: ''};
    },
    savePreferences(roleCode, {wordFile = '', profileHeading = '', achievementsHeading = ''} = {}) {
      db.prepare('INSERT INTO cv_preferences VALUES(?,?,?,?,?) ON CONFLICT(role_code) DO UPDATE SET word_file=excluded.word_file,profile_heading=excluded.profile_heading,achievements_heading=excluded.achievements_heading,updated_at=excluded.updated_at')
        .run(String(roleCode), String(wordFile), String(profileHeading), String(achievementsHeading), clock());
    },
    latest(reviewId) { return meta(db.prepare(`SELECT ${cols} FROM tailored_cvs WHERE review_id=? ORDER BY version DESC LIMIT 1`).get(String(reviewId))); },
    get(reviewId, version, {withBytes = true} = {}) {
      const row = db.prepare(`SELECT ${cols}${withBytes ? ',docx' : ''} FROM tailored_cvs WHERE review_id=? AND version=?`).get(String(reviewId), Number(version));
      if (!row) return null;
      return withBytes ? {...meta(row), bytes: Buffer.from(row.docx)} : meta(row);
    },
    close() { db.close(); }
  };
}
