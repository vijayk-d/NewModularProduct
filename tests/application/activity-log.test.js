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
  assert.match(renderActivityPill(null), /data-activity-pill data-activity-state="none" href="\/next-steps">.*Activity: nothing running/);
  const pill = renderActivityPill({items: [{id: 'a1', state: 'done', level: 'green', label: 'Letter polished', name: 'EY', error: ''}, {id: 'a2', state: 'failed', level: 'red', label: 'x', name: '', error: ''}]});
  assert.match(pill, /data-activity-state="done" data-next-level="green" href="\/activity\/open\?id=a1"/);
  assert.match(pill, /Letter polished: EY ✓ \(click to see it\) \(\+1 more\)/);
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

test('contact import: one activity per application, counted per batch, green once the tabs go quiet, red if nothing arrives', async () => {
  const {QUIET_MS, NOTHING_MS} = await import('../../src/application/activity-log.js');
  let t = 0;
  const log = createActivityLog({now: () => t});
  const a = log.start({kind: 'contacts', reviewId: 'r1'});
  assert.equal(log.start({kind: 'contacts', reviewId: 'r1'}), a, 'opening more tabs keeps the same activity');
  t += 1000; log.pulse('contacts', 4);
  t += 1000; log.pulse('contacts', 0);
  assert.equal(log.summary().items[0].state, 'running');
  t += QUIET_MS + 1;
  assert.deepEqual([log.summary().items[0].state, log.summary().items[0].label], ['done', 'Contacts imported (4 new)']);
  const b = log.start({kind: 'contacts', reviewId: 'r2'});
  t += NOTHING_MS + 1;
  const none = log.get(b);
  assert.deepEqual([none.state, none.label], ['failed', 'No contacts imported']);
  assert.match(none.error, /Tampermonkey contact bridge/);
  assert.equal(log.pulse('contacts', 3), 0, 'a finished import takes no more batches');
});

test('the Keywords advert reading and reply writing are recorded as running, then finished or failed', async () => {
  const {createLetterKeywordService} = await import('../../src/application/letter-keywords.js');
  const {createRecruiterReplyService} = await import('../../src/application/recruiter-reply.js');
  const {buildReplyApiRequest} = await import('../../src/infrastructure/refinement/perplexity-recruiter-reply-adapter.js');
  const log = createActivityLog();
  const reviews = new Map([['r1', {formData: {jobTitle: 'PM', jobDescriptionText: 'We need stakeholder management and risk management skills for this programme.'}}]]);
  const store = new Map();
  const k = createLetterKeywordService({reviews, activity: log, store: {get: id => store.get(id), set: (id, v) => store.set(id, v)},
    reader: {available: true, read: async () => { throw Object.assign(new Error('timed out'), {code: 'X'}); }}});
  await k.check('r1', {letterText: 'Dear Sam'});
  assert.deepEqual([log.summary().items[0].kind, log.summary().items[0].label, log.summary().items[0].error], ['keywords', 'Advert reading failed', 'timed out']);
  const writer = {available: true, buildRequest: buildReplyApiRequest, write: async (request, model) => ({reply: 'Hello,\n\nThanks.', notes: '', model})};
  const s = createRecruiterReplyService({reviews, writer, activity: log, evidence: async () => []});
  const body = {theirMessage: 'Thanks for your email, please apply online via our portal.', applicationStatus: 'applied'};
  const e = await s.estimate('r1', body);
  await s.write('r1', {...body, model: e.model, confirmedCostProof: e.costProof});
  assert.deepEqual([log.summary().items.find(x => x.kind === 'reply').label], ['Reply written']);
});

test('trying a failed task again replaces its red: the bar follows the latest attempt', () => {
  const log = createActivityLog();
  const first = log.start({kind: 'polish', reviewId: 'r1'});
  log.fail(first, 'REFINEMENT_FAILED');
  assert.equal(log.summary().items[0].level, 'red');
  const second = log.start({kind: 'polish', reviewId: 'r1'});
  assert.deepEqual(log.summary().items.map(x => [x.id, x.level]), [[second, 'amber']], 'the old failure is gone once you try again');
  log.finish(second);
  assert.deepEqual(log.summary().items.map(x => [x.label, x.level]), [['Letter polished', 'green']]);
  const other = log.start({kind: 'domain', reviewId: 'r1'}); log.fail(other, 'x');
  log.start({kind: 'polish', reviewId: 'r1'});
  assert.ok(log.summary().items.some(x => x.id === other), 'a different task keeps its own result');
});
