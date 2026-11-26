// Which tracker clicks count as a person clicking, and the counts per application. Pure: built only from the clicks
// read from the tracker, the local link ids and the confirmed sends. Nothing is sent or changed.
//
// A click does not count when:
//   - the tracker marked it as an automatic check (HEAD request, prefetch, no browser, known email scanner);
//   - it came within SCANNER_WINDOW_MS of the email being sent (security scanners open links on arrival);
//   - its link id is not one this app gave out.
export const SCANNER_WINDOW_MS = 60 * 1000;
const time = v => { const n = Date.parse(v || ''); return Number.isFinite(n) ? n : 0; };
const kind = linkKey => linkKey === 'p' ? 'profile' : String(linkKey).startsWith('a-') ? 'advert' : '';

// clicks: [{id, linkKey, at, scanner}] from the tracker; links: local id rows; sent: confirmed sends ({queueId, sentAt}).
// Returns the clicks that count, each joined to its application and recipient, oldest first.
export function countableClicks(clicks = [], links = [], sent = []) {
  const byId = new Map(links.filter(l => l?.id).map(l => [l.id, l]));
  const sentAt = new Map();
  for (const s of sent) if (s?.queueId && (s.status === 'sent' || !s.status)) { const t = time(s.sentAt); if (t && (!sentAt.has(s.queueId) || t < sentAt.get(s.queueId))) sentAt.set(s.queueId, t); }
  const out = [];
  for (const c of clicks) {
    const link = byId.get(c?.id), at = time(c?.at);
    if (!link || !at || c.scanner || link.linkKey !== c.linkKey || !kind(c.linkKey)) continue;
    const sentTime = sentAt.get(link.queueId);
    if (sentTime && at < sentTime + SCANNER_WINDOW_MS) continue;
    out.push({at: new Date(at).toISOString(), linkKey: c.linkKey, kind: kind(c.linkKey), reviewId: link.reviewId || '', queueId: link.queueId || '', email: link.email || ''});
  }
  return out.sort((a, b) => time(a.at) - time(b.at));
}

// Counts for one application: totals per link and per recipient, newest recipient first.
export function clickSummary(clicks = [], reviewId) {
  const mine = clicks.filter(c => c.reviewId === String(reviewId));
  if (!mine.length) return null;
  const people = new Map();
  for (const c of mine) {
    const p = people.get(c.email) || {email: c.email, advert: 0, profile: 0, lastAt: ''};
    p[c.kind]++; if (c.at > p.lastAt) p.lastAt = c.at;
    people.set(c.email, p);
  }
  return {
    total: mine.length,
    advert: mine.filter(c => c.kind === 'advert').length,
    profile: mine.filter(c => c.kind === 'profile').length,
    lastAt: mine.at(-1).at,
    contacts: [...people.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
  };
}

// The newest countable click per application: {reviewId: ISO time}.
export function latestClickByReview(clicks = []) {
  const out = {};
  for (const c of clicks) if (c.reviewId && (!out[c.reviewId] || c.at > out[c.reviewId])) out[c.reviewId] = c.at;
  return out;
}
