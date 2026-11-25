// Slow tasks (polishing a letter, finding an email domain, ...) and whether they have finished, so the bar can tell you
// when to come back: amber while running, green when finished and not yet looked at, red when it failed.
// In memory only: a restart clears it, and a task left running for STALE_MS is treated as interrupted.

export const ACTIVITY_KINDS = Object.freeze({
  polish: {running: 'Polishing letter', done: 'Letter polished', failed: 'Polishing failed', anchor: '#proposed-cover-letter'},
  domain: {running: 'Finding email domain', done: 'Email domain found', failed: 'Domain lookup failed', anchor: '#email-domain-resolution'}
});
export const STALE_MS = 15 * 60 * 1000;
const KEEP = 50;

export function createActivityLog({now = () => Date.now(), nameFor = () => ''} = {}) {
  const items = [];
  let seq = 0;
  const find = id => items.find(a => a.id === id);
  const end = (id, state, error = '') => {
    const a = find(id);
    if (!a || a.state !== 'running') return null;
    Object.assign(a, {state, endedAt: now(), error: String(error || '').slice(0, 200), seen: false});
    return a;
  };
  const view = a => {
    const k = ACTIVITY_KINDS[a.kind], stale = a.state === 'running' && now() - a.startedAt > STALE_MS;
    const state = stale ? 'failed' : a.state;
    return {id: a.id, kind: a.kind, reviewId: a.reviewId, name: a.name, state, level: state === 'running' ? 'amber' : state === 'done' ? 'green' : 'red',
      label: stale ? `${k.running} was interrupted` : k[state], error: stale ? 'No result arrived; it may have been interrupted by a restart.' : a.error,
      href: `/applications/${encodeURIComponent(a.reviewId)}${k.anchor}`, startedAt: a.startedAt, endedAt: a.endedAt || null};
  };
  return {
    start({kind, reviewId}) {
      if (!ACTIVITY_KINDS[kind] || !reviewId) return null;
      let name = ''; try { name = String(nameFor(reviewId) || ''); } catch {}
      const a = {id: `a${++seq}`, kind, reviewId: String(reviewId), name, state: 'running', startedAt: now(), endedAt: 0, error: '', seen: false};
      items.unshift(a); items.splice(KEEP);
      return a.id;
    },
    finish: id => Boolean(end(id, 'done')),
    fail: (id, error) => Boolean(end(id, 'failed', error)),
    // Opening an application (or the pill) means you have seen what finished there.
    markSeen({reviewId, id} = {}) { let n = 0; for (const a of items) if (a.state !== 'running' && !a.seen && (a.id === id || (reviewId && a.reviewId === String(reviewId)))) { a.seen = true; n++; } return n; },
    get: id => { const a = find(id); return a ? view(a) : null; },
    // What the bar shows: running first, then failed, then finished; only ones not yet seen.
    summary() {
      const shown = items.filter(a => a.state === 'running' || !a.seen).map(view).filter(a => a.state === 'running' || !find(a.id).seen);
      const order = {running: 0, failed: 1, done: 2};
      const list = shown.sort((x, y) => order[x.state] - order[y.state] || y.startedAt - x.startedAt);
      return {running: list.filter(a => a.state === 'running').length, items: list};
    }
  };
}
