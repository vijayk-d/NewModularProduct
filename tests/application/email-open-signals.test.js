import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAlert, alertKind, openSignalsByReview} from '../../src/domain/outreach/email-open-signals.js';
import {createEmailOpenService} from '../../src/application/email-open-tracking.js';
import {createMemoryEmailOpenSignalsStore, createEmailOpenSignalsFileStore} from '../../src/infrastructure/email-open-signals-file.js';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const T = iso => Date.parse(iso);
const SUBJECT = '_Application for Lead Delivery Manager | LinkedIn (Ref: 123) | Test Candidate';
// Shaped like a real Mailsuite daily report (names and addresses made up).
const REPORT = ['Mailsuite', 'Mailsuite Daily Report', 'Nov 24, 2026', 'View Full Report', '✔✔ Opened emails (1)',
  'RE: ' + SUBJECT, 'Sent on Nov 24, 2026 at 7:53 PM', 'To: ann.lead@client.test', '',
  'Unopened emails (2)', SUBJECT, 'Sent on Nov 24, 2026 at 8:42 PM', 'To: bob.hire@client.test', '',
  SUBJECT, 'Sent on Nov 24, 2026 at 8:58 PM', 'To: cat.manager@client.test', '', 'Unsubscribe from daily reports'].join('\n');
const report = (id, iso, text = REPORT) => ({messageId: id, internalDate: T(iso), subject: 'Mailsuite Daily Report Nov 24, 2026: 3 emails tracked', text});
const QUEUED = [
  {reviewId: 'r1', email: 'ann.lead@client.test', fullName: 'Ann Lead', subject: SUBJECT, createdAt: '2026-11-24T09:00:00Z'},
  {reviewId: 'r1', email: 'bob.hire@client.test', fullName: 'Bob Hire', subject: SUBJECT, createdAt: '2026-11-24T09:00:00Z'},
  {reviewId: 'r1', email: 'cat.manager@client.test', fullName: 'Cat Manager', subject: SUBJECT, createdAt: '2026-11-24T09:00:00Z'}];
const people = QUEUED.map(q => ({...q, at: T(q.createdAt)}));

test('a daily report is read section by section: "Unopened" is never counted as opened', () => {
  const p = parseAlert(report('d1', '2026-11-25T07:15:00Z'));
  assert.equal(p.report, true);
  assert.deepEqual(p.entries.map(e => [e.address, e.kind]), [['ann.lead@client.test', 'opened'], ['bob.hire@client.test', 'unopened'], ['cat.manager@client.test', 'unopened']]);
  assert.match(p.entries[1].words, /lead delivery manager/);
  const onlyUnopened = parseAlert(report('d2', '2026-11-25T07:15:00Z', REPORT.replace('✔✔ Opened emails (1)', 'Unopened emails (1)')));
  assert.deepEqual(onlyUnopened.entries.map(e => e.kind), ['unopened', 'unopened', 'unopened']);
  assert.equal(parseAlert({messageId: 'x', subject: 'Mailsuite Daily Report', text: 'help@mailsuite.com opened'}).entries.length, 0, 'the tracker itself and loose words in a report count for nothing');
});

test('single alerts still work, and promotions are ignored', () => {
  assert.equal(alertKind({subject: 'Your email was opened'}), 'opened');
  assert.equal(alertKind({text: 'Sam clicked a link in your email'}), 'clicked');
  assert.deepEqual(parseAlert({messageId: 'a', internalDate: 1, subject: 'Opened: ' + SUBJECT, text: 'bob.hire@client.test opened your email'}).entries.map(e => [e.address, e.kind]), [['bob.hire@client.test', 'opened']]);
  assert.deepEqual(parseAlert({messageId: 'b', subject: 'Upgrade to Mailsuite Pro', text: 'Offer for you@example.test'}).entries, []);
});

test('entries are matched to the application through its contacts, furthest state wins, the subject picks between applications', () => {
  const later = report('d3', '2026-11-26T07:15:00Z', REPORT.replace('Unopened emails (2)', 'Opened emails (2)'));
  const out = openSignalsByReview([parseAlert(report('d1', '2026-11-25T07:15:00Z')), parseAlert(later)], people);
  assert.deepEqual(out.r1.contacts.map(c => [c.email, c.state, c.opens]), [['ann.lead@client.test', 'opened', 2], ['bob.hire@client.test', 'opened', 1], ['cat.manager@client.test', 'opened', 1]]);
  assert.equal(out.r1.tracked, 3);
  const firstOnly = openSignalsByReview([parseAlert(report('d1', '2026-11-25T07:15:00Z'))], people);
  assert.deepEqual(firstOnly.r1.contacts.map(c => c.state), ['opened', 'unopened', 'unopened']);
  // Bob is a contact on two applications: the subject in the report decides which one.
  const two = [...people, {reviewId: 'r9', email: 'bob.hire@client.test', fullName: 'Bob Hire', subject: 'Interest in the Programme Manager role', at: T('2026-11-20T09:00:00Z')}];
  const split = openSignalsByReview([parseAlert(report('d1', '2026-11-25T07:15:00Z'))], two);
  assert.equal(split.r9, undefined);
  assert.equal(openSignalsByReview([parseAlert(report('d0', '2026-11-20T07:00:00Z'))], people).r1, undefined, 'a report from before the contact was queued counts for nothing');
});

test('a check reads only alerts since the last one, uses queued contacts, and re-reads alerts saved by the first version', async () => {
  const store = createMemoryEmailOpenSignalsStore(), reads = [];
  store.write({checkedAt: 'old', lastAlertAt: T('2026-11-25T00:00:00Z'), alerts: [{id: 'old', at: 1, kind: 'opened', addresses: [], words: ''}]});
  let alerts = [report('d1', '2026-11-25T07:15:00Z')];
  const s = createEmailOpenService({store, mailbox: 'me@example.test', now: () => T('2026-11-26T12:00:00Z'), sentEmails: () => [], queueItems: () => QUEUED,
    readAlerts: async args => { reads.push(args); return {ok: true, alerts}; }});
  const first = await s.check('r1');
  assert.deepEqual([reads[0].after, reads[0].expectedAddress, first.newAlerts, first.review.tracked], ['2026/11/23', 'me@example.test', 1, 3]);
  alerts = [...alerts, report('d3', '2026-11-26T07:15:00Z', REPORT.replace('Unopened emails (2)', 'Opened emails (2)'))];
  const second = await s.check('r1');
  assert.deepEqual([reads[1].after, second.newAlerts, second.review.contacts.every(c => c.state === 'opened')], ['2026/11/23', 1, true]);
  await assert.rejects(createEmailOpenService({store}).check('r1'), /Gmail switched on/);
  await assert.rejects(createEmailOpenService({store, readAlerts: async () => ({ok: false, code: 'SCOPE_MISSING', error: 'x'})}).check('r1'), /Gmail read access: add/);
});

test('the counts live in their own file in the state folder', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opens-'));
  try {
    const store = createEmailOpenSignalsFileStore(dir);
    assert.deepEqual(store.read(), {});
    store.write({checkedAt: 'x', alerts: []});
    assert.equal(path.basename(store.file), 'email-open-signals-v1.json');
    assert.deepEqual(createEmailOpenSignalsFileStore(dir).read(), {checkedAt: 'x', alerts: []});
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
