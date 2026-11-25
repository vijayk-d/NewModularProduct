// Email opens, from the alert emails your tracker (Mailsuite, formerly Mailtrack) sends you. This app cannot use the
// tracker's own API, so it reads those alerts (read-only) and matches each one to an email this app sent: by the
// recipient's address when the alert names it, otherwise by the email's subject. Pure: no I/O.
// An alert says someone opened or clicked; it cannot prove who, and a forward shows only as an open somewhere new.

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TRACKER = /@(?:[a-z0-9-]+\.)*(?:mailsuite\.com|mailtrack\.io)$/i;
export const MIN_SUBJECT = 10;

export const normaliseSubject = s => String(s || '').replace(/^(?:\s*(?:re|fwd?|fw)\s*:\s*)+/i, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function alertKind({subject = '', text = ''} = {}) {
  const t = (subject + ' ' + text).toLowerCase();
  if (/\bclicked\b|\blink (?:was )?clicked\b/.test(t)) return 'clicked';
  if (/\bopened\b|\bhas been read\b|\bwas read\b|\bviewed\b/.test(t)) return 'opened';
  return 'other';
}

// What is kept of an alert: when, what kind, the addresses it names (never the tracker's own) and its words.
export function parseAlert(alert = {}) {
  const text = String(alert.subject || '') + '\n' + String(alert.text || '');
  const addresses = [...new Set((text.match(EMAIL) || []).map(a => a.toLowerCase().replace(/^[.']+|[.']+$/g, '')))].filter(a => !TRACKER.test(a)).slice(0, 20);
  return {id: String(alert.messageId || ''), at: Number(alert.internalDate) || 0, kind: alertKind(alert), addresses, words: normaliseSubject(text).slice(0, 2000)};
}

// sent: [{id, reviewId, email, fullName, subject, sentAt}]. Returns {reviewId: {opens, clicks, lastAt, contacts: [...]}}.
// An alert counts for a sent email only if it came after it; address matches win over subject matches.
export function openSignalsByReview(parsedAlerts = [], sent = []) {
  const emails = (sent || []).filter(s => s && s.reviewId && s.email).map(s => ({...s, address: String(s.email).toLowerCase(), subjectWords: normaliseSubject(s.subject), at: Date.parse(s.sentAt || '') || 0}));
  const out = {};
  for (const a of parsedAlerts) {
    if (a.kind === 'other') continue;
    const after = emails.filter(s => a.at >= s.at - 60000);
    let hits = after.filter(s => a.addresses.includes(s.address));
    if (!hits.length) hits = after.filter(s => s.subjectWords.length >= MIN_SUBJECT && a.words.includes(s.subjectWords));
    // Several emails share the subject and the alert names none of them: count it for the application, not a contact.
    const exact = hits.length === 1 || hits.every(s => a.addresses.includes(s.address));
    for (const reviewId of new Set(hits.map(s => s.reviewId))) {
      const r = out[reviewId] ||= {opens: 0, clicks: 0, lastAt: 0, contacts: {}};
      r[a.kind === 'clicked' ? 'clicks' : 'opens']++; r.lastAt = Math.max(r.lastAt, a.at);
      if (!exact) continue;
      for (const s of hits.filter(h => h.reviewId === reviewId)) {
        const c = r.contacts[s.address] ||= {email: s.address, name: String(s.fullName || ''), opens: 0, clicks: 0, lastAt: 0};
        c[a.kind === 'clicked' ? 'clicks' : 'opens']++; c.lastAt = Math.max(c.lastAt, a.at);
      }
    }
  }
  for (const r of Object.values(out)) r.contacts = Object.values(r.contacts).sort((x, y) => y.lastAt - x.lastAt);
  return out;
}
