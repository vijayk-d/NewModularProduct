// Slow tasks (polishing a letter, finding an email domain, ...) and whether they have finished, so the bar can tell you
// when to come back: amber while running, green when finished and not yet looked at, red when it failed.
// In memory only: a restart clears it, and a task left running for STALE_MS is treated as interrupted.

export const ACTIVITY_KINDS = Object.freeze({
  polish: {running: 'Polishing letter', done: 'Letter polished', failed: 'Polishing failed', anchor: '#proposed-cover-letter'},
  domain: {running: 'Finding email domain', done: 'Email domain found', failed: 'Domain lookup failed', anchor: '#email-domain-resolution'},
  // Contacts arrive from the LinkedIn tabs one batch at a time: finished once QUIET_MS passes with no new batch,
  // failed if nothing arrives within NOTHING_MS (is the Tampermonkey bridge on?).
  contacts: {running: 'Importing contacts', done: 'Contacts imported', failed: 'No contacts imported', anchor: '#email-domain-resolution', quiet: true},
  keywords: {running: 'Reading the advert', done: 'Advert read for Keywords', failed: 'Advert reading failed', anchor: '#cover-letter-draft'},
  reply: {running: 'Writing reply', done: 'Reply written', failed: 'Reply writing failed', anchor: '#recruiter-reply'}
});
export const QUIET_MS = 45 * 1000, NOTHING_MS = 5 * 60 * 1000;
export const STALE_MS = 15 * 60 * 1000;
const KEEP = 50;

export function createActivityLog({now = () => Date.now(), nameFor = () => ''} = {}) {
  const items = [];
  let seq = 0;
  const find = id => items.find(a => a.id === id);
  // Contact imports finish by going quiet; anything else left running too long counts as interrupted.
  const settle = a => {
    if (a.state !== 'running') return a;
    const t = now();
    if (ACTIVITY_KINDS[a.kind].quiet) {
      if (a.batches > 0 && t - a.lastPulse > QUIET_MS) Object.assign(a, {state: 'done', endedAt: a.lastPulse, seen: false});
      else if (!a.batches && t - a.startedAt > NOTHING_MS) Object.assign(a, {state: 'failed', endedAt: t, seen: false, error: 'No contacts arrived from the LinkedIn tabs. Is the Tampermonkey contact bridge on, and the tick box for automatic import ticked?'});
    } else if (t - a.startedAt > STALE_MS) Object.assign(a, {state: 'failed', endedAt: t, seen: false, interrupted: true, error: 'No result arrived; it may have been interrupted by a restart.'});
    return a;
  };
  const end = (id, state, error = '') => {
    const a = find(id);
    if (!a || a.state !== 'running') return null;
    Object.assign(a, {state, endedAt: now(), error: String(error || '').slice(0, 200), seen: false});
    return a;
  };
  const view = a => {
    settle(a);
    const k = ACTIVITY_KINDS[a.kind], state = a.state;
    const label = a.interrupted ? `${k.running} was interrupted` : k[state] + (a.kind === 'contacts' && state === 'done' ? ` (${a.count} new)` : '');
    return {id: a.id, kind: a.kind, reviewId: a.reviewId, name: a.name, state, level: state === 'running' ? 'amber' : state === 'done' ? 'green' : 'red',
      label, error: a.error, count: a.count || 0,
      href: `/applications/${encodeURIComponent(a.reviewId)}${k.anchor}`, startedAt: a.startedAt, endedAt: a.endedAt || null};
  };
  return {
    start({kind, reviewId}) {
      if (!ACTIVITY_KINDS[kind] || !reviewId) return null;
      const same = items.find(a => a.kind === kind && a.reviewId === String(reviewId) && settle(a).state === 'running');
      if (same && ACTIVITY_KINDS[kind].quiet) return same.id;
      // Trying again replaces the earlier result: an old red (or green) for the same task and application is cleared.
      for (const old of items) if (old.kind === kind && old.reviewId === String(reviewId) && old.state !== 'running') old.seen = true;
      let name = ''; try { name = String(nameFor(reviewId) || ''); } catch {}
      const a = {id: `a${++seq}`, kind, reviewId: String(reviewId), name, state: 'running', startedAt: now(), endedAt: 0, error: '', seen: false, count: 0, batches: 0, lastPulse: 0};
      items.unshift(a); items.splice(KEEP);
      return a.id;
    },
    finish: id => Boolean(end(id, 'done')),
    fail: (id, error) => Boolean(end(id, 'failed', error)),
    // A batch arrived for every running task of this kind (contacts carry no application of their own).
    pulse(kind, count = 1) { let n = 0; for (const a of items) if (a.kind === kind && settle(a).state === 'running') { a.count += Math.max(0, Number(count) || 0); a.batches++; a.lastPulse = now(); n++; } return n; },
    // Opening an application (or the pill) means you have seen what finished there.
    markSeen({reviewId, id} = {}) { let n = 0; for (const a of items.map(settle)) if (a.state !== 'running' && !a.seen && (a.id === id || (reviewId && a.reviewId === String(reviewId)))) { a.seen = true; n++; } return n; },
    get: id => { const a = find(id); return a ? view(a) : null; },
    // What the bar shows: running first, then failed, then finished; only ones not yet seen.
    summary() {
      const shown = items.map(settle).filter(a => a.state === 'running' || !a.seen).map(view);
      const order = {running: 0, failed: 1, done: 2};
      const list = shown.sort((x, y) => order[x.state] - order[y.state] || y.startedAt - x.startedAt);
      return {running: list.filter(a => a.state === 'running').length, items: list};
    }
  };
}
