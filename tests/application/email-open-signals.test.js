import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAlert, alertKind, openSignalsByReview} from '../../src/domain/outreach/email-open-signals.js';
import {createEmailOpenService} from '../../src/application/email-open-tracking.js';
import {createMemoryEmailOpenSignalsStore, createEmailOpenSignalsFileStore} from '../../src/infrastructure/email-open-signals-file.js';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const T = iso => Date.parse(iso);
const SENT = [
  {id: 's1', reviewId: 'r1', status: 'sent', email: 'sam@agency.test', fullName: 'Sam Recruiter', subject: 'Application: Senior Delivery Manager', sentAt: '2026-11-20T10:00:00Z'},
  {id: 's2', reviewId: 'r1', status: 'sent', email: 'jo@client.test', fullName: 'Jo Lead', subject: 'Application: Senior Delivery Manager', sentAt: '2026-11-20T10:05:00Z'},
  {id: 's3', reviewId: 'r2', status: 'sent', email: 'kim@other.test', fullName: 'Kim', subject: 'Interest in the Programme Manager role', sentAt: '2026-11-21T09:00:00Z'}];
const alert = (id, iso, subject, text) => ({messageId: id, internalDate: T(iso), subject, text});

test('alerts are read for what happened and who, never the tracker itself', () => {
  assert.equal(alertKind({subject: 'Your email was opened'}), 'opened');
  assert.equal(alertKind({text: 'Sam clicked a link in your email'}), 'clicked');
  assert.equal(alertKind({subject: 'Upgrade to Mailsuite Pro'}), 'other');
  const p = parseAlert(alert('a', '2026-11-22T08:00:00Z', 'Opened: Application: Senior Delivery Manager', 'sam@agency.test opened your email. Manage alerts: help@mailsuite.com'));
  assert.deepEqual([p.id, p.kind, p.addresses], ['a', 'opened', ['sam@agency.test']]);
});

test('opens are matched by address first, then by subject, and only after the email was sent', () => {
  const alerts = [
    alert('a1', '2026-11-22T08:00:00Z', 'Email opened', 'sam@agency.test opened "Application: Senior Delivery Manager"'),
    alert('a2', '2026-11-23T08:00:00Z', 'Email opened', 'Your email "Application: Senior Delivery Manager" was opened'),
    alert('a3', '2026-11-23T09:00:00Z', 'Link clicked', 'Kim clicked a link in "Interest in the Programme Manager role"'),
    alert('a4', '2026-11-19T09:00:00Z', 'Email opened', 'sam@agency.test opened an email'),
    alert('a5', '2026-11-24T09:00:00Z', 'Weekly tips', 'Mailsuite news')].map(parseAlert);
  const out = openSignalsByReview(alerts, SENT);
  assert.deepEqual([out.r1.opens, out.r1.clicks, out.r1.lastAt], [2, 0, T('2026-11-23T08:00:00Z')], 'a4 came before the email was sent');
  assert.deepEqual(out.r1.contacts.map(c => [c.email, c.opens]), [['sam@agency.test', 1]], 'a subject shared by two contacts counts for the application only');
  assert.deepEqual([out.r2.opens, out.r2.clicks, out.r2.contacts[0].name], [0, 1, 'Kim']);
});

test('a check reads only alerts since the last one, keeps short copies and recounts; switched off is refused', async () => {
  const store = createMemoryEmailOpenSignalsStore(), reads = [];
  let alerts = [alert('a1', '2026-11-22T08:00:00Z', 'Email opened', 'sam@agency.test opened your email')];
  const s = createEmailOpenService({store, mailbox: 'me@example.test', now: () => T('2026-11-25T12:00:00Z'), sentEmails: () => SENT,
    readAlerts: async args => { reads.push(args); return {ok: true, alerts}; }});
  assert.deepEqual(s.forReview('r1'), {available: true, checkedAt: null, alertsKept: 0, review: null});
  const first = await s.check('r1');
  assert.deepEqual([reads[0].after, reads[0].expectedAddress, first.newAlerts, first.review.opens], ['2026/11/19', 'me@example.test', 1, 1]);
  assert.equal(store.read().alerts[0].words.length <= 2000, true);
  alerts = [...alerts, alert('a2', '2026-11-24T08:00:00Z', 'Email opened', 'sam@agency.test opened your email again')];
  const second = await s.check('r1');
  assert.deepEqual([reads[1].after, second.newAlerts, second.review.opens], ['2026/11/20', 1, 2]);
  await assert.rejects(createEmailOpenService({store}).check('r1'), /Gmail switched on/);
  const scope = createEmailOpenService({store, readAlerts: async () => ({ok: false, code: 'SCOPE_MISSING', error: 'x'})});
  await assert.rejects(scope.check('r1'), /Gmail read access: add/);
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
