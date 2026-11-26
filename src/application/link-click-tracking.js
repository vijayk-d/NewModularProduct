// Link-click tracking, Stage 3: "Check link clicks" reads new clicks from your tracker (read-only, one explicit check,
// no automatic retries), keeps only clicks on links this app gave out, and works out the counts per application.
// Clicks are saved in their own file; which link id belongs to whom comes from the local link store.
import {countableClicks, clickSummary, latestClickByReview} from '../domain/outreach/link-clicks.js';

const OVERLAP_MS = 60 * 60 * 1000, MAX_PAGES = 50, MAX_KEPT = 5000;
// Clicks older than this are dropped at each check, matching the tracker, which deletes its records after 90 days.
export const CLICK_RETENTION_DAYS = 90;
const fail = (message, statusCode = 409, code = 'CLICKS_BLOCKED') => { throw Object.assign(new Error(message), {statusCode, code}); };
const keyOf = c => [c.id, c.linkKey, c.at, c.scanner || ''].join('|');

// fetchClicks({since, cursor}) -> {clicks, cursor, complete}, or null when the tracker is not set up.
export function createLinkClickService({fetchClicks = null, links = () => [], sentEmails = () => [], store, now = () => Date.now()}) {
  let checking = false;
  const state = () => { try { const s = store.read() || {}; return {checkedAt: s.checkedAt || '', clicks: Array.isArray(s.clicks) ? s.clicks : []}; } catch { return {checkedAt: '', clicks: []}; } };
  const safeList = fn => { try { return fn() || []; } catch { return []; } };
  const counted = () => countableClicks(state().clicks, safeList(links), safeList(sentEmails));

  function forReview(reviewId) {
    const s = state();
    return {available: Boolean(fetchClicks), checkedAt: s.checkedAt, review: clickSummary(countableClicks(s.clicks, safeList(links), safeList(sentEmails)), reviewId)};
  }

  async function check(reviewId) {
    if (!fetchClicks) fail('Checking link clicks needs LINK_TRACKING_BASE_URL and LINK_TRACKING_READ_KEY in .env.', 503, 'CLICKS_NOT_SET_UP');
    if (checking) fail('A link-click check is already running.');
    checking = true;
    try {
      const before = state(), started = now(), known = new Set(safeList(links).map(l => l.id));
      const since = before.checkedAt ? new Date(Date.parse(before.checkedAt) - OVERLAP_MS).toISOString() : '';
      const seen = new Set(before.clicks.map(keyOf)), fresh = [];
      let cursor = '', pages = 0;
      do {
        let page;
        try { page = await fetchClicks({since, cursor}); } catch { fail('The click tracker could not be reached. Nothing was changed; try again later.', 503, 'CLICKS_UNREACHABLE'); }
        if (!page || !Array.isArray(page.clicks)) fail('The click tracker gave an unexpected answer. Nothing was changed.', 502, 'CLICKS_INVALID');
        for (const c of page.clicks) {
          if (!c || typeof c.id !== 'string' || !known.has(c.id) || typeof c.at !== 'string') continue;
          const row = {id: c.id, linkKey: String(c.linkKey || ''), at: c.at, scanner: String(c.scanner || '')};
          if (!seen.has(keyOf(row))) { seen.add(keyOf(row)); fresh.push(row); }
        }
        cursor = page.complete ? '' : String(page.cursor || '');
      } while (cursor && ++pages < MAX_PAGES);
      const cutoff = new Date(started - CLICK_RETENTION_DAYS * 864e5).toISOString();
      const clicks = [...before.clicks, ...fresh].filter(c => c.at >= cutoff).sort((a, b) => (a.at < b.at ? -1 : 1)).slice(-MAX_KEPT);
      try { store.write({checkedAt: new Date(started).toISOString(), clicks}); } catch { fail('The clicks could not be saved. Nothing was changed.', 500, 'CLICKS_SAVE'); }
      // Only clicks that count as a person: scanner checks are saved (so they are not read again) but not reported.
      return {...forReview(reviewId), newClicks: countableClicks(fresh, safeList(links), safeList(sentEmails)).length};
    } finally { checking = false; }
  }

  return {forReview, check, latestByReview: () => latestClickByReview(counted())};
}
