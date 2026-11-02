import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOutreachRepository } from '../../src/infrastructure/outreach/sqlite-outreach-repository.js';

const item = (extra = {}) => ({
  applicationKey: 'application-1', contactId: 'contact-1',
  email: 'person@company.test', subject: 'Application',
  bodyPlainText: 'Reviewed local draft.',
  application: { jobTitle: 'Delivery lead' }, ...extra
});
function fixture(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'modular-outreach-'));
  const filePath = path.join(dir, 'outreach.db');
  const repos = [];
  const open = () => {
    const repo = createOutreachRepository({ filePath });
    repos.push(repo);
    return repo;
  };
  t.after(() => {
    for (const repo of repos) { try { repo.close(); } catch {} }
    rmSync(dir, { recursive: true, force: true });
  });
  return { open };
}
test('queue snapshots survive closing and reopening the database', t => {
  const { open } = fixture(t);
  const repo = open();
  const source = item();
  const added = repo.addMany([source]);
  source.application.jobTitle = 'Changed';
  repo.close();
  const stored = open().list();
  assert.equal(stored[0].id, added.items[0].id);
  assert.equal(stored[0].bodyPlainText, 'Reviewed local draft.');
  assert.equal(stored[0].application.jobTitle, 'Delivery lead');
});
test('duplicate additions retain the original message snapshot', t => {
  const repo = fixture(t).open();
  repo.addMany([item()]);
  const result = repo.addMany([item({ email: 'PERSON@company.test', bodyPlainText: 'Changed' })]);
  assert.equal(result.added, 0);
  assert.equal(result.duplicates, 1);
  assert.equal(repo.list()[0].bodyPlainText, 'Reviewed local draft.');
});
test('different applications and selected recipients remain distinct', t => {
  const repo = fixture(t).open();
  repo.addMany([item(), item({ applicationKey: 'application-2' }), item({ email: 'other@company.test' })]);
  assert.equal(repo.list().length, 3);
});
test('invalid batches leave no partially added recipients', t => {
  const repo = fixture(t).open();
  assert.throws(() => repo.addMany([item(), item({ email: 'bad' })]), /invalid/);
  assert.equal(repo.list().length, 0);
  assert.throws(() => repo.addMany([item({ subject: 'Injected\nheader' })]), /single line/);
});
test('selected deletion leaves other queue items intact', t => {
  const repo = fixture(t).open();
  const result = repo.addMany([item(), item({ contactId: 'contact-2' })]);
  assert.equal(repo.deleteSelected([result.items[0].id]), 1);
  assert.equal(repo.list()[0].contactId, 'contact-2');
  assert.throws(() => repo.deleteSelected([]), /explicit/);
});
test('confirmed send is idempotent and history survives queue clearing', t => {
  const repo = fixture(t).open();
  const queueId = repo.addMany([item()]).items[0].id;
  const outcome = { queueId, sendingAccount: 'sender@company.test', messageId: 'gmail-1' };
  repo.recordConfirmedSend(outcome);
  repo.recordConfirmedSend(outcome);
  assert.equal(repo.list()[0].status, 'sent');
  assert.equal(repo.listSentEmails().length, 1);
  repo.clearQueue();
  assert.equal(repo.list().length, 0);
  assert.equal(repo.listSentEmails()[0].messageId, 'gmail-1');
});
test('missing confirmation cannot mark a queue item sent', t => {
  const repo = fixture(t).open();
  const queueId = repo.addMany([item()]).items[0].id;
  assert.throws(() => repo.recordConfirmedSend({ queueId, sendingAccount: 'sender@company.test', messageId: '' }), /required/);
  assert.equal(repo.list()[0].status, 'new');
  assert.equal(repo.listSentEmails().length, 0);
});
