import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createSlowStepMonitor} from '../../src/infrastructure/slow-step-monitor.js';

function fixture() {
  let clock = 0;
  const lines = [];
  const monitor = createSlowStepMonitor({log: l => lines.push(l), now: () => clock, setIntervalFn: () => ({}), clearIntervalFn() {}});
  return {monitor, lines, advance: ms => { clock += ms; }};
}
const request = (method, url) => ({method, url});

test('a blocked event loop is logged with the requests in progress, without query strings or long IDs', () => {
  const {monitor, lines, advance} = fixture();
  monitor.start();
  const res = new EventEmitter();
  monitor.track(request('GET', '/api/job-imports/list?page=1&status=all'), res);
  monitor.track(request('POST', '/api/reviews/6f1c2a90-1b2c-4d5e-8f90-1234567890ab/letter-gate'), new EventEmitter());
  advance(100); monitor.tick();
  assert.equal(lines.length, 0, 'an on-time tick logs nothing');
  advance(1300); monitor.tick();
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[SLOW\] Every tab waited about 1200 ms\. In progress: GET \/api\/job-imports\/list \(1400 ms\), POST \/api\/reviews\/:id\/letter-gate \(1400 ms\)$/);
  assert.doesNotMatch(lines[0], /page=1|6f1c2a90/);
});

test('a slow request is logged once when it finishes; quick ones are not', () => {
  const {monitor, lines, advance} = fixture();
  const slow = new EventEmitter(), quick = new EventEmitter();
  monitor.track(request('GET', '/'), slow);
  monitor.track(request('GET', '/healthz'), quick);
  advance(50); quick.emit('finish');
  advance(2500); slow.emit('finish'); slow.emit('close');
  assert.deepEqual(lines, ['[SLOW] GET / took 2550 ms']);
  assert.equal(monitor.activeCount(), 0);
});

test('a request that blocked and finished before the late tick is still named', () => {
  const {monitor, lines, advance} = fixture();
  monitor.start();
  const res = new EventEmitter();
  monitor.track(request('GET', '/applications/saved'), res);
  advance(900); res.emit('finish');
  advance(10); monitor.tick();
  assert.match(lines[0], /Every tab waited about 810 ms\. In progress: GET \/applications\/saved \(900 ms, finished\)$/);
});

test('with nothing in progress the line says so, and attach listens to server requests', () => {
  const {monitor, lines, advance} = fixture();
  const server = new EventEmitter();
  monitor.attach(server).start();
  advance(600); monitor.tick();
  assert.match(lines[0], /In progress: none \(start-up or background work\)/);
  server.emit('request', request('GET', '/outreach'), new EventEmitter());
  assert.equal(monitor.activeCount(), 1);
});
