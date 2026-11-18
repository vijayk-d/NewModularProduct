// Every SQLite connection waits up to 5 s for a lock held by another write, instead of failing at once
// with "database is locked" (for example an autosave and a background step at the same moment).
// busy_timeout is a connection setting: it changes no file, journal mode or schema.
import {DatabaseSync} from 'node:sqlite';

export const BUSY_TIMEOUT_MS = 5000;

export function openSqlite(filePath, options = {}) {
  const db = new DatabaseSync(filePath, options);
  db.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`);
  return db;
}
