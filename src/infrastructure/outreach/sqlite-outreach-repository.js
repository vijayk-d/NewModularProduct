import { createDraftAttemptLedger, draftSnapshotFingerprint } from '../../application/gmail-draft-state-ledger.js';
import { sanitizeSnapshotHtml } from '../../application/outreach-message-snapshot.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function createOutreachRepository({ filePath }) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('An explicit outreach database path is required.');
  }
  if (filePath !== ':memory:') mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS outreach_queue (
      id TEXT PRIMARY KEY,
      application_key TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      recipient_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      UNIQUE(application_key, contact_id, recipient_key)
    );
    CREATE TABLE IF NOT EXISTS outreach_sent_emails (
      id TEXT PRIMARY KEY,
      sending_account TEXT NOT NULL,
      message_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      UNIQUE(sending_account, message_id)
    );
  `);
  const draftLedger = createDraftAttemptLedger(db, (operation) => {
    const row = db.prepare('SELECT payload FROM outreach_queue WHERE id = ?').get(operation.queueId);
    if (!row) return;
    const item = JSON.parse(row.payload);
    if (draftSnapshotFingerprint(item) !== operation.snapshotFingerprint) return;
    const statuses = {reserved:'draft_creating',drafted:'drafted',failed:'draft_failed',unknown:'draft_unknown'};
    const updated = {...item,status:statuses[operation.status],updatedAt:operation.updatedAt,
      draftOperationId:operation.id,sendingAccount:operation.sendingAccount,
      draftId:operation.draftId,messageId:operation.messageId,
      lastOutcome:operation.status==='drafted'?`draftId: ${operation.draftId}`:
        operation.status==='unknown'?'Draft outcome uncertain. Check Gmail before retrying.':
        operation.status==='failed'?'Draft creation failed; no automatic retry.':'Draft creation reserved; do not duplicate.'};
    db.prepare('UPDATE outreach_queue SET payload = ? WHERE id = ?').run(JSON.stringify(updated),operation.queueId);
  });
  const decode = (row) => row ? JSON.parse(row.payload) : null;
  const required = (value, label) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
    return value.trim();
  };
  const get = (id) => decode(db.prepare('SELECT payload FROM outreach_queue WHERE id = ?').get(id));
  return {
    addMany(items) {
      if (!Array.isArray(items) || !items.length) throw new Error('Select at least one recipient.');
      const prepared = items.map((item) => {
        const applicationKey = required(item.applicationKey, 'Application key');
        const contactId = required(item.contactId, 'Contact ID');
        const email = required(item.email, 'Recipient email');
        if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('Recipient email is invalid.');
        const subject = required(item.subject, 'Subject');
        if (/[\r\n]/.test(subject)) throw new Error('Subject must be a single line.');
        const bodyPlainText = required(item.bodyPlainText, 'Message body');
        const now = new Date().toISOString();
        return {
          id: randomUUID(), applicationKey, contactId, email,
          reviewId: String(item.reviewId || ''),
          fullName: String(item.fullName || ''), role: String(item.role || ''),
          linkedinUrl: String(item.linkedinUrl || ''),
          emailSource: String(item.emailSource || 'unknown'),
          verified: item.verified === true,
          application: structuredClone(item.application || {}),
          subject, bodyPlainText,
          ...(item.bodyHtml ? {bodyHtml:sanitizeSnapshotHtml(item.bodyHtml).html,
            firstname:String(item.firstname||''),lastname:String(item.lastname||''),attachment:structuredClone(item.attachment||null)} : {}),
          status: 'new',
          createdAt: now, updatedAt: now, lastOutcome: ''
        };
      });
      const result = { added: 0, duplicates: 0, items: [] };
      db.exec('BEGIN IMMEDIATE');
      try {
        const insert = db.prepare(`INSERT INTO outreach_queue
          (id, application_key, contact_id, recipient_key, payload)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(application_key, contact_id, recipient_key) DO NOTHING`);
        for (const item of prepared) {
          const key = item.email.toLowerCase();
          const inserted = insert.run(item.id, item.applicationKey, item.contactId, key, JSON.stringify(item));
          if (Number(inserted.changes)) result.added++;
          else result.duplicates++;
          result.items.push(decode(db.prepare(`SELECT payload FROM outreach_queue
            WHERE application_key = ? AND contact_id = ? AND recipient_key = ?`)
            .get(item.applicationKey, item.contactId, key)));
        }
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    list() {
      return db.prepare('SELECT payload FROM outreach_queue ORDER BY rowid').all().map(decode);
    },
    getById: get,
    deleteSelected(ids) {
      if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id.trim())) {
        throw new Error('Select explicit queue IDs.');
      }
      let deleted = 0;
      db.exec('BEGIN IMMEDIATE');
      try {
        const remove = db.prepare('DELETE FROM outreach_queue WHERE id = ?');
        for (const id of new Set(ids)) deleted += Number(remove.run(id).changes);
        db.exec('COMMIT');
        return deleted;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    clearQueue() {
      return Number(db.prepare('DELETE FROM outreach_queue').run().changes);
    },
    claimDraftOperation({queueId,sendingAccount,retryFailed=false}={}) {
      const item=get(required(queueId,'Queue ID'));
      if(!item)throw new Error('Queue item not found.');
      return draftLedger.claim(item,sendingAccount,{retryFailed});
    },
    recordDraftOutcome: draftLedger.recordOutcome,
    getDraftOperationById: draftLedger.getById,
    findDraftOperation: draftLedger.find,
    listDraftOperations: draftLedger.list,
    recordConfirmedSend({ queueId, sendingAccount, messageId, threadId = '', sentAt }) {
      const item = get(required(queueId, 'Queue ID'));
      if (!item) throw new Error('Queue item not found.');
      const account = required(sendingAccount, 'Sending account').toLowerCase();
      const message = required(messageId, 'Confirmed Gmail message ID');
      const timestamp = sentAt ? new Date(sentAt).toISOString() : new Date().toISOString();
      const existing = decode(db.prepare(`SELECT payload FROM outreach_sent_emails
        WHERE sending_account = ? AND message_id = ?`).get(account, message));
      if (existing) {
        if (existing.queueId !== queueId) throw new Error('Message already registered for a different queue item.');
        return existing;
      }
      const record = { ...item, id: randomUUID(), queueId, sendingAccount: account,
        messageId: message, threadId: String(threadId), sentAt: timestamp, status: 'sent' };
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`INSERT INTO outreach_sent_emails
          (id, sending_account, message_id, payload) VALUES (?, ?, ?, ?)`)
          .run(record.id, account, message, JSON.stringify(record));
        db.prepare('UPDATE outreach_queue SET payload = ? WHERE id = ?').run(
          JSON.stringify({ ...item, status: 'sent', updatedAt: timestamp,
            sentAt: timestamp, lastOutcome: `messageId: ${message}` }), queueId);
        db.exec('COMMIT');
        return record;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    listSentEmails() {
      return db.prepare('SELECT payload FROM outreach_sent_emails ORDER BY rowid DESC').all().map(decode);
    },
    close() { db.close(); }
  };
}
