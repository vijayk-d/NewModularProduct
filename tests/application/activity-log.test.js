import test from 'node:test';
import assert from 'node:assert/strict';
import {createActivityLog, STALE_MS} from '../../src/application/activity-log.js';
import {renderActivityPill, shellScriptPermission, injectShell} from '../../src/interfaces/http/app-shell.js';
import {createEmailDomainResolutionService} from '../../src/application/email-domain-resolution-service.js';

test('a slow task is amber while running, green when finished until seen, red when it fails', () => {
  let t = 1000;
  const log = createActivityLog({now: () => t, nameFor: id => id === 'r1' ? 'EY · Delivery Lead' : ''});
  const a = log.start({kind: 'polish', reviewId: 'r1'});
  assert.equal(log.start({kind: 'unknown', reviewId: 'r1'}), null);
  assert.deepEqual(log.summary().items.map(x => [x.label, x.level, x.name, x.href]), [['Polishing letter', 'amber', 'EY · Delivery Lead', '/applications/r1#proposed-cover-letter']]);
  t += 5000;
  assert.equal(log.finish(a), true);
  assert.equal(log.fail(a, 'late'), false, 'a finished task cannot fail afterwards');
  assert.deepEqual(log.summary().items.map(x => [x.label, x.level]), [['Letter polished', 'green']]);
  const d = log.start({kind: 'domain', reviewId: 'r2'});
  log.fail(d, 'No API key');
  const e = log.start({kind: 'domain', reviewId: 'r3'});
  assert.deepEqual(log.summary().items.map(x => x.state), ['running', 'failed', 'done'], 'running first, then failed, then finished');
  assert.equal(log.summary().running, 1);
  assert.equal(log.markSeen({reviewId: 'r1'}), 1);
  assert.equal(log.markSeen({reviewId: 'r3'}), 0, 'a running task is never marked seen');
  assert.deepEqual(log.summary().items.map(x => x.reviewId), ['r3', 'r2']);
  t += STALE_MS + 1;
  const stale = log.summary().items.find(x => x.id === e);
  assert.deepEqual([stale.state, stale.level, stale.label], ['failed', 'red', 'Finding email domain was interrupted']);
});

test('the pill text says what happened, and is an empty placeholder when nothing is going on', () => {
  assert.match(renderActivityPill(null), /data-activity-pill data-activity-state="none" hidden/);
  const pill = renderActivityPill({items: [{id: 'a1', state: 'done', level: 'green', label: 'Letter polished', name: 'EY', error: ''}, {id: 'a2', state: 'failed', level: 'red', label: 'x', name: '', error: ''}]});
  assert.match(pill, /data-activity-state="done" data-next-level="green" href="\/activity\/open\?id=a1"/);
  assert.match(pill, /Letter polished: EY ✓ \(\+1\)/);
});

test("the bar's script runs only where the page's own policy allows it, using the page's nonce", () => {
  assert.deepEqual(shellScriptPermission("default-src 'self'; script-src 'nonce-abc123'"), {nonce: 'abc123'});
  assert.deepEqual(shellScriptPermission("default-src 'none'; script-src 'self'"), {nonce: ''});
  assert.equal(shellScriptPermission("default-src 'none'; style-src 'unsafe-inline'"), null);
  assert.deepEqual(shellScriptPermission(''), {nonce: ''});
  const page = '<!doctype html><html><head><title>x</title></head><body>hi</body></html>';
  assert.match(injectShell(page, '/', {}, null, {activity: () => null, script: {nonce: 'abc123'}}), /<script src="\/app-shell.js" defer nonce="abc123"><\/script><\/body>/);
  assert.doesNotMatch(injectShell(page, '/', {}, null, {activity: () => null, script: null}), /app-shell.js/);
});

test('a domain lookup is recorded as running, then found or failed', async () => {
  const log = createActivityLog();
  let release;
  const ok = createEmailDomainResolutionService({activity: log, recruiterContactStore: {listByReview: async () => []}, store: {save: async (id, r) => r},
    perplexityClient: {resolveEmailDomain: () => new Promise(r => { release = () => r({emailDomain: 'ey.com'}); })}});
  await ok.startResolution({reviewId: 'r1', organisation: {name: 'EY'}});
  assert.equal(log.summary().items[0].state, 'running');
  release(); await new Promise(r => setTimeout(r, 20));
  assert.equal(log.summary().items[0].label, 'Email domain found');
  const bad = createEmailDomainResolutionService({activity: log, recruiterContactStore: {listByReview: async () => []}, perplexityClient: {resolveEmailDomain: async () => { throw new Error('No API key'); }}});
  await bad.startResolution({reviewId: 'r2', organisation: {name: 'X'}});
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual([log.summary().items[0].label, log.summary().items[0].error], ['Domain lookup failed', 'No API key']);
});
