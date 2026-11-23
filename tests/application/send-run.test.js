import test from 'node:test';
import assert from 'node:assert/strict';
import {createSendRun, RUN_GAP_MS} from '../../src/application/send-run.js';
import {executeBulkSend, runSendInBackground} from '../../src/interfaces/http/outreach-bulk.js';

const items = n => Array.from({length: n}, (_, i) => ({ticket: 't' + i, queueId: 'q' + i, email: `r${i}@example.test`}));
function fakeSends(outcome = () => 'sent') {
  const commits = [], cancels = [];
  return {commits, cancels, cancel({ticket}) { cancels.push(ticket); return {cancelled: true}; },
    async commit({ticket, confirmed}) {
      assert.equal(confirmed, true); commits.push(ticket);
      const o = outcome(ticket);
      if (o === 'sent') return {sent: true, persistenceConfirmed: true, messageId: 'm-' + ticket};
      if (o === 'attention') return {sent: true, persistenceConfirmed: false, messageId: 'm-' + ticket, error: 'persistence failed'};
      throw Object.assign(new Error(o === 'not-attempted' ? 'Sending was not attempted: offline' : 'Send outcome uncertain. Check Gmail; do not retry.'), {code: o === 'not-attempted' ? 'SEND_NOT_ATTEMPTED' : 'SEND_UNKNOWN'});
    }};
}
const quiet = {log() {}};

test('an approved batch is sent by the server one at a time, with a gap between emails', async () => {
  const sends = fakeSends(), sleeps = [];
  const run = createSendRun({sends, sleep: async ms => { sleeps.push(ms); }, ...quiet});
  const started = run.start({confirmed: true, items: items(3)});
  assert.equal(started.state, 'running'); assert.equal(started.total, 3);
  await run.settled();
  const s = run.status();
  assert.deepEqual([s.state, s.sent, s.done], ['finished', 3, 3]);
  assert.deepEqual(sends.commits, ['t0', 't1', 't2']);
  assert.deepEqual(sleeps, [RUN_GAP_MS, RUN_GAP_MS]);
  assert.equal(RUN_GAP_MS, 500);
  assert.deepEqual(s.results.map(r => r.kind), ['sent', 'sent', 'sent']);
});

test('the first failed or uncertain email stops the run; the rest are not sent and their approvals are cancelled', async () => {
  for (const [outcome, kind] of [['uncertain', 'uncertain'], ['not-attempted', 'failed_before_send'], ['attention', 'sent_attention']]) {
    const sends = fakeSends(t => t === 't1' ? outcome : 'sent'), run = createSendRun({sends, sleep: async () => {}, ...quiet});
    run.start({confirmed: true, items: items(4)}); await run.settled();
    const s = run.status();
    assert.equal(s.state, 'halted', outcome);
    assert.deepEqual(sends.commits, ['t0', 't1'], 'no retry and nothing after the failure');
    assert.deepEqual(s.results.map(r => r.kind), ['sent', kind, 'stopped', 'stopped']);
    assert.deepEqual(sends.cancels, ['t2', 't3']);
  }
});

test('Stop takes effect after the current email', async () => {
  const sends = fakeSends(); let run;
  run = createSendRun({sends, sleep: async () => { run.stop(); }, ...quiet});
  run.start({confirmed: true, items: items(3)}); await run.settled();
  const s = run.status();
  assert.equal(s.state, 'stopped'); assert.deepEqual(sends.commits, ['t0']);
  assert.deepEqual(s.results.map(r => r.kind), ['sent', 'stopped', 'stopped']); assert.deepEqual(sends.cancels, ['t1', 't2']);
});

test('a run needs confirmation, 1 to 25 distinct approvals, and only one runs at a time', async () => {
  let release; const sends = fakeSends(), gate = new Promise(r => { release = r; });
  sends.commit = async () => { await gate; return {sent: true, messageId: 'm'}; };
  const run = createSendRun({sends, sleep: async () => {}, ...quiet});
  assert.throws(() => run.start({items: items(1)}), /Confirm/);
  assert.throws(() => run.start({confirmed: true, items: []}), /between 1 and 25/);
  assert.throws(() => run.start({confirmed: true, items: items(26)}), /between 1 and 25/);
  assert.throws(() => run.start({confirmed: true, items: [items(1)[0], items(1)[0]]}), /twice/);
  assert.throws(() => run.start({confirmed: true, items: [{queueId: 'q'}]}), /approval ticket/);
  run.start({confirmed: true, items: items(1)});
  assert.throws(() => run.start({confirmed: true, items: items(1)}), /already in progress/);
  release(); await run.settled();
  assert.equal(run.status().state, 'finished');
});

