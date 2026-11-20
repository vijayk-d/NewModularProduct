// Builds the feature snapshot (insights phase 2): one row per saved application, rebuilt in full from local data.
// Runs in the background at start-up, every 15 minutes, after an outcome is recorded and on request. No network, no paid call.
import {buildApplicationFeatures} from '../domain/insights/application-features.js';
import {evidenceUsed} from '../domain/insights/evidence-learning.js';

export const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;

export function createInsightsSnapshot({reviews, store, jobImports = null, portalExports = () => [], sentEmails = () => [], tailoredLatest = () => null, scenarioLabel = () => '', clock = () => Date.now(), log = console.warn}) {
  if (!reviews || !store) throw new Error('The insights snapshot needs reviews and the insights store.');
  let running = null, last = {status: 'not-built', count: 0, builtAt: null, durationMs: 0, problems: 0};
  let pending = null;

  function reviewIds() {
    const ids = [];
    if (typeof reviews.summaries === 'function') {
      for (let page = 1; page <= 200; page++) {
        const s = reviews.summaries({page, size: 100});
        ids.push(...(s.items || []).map(i => i.id));
        if (page >= (s.pages || 1)) break;
      }
    } else for (const [id] of reviews) ids.push(id);
    return [...new Set(ids)];
  }

  async function build() {
    const started = clock();
    const exports = await Promise.resolve(portalExports()).catch(() => []) || [];
    const sent = await Promise.resolve(sentEmails()).catch(() => []) || [];
    const rows = [], evidence = new Map();
    let problems = 0;
    for (const reviewId of reviewIds()) {
      try {
        const review = reviews.get(reviewId);
        if (!review) continue;
        const form = review.formData || {};
        let importedJob = null;
        try { importedJob = form.jobImportId && jobImports?.get ? jobImports.get(form.jobImportId, form.jobImportRevision) : null; } catch { importedJob = null; }
        let tailored = null;
        try { tailored = await tailoredLatest(reviewId); } catch { tailored = null; }
        rows.push(buildApplicationFeatures({reviewId, review, importedJob, portalExports: exports, sentEmails: sent, tailored, outcomes: store.history(reviewId)}));
        for (const e of evidenceUsed(review)) if (!evidence.has(e.key)) { let label = e.label; if (e.kind === 'scenario') { try { label = String(scenarioLabel(e.scenarioId, e.assignmentId) || '') || 'Scenario ' + String(e.scenarioId).slice(0, 8); } catch { label = 'Scenario'; } } evidence.set(e.key, {key: e.key, kind: e.kind, label}); }
      } catch { problems++; }
    }
    const saved = store.replaceFeatures(rows, clock());
    if (typeof store.replaceEvidenceItems === 'function') store.replaceEvidenceItems([...evidence.values()], saved.builtAt);
    last = {status: 'built', count: saved.count, builtAt: saved.builtAt, durationMs: clock() - started, problems};
    if (problems) log(`[INSIGHTS] SNAPSHOT_SKIPPED ${problems} application(s) that could not be read`);
    return last;
  }

  return {
    // One rebuild at a time; a request during a rebuild waits for it.
    rebuild() {
      if (running) return running;
      running = build().catch(error => { last = {...last, status: 'failed', error: error.code || error.name || 'error'}; log('[INSIGHTS] SNAPSHOT_FAILED'); return last; }).finally(() => { running = null; });
      return running;
    },
    // Coalesces bursts (for example several outcomes recorded together) into one rebuild a few seconds later.
    schedule(delayMs = 3000) {
      if (pending) return;
      pending = setTimeout(() => { pending = null; this.rebuild(); }, delayMs);
      pending.unref?.();
    },
    start({initialDelayMs = 5000, intervalMs = SNAPSHOT_INTERVAL_MS} = {}) {
      const first = setTimeout(() => this.rebuild(), initialDelayMs); first.unref?.();
      const every = setInterval(() => this.rebuild(), intervalMs); every.unref?.();
      return () => { clearTimeout(first); clearInterval(every); };
    },
    status() { return {...last, running: Boolean(running)}; },
    read() { return {...store.features(), status: this.status()}; }
  };
}
