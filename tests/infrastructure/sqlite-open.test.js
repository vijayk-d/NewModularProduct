import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openSqlite, BUSY_TIMEOUT_MS} from '../../src/infrastructure/sqlite-open.js';

const src = fileURLToPath(new URL('../../src/', import.meta.url));
const files = dir => readdirSync(dir).flatMap(name => { const full = path.join(dir, name); return statSync(full).isDirectory() ? files(full) : full.endsWith('.js') ? [full] : []; });

test('connections opened by the helper wait for locks instead of failing at once', () => {
  const db = openSqlite(':memory:');
  assert.equal(Object.values(db.prepare('PRAGMA busy_timeout').get())[0], BUSY_TIMEOUT_MS);
  db.close();
});

test('every SQLite store opens through the helper or sets the same busy timeout', () => {
  const offenders = files(src).filter(file => {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('new DatabaseSync(')) return false;
    return !file.endsWith(path.join('infrastructure', 'sqlite-open.js')) && !text.includes(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`);
  }).map(file => path.relative(src, file));
  assert.deepEqual(offenders, [], 'open SQLite with openSqlite() from src/infrastructure/sqlite-open.js');
});
