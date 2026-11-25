// Email opens, from the alert and daily-report emails your tracker (Mailsuite, formerly Mailtrack) sends you. This app
// cannot use the tracker's API, so it reads those emails (read-only) and matches each entry to an application by the
// recipient's address (its sent emails and its queued contacts), using the subject only to choose between applications.
// Mailsuite tracks only emails you send one at a time from Gmail, not this app's bulk sends. Pure: no I/O.
// An alert says someone opened or clicked; it cannot prove who, and a forward shows only as an open somewhere new.

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TRACKER = /@(?:[a-z0-9-]+\.)*(?:mailsuite\.com|mailtrack\.io)$/i;
export const MIN_SUBJECT = 10;

export const normaliseSubject = s => String(s || '').replace(/^(?:\s*(?:re|fwd?|fw)\s*:\s*)+/i, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const addressesIn = text => [...new Set((String(text).match(EMAIL) || []).map(a => a.toLowerCase().replace(/^[.']+|[.']+$/g, '')))].filter(a => !TRACKER.test(a));

export function alertKind({subject = '', text = ''} = {}) {
  const t = (subject + ' ' + text).toLowerCase();
  if (/\bclicked\b|\blink (?:was )?clicked\b/.test(t)) return 'clicked';
  if (/\bopened\b|\bhas been read\b|\bwas read\b|\bviewed\b/.test(t)) return 'opened';
  return 'other';
}

// A report heading ("Unopened emails (3)", "Opened emails (2)", "Clicked links (1)") sets the state of the entries below it.
const HEADING = [[/^\s*(?:unopened|not (?:yet )?opened|unread)\b/i, 'unopened'], [/^\s*(?:links? )?clicked\b|^\s*clicks?\b/i, 'clicked'], [/^\s*(?:opened|read)\b/i, 'opened']];
const sectionOf = raw => { const line = raw.replace(/^[^\p{L}]+/u, ''); return (/^\s*(?:unopened|not (?:yet )?opened|unread|opened|read|clicked|clicks?|links? clicked)\b.{0,30}(?:\(\d+\)|emails?|links?)\s*$/i.test(line) ? HEADING.find(([re]) => re.test(line))?.[1] : null) || null; };

// Entries: one per recipient, each with its state and the subject written above it.
// A daily report is read section by section; a single alert gives its kind to every address it names.
export function parseAlert(alert = {}) {
  const subject = String(alert.subject || ''), text = String(alert.text || '');
  const lines = text.replace(/\r\n/g, '\n').split('\n').map(l => l.trim());
  const entries = [];
  let section = null, above = [], sawHeading = false;
  for (const line of lines) {
    const heading = sectionOf(line);
    if (heading) { section = heading; sawHeading = true; above = []; continue; }
    if (!line) continue;
    const to = /(?:^|\s)(?:to|recipients?)\s*:\s*(.+)$/i.exec(line);
    if (to && section) {
      for (const address of addressesIn(to[1])) entries.push({address, kind: section, words: normaliseSubject(above.join(' ')).slice(0, 300)});
      above = [];
    } else if (!/^sent (?:on|at)\b/i.test(line)) above = [...above, line].slice(-3);
  }
  const report = sawHeading || /daily report|weekly report/i.test(subject);
  if (!report) {
    const kind = alertKind({subject, text});
    if (kind !== 'other') for (const address of addressesIn(subject + '\n' + text)) entries.push({address, kind, words: normaliseSubject(subject + ' ' + text).slice(0, 300)});
  }
  return {id: String(alert.messageId || ''), at: Number(alert.internalDate) || 0, report, entries};
}

// candidates: emails this app sent and contacts queued for an application: [{reviewId, email, fullName, subject, at}].
// Returns {reviewId: {opens, clicks, tracked, lastAt, contacts: [{email, name, state, opens, clicks, lastAt}]}}.
// state is the furthest seen: clicked > opened > unopened. Counts are the alert or report entries that said so.
export function openSignalsByReview(parsedAlerts = [], candidates = []) {
  const byAddress = new Map();
  for (const c of candidates || []) {
    if (!c?.reviewId || !c.email) continue;
    const address = String(c.email).toLowerCase(), list = byAddress.get(address) || [];
    if (!list.some(x => x.reviewId === c.reviewId)) list.push({reviewId: String(c.reviewId), name: String(c.fullName || ''), words: normaliseSubject(c.subject), at: Number(c.at) || 0});
    else { const x = list.find(y => y.reviewId === c.reviewId), times = [x.at, Number(c.at) || 0].filter(n => n > 0); x.at = times.length ? Math.min(...times) : 0; if (!x.words) x.words = normaliseSubject(c.subject); }
    byAddress.set(address, list);
  }
  const RANK = {unopened: 0, opened: 1, clicked: 2}, out = {};
  for (const a of parsedAlerts) for (const e of a.entries || []) {
    let hits = (byAddress.get(e.address) || []).filter(c => !c.at || !a.at || a.at >= c.at - 60000);
    if (hits.length > 1) { const bySubject = hits.filter(c => c.words.length >= MIN_SUBJECT && e.words.includes(c.words)); if (bySubject.length) hits = bySubject; }
    for (const h of hits) {
      const r = out[h.reviewId] ||= {opens: 0, clicks: 0, tracked: 0, lastAt: 0, contacts: {}};
      const c = r.contacts[e.address] ||= {email: e.address, name: h.name, state: 'unopened', opens: 0, clicks: 0, lastAt: 0};
      if (e.kind === 'opened') { c.opens++; r.opens++; }
      if (e.kind === 'clicked') { c.clicks++; r.clicks++; }
      if (RANK[e.kind] > RANK[c.state]) c.state = e.kind;
      c.lastAt = Math.max(c.lastAt, a.at); r.lastAt = Math.max(r.lastAt, a.at);
    }
  }
  for (const r of Object.values(out)) { r.contacts = Object.values(r.contacts).sort((x, y) => RANK[y.state] - RANK[x.state] || y.lastAt - x.lastAt); r.tracked = r.contacts.length; }
  return out;
}
