// Gathers what the app already stores (saved applications, the outreach queue, confirmed sends, recruiter replies and
// outcomes) and works out each application's next step. Read-only and free; cached for a few seconds so every page
// can show the indicator cheaply. Any store that fails is skipped rather than breaking the page.
import {nextStepFor, summariseNextSteps} from '../domain/workflow/next-steps.js';
import {currentOutcome, outcomeLabel} from '../domain/insights/application-outcome.js';

const MAX_APPLICATIONS = 400;
const safe = (fn, fallback) => { try { return fn() ?? fallback; } catch { return fallback; } };
const groupBy = rows => { const m = new Map(); for (const r of rows) if (r?.reviewId) { if (!m.has(r.reviewId)) m.set(r.reviewId, []); m.get(r.reviewId).push(r); } return m; };

export function createNextStepsService({reviews, queueItems = () => [], sentEmails = () => [], replyStore = null, outcomes = null, now = () => Date.now(), ttlMs = 8000}) {
  let cached = null;
  function build() {
    const list = safe(() => reviews?.summaries?.({page: 1, size: MAX_APPLICATIONS})?.items, []);
    const queue = groupBy(safe(queueItems, [])), sent = groupBy(safe(sentEmails, []).filter(s => s?.status === 'sent'));
    const t = now();
    const steps = list.map(review => {
      const history = safe(() => outcomes?.history(review.id), []);
      const o = currentOutcome(history);
      return safe(() => nextStepFor({review, queue: queue.get(review.id) || [], sent: sent.get(review.id) || [], replies: safe(() => replyStore?.list(review.id), []),
        outcome: o ? {...o, label: outcomeLabel(o.outcome)} : null, now: t}), null);
    });
    return {...summariseNextSteps(steps), builtAt: t};
  }
  return {
    all() { const t = now(); if (!cached || t - cached.builtAt > ttlMs) cached = build(); return cached; },
    forReview(reviewId) { return this.all().steps.find(s => s.reviewId === String(reviewId)) || null; },
    refresh() { cached = null; }
  };
}
