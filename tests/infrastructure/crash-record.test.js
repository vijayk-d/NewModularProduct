import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync, rmSync, readdirSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {crashSummary, installCrashHandlers, takePreviousCrash} from '../../src/infrastructure/crash-record.js';

const now = () => new Date('2026-11-18T12:00:00.000Z');
function folder(t) { const dir = mkdtempSync(path.join(tmpdir(), 'crash-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; }

test('the record keeps the error type and code locations, never the message', () => {
  const error = Object.assign(new TypeError('Dear Hiring Manager, private letter text'), {code: 'ERR_X'});
  error.stack = 'TypeError: Dear Hiring Manager, private letter text\n    at render (file:///D:/app/src/interfaces/http/rendering.js:120:5)\n    at D:\\app\\src\\application\\cv-tailoring.js:44:9';
  const s = crashSummary('uncaughtException', error, now());
  assert.deepEqual(s, {at: '2026-11-18T12:00:00.000Z', kind: 'uncaughtException', name: 'TypeError', code: 'ERR_X', frames: ['interfaces/http/rendering.js:120:5', 'src/application/cv-tailoring.js:44:9']});
  assert.doesNotMatch(JSON.stringify(s), /Hiring|private/);
});

test('an uncaught error writes a record, logs one [CRASH] line and stops with exit code 1', t => {
  const dir = folder(t), proc = new EventEmitter(), lines = [], exits = [];
  installCrashHandlers({stateDirectory: dir, processRef: proc, log: line => lines.push(line), exit: code => exits.push(code), clock: now});
  proc.emit('unhandledRejection', new RangeError('secret'));
  proc.emit('uncaughtException', new Error('second'));
  assert.deepEqual(exits, [1], 'handled once');
  assert.match(lines[0], /^\[CRASH\] 2026-11-18T12:00:00.000Z unhandledRejection: RangeError/);
  const record = JSON.parse(readFileSync(path.join(dir, 'last-crash.json'), 'utf8'));
  assert.equal(record.name, 'RangeError');
});

test('the next start reports the previous crash once and moves the record aside', t => {
  const dir = folder(t), proc = new EventEmitter();
  installCrashHandlers({stateDirectory: dir, processRef: proc, log: () => {}, exit: () => {}, clock: now});
  proc.emit('uncaughtException', new Error('x'));
  const previous = takePreviousCrash(dir, now());
  assert.equal(previous.kind, 'uncaughtException');
  assert.equal(takePreviousCrash(dir, now()), null, 'reported once');
  assert.deepEqual(readdirSync(dir), ['last-crash-2026-11-18T12-00-00-000Z.json'], 'kept, not deleted');
});
