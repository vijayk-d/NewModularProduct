import test from 'node:test';
import assert from 'node:assert/strict';
import {nextStepFor, summariseNextSteps} from '../../src/domain/workflow/next-steps.js';
import {createNextStepsService} from '../../src/application/next-steps.js';
import {renderShell, injectShell} from '../../src/interfaces/http/app-shell.js';
import {renderNextStepsPage} from '../../src/interfaces/http/next-steps-http.js';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const ago = d => new Date(NOW - d * 864e5).toISOString();
const review = (extra = {}) => ({id: 'r1', organisation: 'Valtech', jobTitle: 'Lead Delivery Manager', updatedAt: ago(1), ...extra});
const step = args => nextStepFor({review: review(), now: NOW, ...args});

test('red: an uncertain or failed send comes first, then a reply waiting for an answer, then an interview', () => {
  const s = step({queue: [{status: 'send_unknown'}], replies: [{status: 'new', fromName: 'Sam'}]});
  assert.deepEqual([s.level, s.action, s.href], ['red', 'Check 1 uncertain or failed send', '/outreach-queue']);
  const r = step({replies: [{status: 'new', fromName: 'Sam Recruiter'}], sent: [{sentAt: ago(3)}]});
  assert.deepEqual([r.level, r.action, r.href], ['red', "Answer Sam Recruiter's reply", '/applications/r1#recruiter-reply']);
  assert.equal(step({outcome: {outcome: 'interview', occurredOn: '2026-11-24'}}).action, 'Prepare for the interview');
});

test('amber: a next step is ready; green: waiting or closed; old and quiet applications are left out', () => {
  assert.equal(step({replies: [{status: 'drafted', fromName: 'Sam'}]}).action, 'Put your reply to Sam in Gmail');
  assert.deepEqual([step({queue: [{status: 'new'}, {status: 'drafted'}, {status: 'sent'}]}).action], ['Send 2 queued emails']);
  assert.deepEqual([step({sent: [{sentAt: ago(6)}]}).level, step({sent: [{sentAt: ago(6)}]}).action], ['amber', 'Follow up: no reply for 6 days']);
  assert.deepEqual([step({sent: [{sentAt: ago(2)}]}).level, step({sent: [{sentAt: ago(2)}]}).action], ['green', 'Waiting for replies (sent 2 days ago)']);
  assert.equal(step({sent: [{sentAt: ago(9)}], outcome: {outcome: 'recruiter_replied', label: 'Recruiter replied'}}).level, 'green', 'a reply means no follow-up nag');
  assert.equal(step({outcome: {outcome: 'rejected', label: 'Rejected'}}).action, 'Closed: Rejected');
  assert.equal(step({}).action, 'Find contacts and queue the email');
  assert.equal(nextStepFor({review: review({updatedAt: ago(20)}), now: NOW}).action, 'Finish or close: untouched for 20 days');
  assert.equal(nextStepFor({review: review({updatedAt: ago(90)}), now: NOW}), null);
  assert.equal(step({sent: [{sentAt: ago(80)}]}), null);
});

test('the pill shows the most urgent colour and counts, red first', () => {
  const s = summariseNextSteps([{level: 'green'}, {level: 'amber'}, null, {level: 'red'}, {level: 'amber'}]);
  assert.deepEqual([s.level, s.label, s.steps.map(x => x.level)], ['red', '1 urgent · 2 to do', ['red', 'amber', 'amber', 'green']]);
  assert.equal(summariseNextSteps([{level: 'green'}]).label, 'All clear');
  assert.equal(summariseNextSteps([]).level, 'green');
});

test('the service reads every store, skips any that fails, and caches briefly', () => {
  let t = NOW, calls = 0;
  const reviews = {summaries: () => { calls++; return {items: [review(), review({id: 'r2', organisation: 'EY', updatedAt: ago(2)})]}; }};
  const s = createNextStepsService({reviews, now: () => t, queueItems: () => [{reviewId: 'r2', status: 'new'}],
    sentEmails: () => { throw new Error('locked'); }, replyStore: {list: id => id === 'r1' ? [{status: 'new', fromName: 'Sam'}] : []}, outcomes: {history: () => []}});
  const all = s.all();
  assert.deepEqual([all.level, all.label, all.steps.map(x => x.reviewId)], ['red', '1 urgent · 1 to do', ['r1', 'r2']]);
  s.all(); assert.equal(calls, 1);
  t += 9000; s.all(); assert.equal(calls, 2);
  s.refresh(); s.all(); assert.equal(calls, 3);
  assert.equal(s.forReview('r2').action, 'Send 1 queued email');
  assert.equal(createNextStepsService({reviews: {}}).all().label, 'All clear');
});

test('the bar shows the pill on every page and the strip only on that application', () => {
  const next = summariseNextSteps([{reviewId: 'r1', name: 'Valtech', level: 'red', action: "Answer Sam's reply", href: '/applications/r1#recruiter-reply', why: 'A recruiter replied.'}]);
  const bar = renderShell('/applications/r1', {NMP_ENV: 'development'}, next);
  assert.match(bar, /class="nmp-shell__next" data-next-level="red" href="\/next-steps"/);
  assert.match(bar, /<span>1 urgent<\/span>/);
  assert.match(bar, /data-next-strip data-next-level="red".*Answer Sam&#39;s reply.*href="\/applications\/r1#recruiter-reply"/);
  assert.doesNotMatch(renderShell('/applications/r2', {}, next), /data-next-strip/);
  assert.doesNotMatch(renderShell('/', {}, null), /nmp-shell__next/);
  const page = '<!doctype html><html><head><title>x</title></head><body>hi</body></html>';
  assert.match(injectShell(page, '/', {}, () => { throw new Error('store down'); }), /<header class="nmp-shell"/, 'a failing indicator never breaks a page');
  assert.match(renderNextStepsPage(next), /<h2>Act now \(1\)<\/h2>.*Answer Sam&#39;s reply/s);
});
