// Email opens per application, from your tracker's alert emails in Gmail (read-only, free). Each check reads only the
// alerts since the last check, keeps a short parsed copy of each (never the whole email) and recounts every
// application. Nothing is sent, changed or retried automatically.
import {parseAlert, openSignalsByReview} from '../domain/outreach/email-open-signals.js';

const DAY = 864e5, MAX_BACK = 120 * DAY, MAX_KEPT = 3000;
const fail = (message, statusCode = 400, code = 'OPENS_BLOCKED') => { throw Object.assign(new Error(message), {statusCode, code}); };
const ymd = ms => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '/');

export function createEmailOpenService({readAlerts = null, sentEmails = () => [], queueItems = () => [], store, mailbox = '', now = () => Date.now()}) {
  let checking = false;
  const sends = () => { try { return (sentEmails() || []).filter(s => s && s.status === 'sent'); } catch { return []; } };
  // Who each application emailed or queued: emails you send yourself from Gmail are matched through these contacts.
  const candidates = sent => {
    let queued = []; try { queued = (queueItems() || []).filter(q => q && q.reviewId && q.email); } catch { queued = []; }
    return [...sent.map(s => ({reviewId: s.reviewId, email: s.email, fullName: s.fullName, subject: s.subject, at: Date.parse(s.sentAt || '') || 0})),
      ...queued.map(q => ({reviewId: q.reviewId, email: q.email, fullName: q.fullName, subject: q.subject, at: Date.parse(q.createdAt || '') || 0}))];
  };
  const summary = (state, reviewId) => {
    const r = state.byReview?.[reviewId] || null;
    return {available: Boolean(readAlerts), checkedAt: state.checkedAt || null, alertsKept: (state.alerts || []).length, review: r};
  };
  return {
    forReview(reviewId) { return summary(store.read(), String(reviewId)); },
    async check(reviewId) {
      if (!readAlerts) fail('Reading email-open alerts needs Gmail switched on (ENABLE_GMAIL=true).', 503, 'OPENS_DISABLED');
      if (checking) fail('Email opens are already being checked. Wait for it to finish.', 409, 'OPENS_BUSY');
      checking = true;
      try {
        // Alerts saved by the first version had no per-recipient entries: read them again from the start.
        const saved = store.read(), state = (saved.alerts || []).every(x => Array.isArray(x.entries)) ? saved : {};
        const sent = sends(), t = now();
        const people = candidates(sent), earliest = Math.min(...people.map(c => c.at).filter(n => n > 0), t);
        const since = Math.max(state.lastAlertAt ? state.lastAlertAt - 2 * DAY : earliest - DAY, t - MAX_BACK);
        const r = await readAlerts({after: ymd(since), expectedAddress: mailbox});
        if (!r.ok) fail(r.code === 'SCOPE_MISSING' ? 'Gmail has not granted read access yet. Run the Maintenance card "Gmail read access: add" once, restart the app, then try again. Nothing was changed.' : r.error, r.code === 'SCOPE_MISSING' ? 403 : 502, 'OPENS_' + r.code);
        const kept = new Map((state.alerts || []).map(a => [a.id, a]));
        let added = 0;
        for (const a of r.alerts.map(parseAlert)) if (a.id && !kept.has(a.id)) { kept.set(a.id, a); added++; }
        const alerts = [...kept.values()].sort((x, y) => y.at - x.at).slice(0, MAX_KEPT);
        const next = {checkedAt: new Date(t).toISOString(), lastAlertAt: alerts.reduce((m, a) => Math.max(m, a.at), 0), alerts, byReview: openSignalsByReview(alerts, people)};
        store.write(next);
        return {...summary(next, String(reviewId || '')), newAlerts: added};
      } finally { checking = false; }
    }
  };
}
