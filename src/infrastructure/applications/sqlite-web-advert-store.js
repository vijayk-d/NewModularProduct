// Adverts pasted from any job site live in their own database file, beside job-imports-v1.db,
// so the existing LinkedIn import schema is unchanged (release schema guard).
import {openSqlite} from '../sqlite-open.js';
import {randomUUID} from 'node:crypto';

export const webAdvertPath = filePath => filePath === ':memory:' ? ':memory:' : filePath.replace(/(\.db)?$/i, '') + '-web.db';

export function createSqliteWebAdvertRepository({filePath}) {
  if (!filePath) throw new Error('Explicit web advert database required.');
  const db = openSqlite(filePath);
  db.exec('CREATE TABLE IF NOT EXISTS web_advert_current(job_id TEXT PRIMARY KEY,import_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL);'
    + 'CREATE TABLE IF NOT EXISTS web_advert_versions(import_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(import_id,revision));');
  const lookup = id => { const r = db.prepare('SELECT payload FROM web_advert_current WHERE job_id=?').get(id); return r ? JSON.parse(r.payload) : undefined; };
  return {
    all: () => db.prepare('SELECT payload FROM web_advert_current LIMIT 10000').all().map(r => JSON.parse(r.payload)),
    lookup,
    get(importId, revision) { const r = db.prepare('SELECT payload FROM web_advert_versions WHERE import_id=? AND revision=?').get(String(importId), Number(revision)); return r ? JSON.parse(r.payload) : undefined; },
    save(p, hash) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const old = lookup(p.jobId);
        if (old?.contentHash === hash) { db.exec('COMMIT'); return {...old, duplicate: true}; }
        const v = {...p, importId: old?.importId || randomUUID(), revision: (old?.revision || 0) + 1, contentHash: hash, receivedAt: new Date().toISOString()}, body = JSON.stringify(v);
        db.prepare('INSERT INTO web_advert_versions VALUES(?,?,?)').run(v.importId, v.revision, body);
        db.prepare('INSERT INTO web_advert_current VALUES(?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET import_id=excluded.import_id,revision=excluded.revision,payload=excluded.payload').run(v.jobId, v.importId, v.revision, body);
        db.exec('COMMIT');
        return {...v, duplicate: false};
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    close: () => db.close()
  };
}
