// New, separate store for recruiter replies found in Gmail and the reply drafted for each. It never opens or changes
// existing databases. One row per (application, their message); finding replies again never overwrites a saved draft.
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {openSqlite} from '../sqlite-open.js';

const COLUMNS = ['thread_id', 'from_name', 'from_address', 'subject', 'date_text', 'internal_date', 'their_text', 'draft_text', 'draft_html', 'recipient_name',
  'application_status', 'owner_note', 'gmail_draft_id', 'status', 'updated_at'];

const row = r => r && {messageId: r.message_id, threadId: r.thread_id, fromName: r.from_name, fromAddress: r.from_address, subject: r.subject, date: r.date_text,
  internalDate: Number(r.internal_date) || 0, text: r.their_text, draftText: r.draft_text || '', draftHtml: r.draft_html || '', recipientName: r.recipient_name || '',
  applicationStatus: r.application_status || '', ownerNote: r.owner_note || '', gmailDraftId: r.gmail_draft_id || '', status: r.status || 'new', updatedAt: r.updated_at};

export function createReplyThreadsStore({filePath, clock = () => new Date().toISOString()} = {}) {
  if (typeof filePath !== 'string' || !filePath) throw new Error('Explicit reply store path required.');
  if (filePath !== ':memory:') mkdirSync(path.dirname(filePath), {recursive: true});
  const db = openSqlite(filePath);
  db.exec(`CREATE TABLE IF NOT EXISTS reply_items(review_id TEXT NOT NULL, message_id TEXT NOT NULL, ${COLUMNS.map(c => c + (c === 'internal_date' ? ' INTEGER' : ' TEXT')).join(', ')}, PRIMARY KEY(review_id, message_id))`);
  const get = (reviewId, messageId) => row(db.prepare('SELECT * FROM reply_items WHERE review_id=? AND message_id=?').get(reviewId, messageId));
  return {
    list: reviewId => db.prepare('SELECT * FROM reply_items WHERE review_id=? ORDER BY internal_date DESC, message_id').all(reviewId).map(row),
    get,
    // Adds replies not seen before; keeps every saved draft and status.
    addFound(reviewId, replies = []) {
      const insert = db.prepare(`INSERT INTO reply_items(review_id, message_id, thread_id, from_name, from_address, subject, date_text, internal_date, their_text, status, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,'new',?) ON CONFLICT(review_id, message_id) DO NOTHING`);
      for (const r of replies) if (r?.messageId) insert.run(reviewId, String(r.messageId), String(r.threadId || ''), String(r.fromName || ''), String(r.fromAddress || ''),
        String(r.subject || ''), String(r.date || ''), Number(r.internalDate) || 0, String(r.text || '').slice(0, 20000), clock());
    },
    saveDraft(reviewId, messageId, d) {
      if (!get(reviewId, messageId)) return null;
      db.prepare(`UPDATE reply_items SET draft_text=?, draft_html=?, recipient_name=?, application_status=?, owner_note=?, status=CASE WHEN status='in_gmail' THEN status ELSE 'drafted' END, updated_at=?
        WHERE review_id=? AND message_id=?`).run(String(d.draftText || '').slice(0, 20000), String(d.draftHtml || '').slice(0, 60000), String(d.recipientName || '').slice(0, 80),
        String(d.applicationStatus || ''), String(d.ownerNote || '').slice(0, 1000), clock(), reviewId, messageId);
      return get(reviewId, messageId);
    },
    markGmailDraft(reviewId, messageId, draftId) {
      db.prepare("UPDATE reply_items SET gmail_draft_id=?, status='in_gmail', updated_at=? WHERE review_id=? AND message_id=?").run(String(draftId), clock(), reviewId, messageId);
      return get(reviewId, messageId);
    },
    close: () => db.close()
  };
}