test('the page hands approved tickets to the server, watches progress and never cancels them itself', async () => {
  const queue = [0, 1].map(i => ({id: 'q' + i, applicationKey: 'a' + i, email: `r${i}@example.test`, status: 'new', sendAction: {eligible: true, mode: 'new'}}));
  const server = createSendRun({sends: fakeSends(), sleep: async () => {}, ...quiet}), calls = [];
  const api = async (url, body) => {
    calls.push(url);
    if (url.endsWith('/send-prepare')) return {ticket: 'tk-' + body.queueId, expiresAt: Date.now() + 300000, mode: 'new', emailVerified: true};
    if (url.endsWith('/send-run') && body) { const run = server.start(body); await server.settled(); return {run}; }
    if (url.endsWith('/send-run')) return {run: server.status()};
    if (url.endsWith('/send-cancel')) return {};
    throw new Error('unexpected ' + url);
  };
  const progress = [];
  const result = await executeBulkSend({items: queue, ids: ['q0', 'q1'], api, save: async () => {}, confirm: async () => true, onProgress: p => progress.push(p),
    runInBackground: ({fresh, onProgress}) => runSendInBackground({api, fresh, onProgress, sleep: async () => {}})});
  assert.equal(result.confirmed, true);
  assert.deepEqual(result.results.map(r => [r.id, r.kind]), [['q0', 'sent'], ['q1', 'sent']]);
  assert.ok(!calls.includes('/api/outreach-queue/send-commit'), 'the page does not commit');
  assert.ok(!calls.includes('/api/outreach-queue/send-cancel'), 'handed-over tickets are not cancelled by the page');
});

test('the Stop button reaches a background run and the run reports it stopped', async () => {
  let state = 'running', stops = 0, polls = 0;
  const api = async (url, body) => {
    if (url.endsWith('/send-run/stop')) { stops++; state = 'stopped'; return {run: {state, done: 1, total: 2, results: []}}; }
    if (url.endsWith('/send-run') && body) return {run: {state: 'running', done: 0, total: 2}};
    polls++; return {run: {state, done: 1, total: 2, results: [{id: 'q0', kind: 'sent'}]}};
  };
  let stopNow = false;
  const r = await runSendInBackground({api, fresh: [{prepared: {ticket: 't'}, item: {id: 'q0', email: 'a@example.test'}}], shouldStop: () => stopNow, sleep: async () => { stopNow = true; }});
  assert.equal(stops, 1); assert.equal(r.halted, true);
  assert.ok(polls >= 0);
});

test('the send-run routes start, report and refuse a second run over HTTP', async () => {
  const {Readable} = await import('node:stream');
  const {createOutreachHttpHandler} = await import('../../src/interfaces/http/outreach-queue-http.js');
  const sends = fakeSends();
  const port = {...sends, getStatus: () => ({configuredMailbox: 'me@example.test'}), eligibility: () => ({eligible: true})};
  const handler = createOutreachHttpHandler({repository: {list: () => []}, contactStore: null, getReview: () => null, gmailSendPort: port, gmailMailboxPort: {getStatus: () => ({})}, gmailDraftCreationPort: {}});
  const call = async (method, path, payload) => {
    const req = Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]);
    req.method = method; req.headers = {host: '127.0.0.1:3000', 'content-type': 'application/json'}; req.url = path; req.socket = {remoteAddress: '127.0.0.1'};
    let code = 200, out = '';
    const res = {statusCode: 200, setHeader() {}, writeHead(c) { code = c; }, end(chunk) { out = String(chunk || ''); }};
    await handler(req, res, new URL('http://127.0.0.1:3000' + path));
    return {code, data: JSON.parse(out)};
  };
  assert.equal((await call('GET', '/api/outreach-queue/send-run')).data.run, null);
  assert.equal((await call('POST', '/api/outreach-queue/send-run', {items: items(1)})).code, 400);
  const started = await call('POST', '/api/outreach-queue/send-run', {confirmed: true, items: items(2)});
  assert.equal(started.code, 200); assert.equal(started.data.run.total, 2);
  assert.equal((await call('POST', '/api/outreach-queue/send-run', {confirmed: true, items: items(1)})).code, 409);
  for (let i = 0; i < 50 && (await call('GET', '/api/outreach-queue/send-run')).data.run.state === 'running'; i++) await new Promise(r => setTimeout(r, 50));
  const done = (await call('GET', '/api/outreach-queue/send-run')).data.run;
  assert.deepEqual([done.state, done.sent], ['finished', 2]);
  assert.equal((await call('POST', '/api/outreach-queue/send-run/stop')).code, 200);
});
