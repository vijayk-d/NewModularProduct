import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Readable} from 'node:stream';
import {createSendLedger} from '../../src/application/gmail-send-ledger.js';
import {createDurableReviewStore, createMemoryReviewRepository} from '../../src/application/durable-review-store.js';
import {createOutreachHttpHandler} from '../../src/interfaces/http/outreach-queue-http.js';

const ACCOUNT = 'sender@example.test';
function ledgerFixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE outreach_queue(id TEXT PRIMARY KEY,payload TEXT NOT NULL);CREATE TABLE outreach_sent_emails(id TEXT PRIMARY KEY,sending_account TEXT NOT NULL,message_id TEXT NOT NULL,payload TEXT NOT NULL);');
  const ledger = createSendLedger(db);
  const attempt = (id, applicationKey, email, status, extra = {}, account = ACCOUNT) => db.prepare('INSERT INTO outreach_gmail_send_attempts VALUES(?,?,?,?,?,?)')
    .run(id, applicationKey, email.toLowerCase(), account, status, JSON.stringify({id, applicationKey, recipientKey: email.toLowerCase(), sendingAccount: account, status, ...extra}));
  const sent = (id, applicationKey, email, account = ACCOUNT) => db.prepare('INSERT INTO outreach_sent_emails VALUES(?,?,?,?)').run(id, account, 'm-' + id, JSON.stringify({applicationKey, email}));
  return {ledger, attempt, sent};
}

test('the one-pass send history gives exactly the same answers as the per-row lookups', () => {
  const {ledger, attempt, sent} = ledgerFixture();
  attempt('a1', 'app1', 'one@example.test', 'failed', {safeToRetry: true});
  attempt('a2', 'app1', 'one@example.test', 'failed', {safeToRetry: false});
  attempt('a3', 'app2', 'two@example.test', 'sent');
  attempt('a4', 'app3', 'three@example.test', 'reserved');
  attempt('a5', 'app4', 'four@example.test', 'sent', {}, 'other@example.test');
  sent('s1', 'app5', 'Five@Example.test');
  sent('s2', 'app6', 'six@example.test', 'other@example.test');
  const items = ['app1|one@example.test', 'app1|ONE@example.test', 'app2|two@example.test', 'app3|three@example.test', 'app4|four@example.test', 'app5|five@example.test', 'app6|six@example.test', 'app7|new@example.test']
    .map(s => { const [applicationKey, email] = s.split('|'); return {applicationKey, email}; });
  for (const account of [ACCOUNT, 'Sender@Example.test']) {
    const ctx = ledger.context(account);
    for (const item of items) assert.deepEqual(ledger.state(item, account, ctx), ledger.state(item, account), item.applicationKey + ' ' + item.email + ' ' + account);
  }
  const ctx = ledger.context(ACCOUNT);
  assert.equal(ledger.state(items[0], ACCOUNT, ctx).retryAllowed, false, 'latest attempt wins');
  assert.equal(ledger.state(items[3], ACCOUNT, ctx).blocked, true);
  assert.equal(ledger.state(items[5], ACCOUNT, ctx).hasSent, true);
  assert.equal(ledger.state(items[6], ACCOUNT, ctx).hasSent, false, 'another mailbox does not count');
  assert.deepEqual(ledger.state(items[5], 'other@example.test', ctx), ledger.state(items[5], 'other@example.test'), 'a context for another mailbox is ignored');
});

test('the queue list reads each application once, with the light read, and sends one history context', async () => {
  const store = createDurableReviewStore(createMemoryReviewRepository());
  store.set('r1', {formData: {jobTitle: 'One'}, refinementHistory: [{appliedAt: '2026-11-01T10:00:00Z'}]});
  store.set('r2', {formData: {jobTitle: 'Two'}});
  const queue = [1, 2, 3].map(i => ({id: 'q' + i, reviewId: 'r1', applicationKey: 'app1', email: `p${i}@example.test`, status: 'new', subject: 'S', bodyPlainText: 'Dear P,\n\nText.', bodyHtml: 'Dear P,<br><br>Text.'}))
    .concat([{id: 'q4', reviewId: 'r2', applicationKey: 'app2', email: 'x@example.test', status: 'new', subject: 'S', bodyPlainText: 'Dear X,\n\nText.', bodyHtml: 'Dear X,<br><br>Text.'}]);
  const repository = {list: () => structuredClone(queue), listDraftOperations: () => [], listSendAttempts: () => []};
  let peeks = 0, gets = 0, contexts = 0, withContext = 0;
  const sends = {getStatus: () => ({configuredMailbox: ACCOUNT}), eligibilityContext: () => { contexts++; return {marker: true}; },
    eligibility: (item, account, ctx) => { if (ctx?.marker) withContext++; return {eligible: true, mode: 'new', label: 'Send email'}; }};
  const handler = createOutreachHttpHandler({repository, contactStore: null, gmailSendPort: sends, gmailMailboxPort: {getStatus: () => ({})}, gmailDraftCreationPort: {},
    getReview: id => { gets++; return store.get(id); }, peekReview: id => { peeks++; return store.peek(id); }});
  const req = Readable.from([]); req.method = 'GET'; req.headers = {host: '127.0.0.1:3000'}; req.url = '/api/outreach-queue'; req.socket = {remoteAddress: '127.0.0.1'};
  let body = '', status;
  const res = {statusCode: 200, setHeader() {}, writeHead(code) { status = code; }, end(chunk) { body = String(chunk || ''); }};
  await handler(req, res, new URL('http://127.0.0.1:3000/api/outreach-queue'));
  const data = JSON.parse(body);
  assert.equal(data.ok, true, body);
  assert.deepEqual([peeks, gets, contexts, withContext], [2, 0, 1, 4]);
  assert.deepEqual(data.items.map(i => i.letterGate.allowed), [true, true, true, false]);
  assert.equal(data.items[3].sendAction.eligible, false, 'an unpolished letter is still not sendable');
});

test('peek returns the stored application without the validation copy', () => {
  const store = createDurableReviewStore(createMemoryReviewRepository());
  store.set('r1', {formData: {jobTitle: 'One'}, sendWithoutPolish: true});
  assert.equal(store.peek('r1').sendWithoutPolish, true);
  assert.equal(store.peek('r1')._storageMeta, undefined);
  assert.equal(store.peek('missing'), undefined);
});
