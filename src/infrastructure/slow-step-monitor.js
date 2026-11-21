// Slow-step log: names what made every tab wait. The app is one Node process, so a long synchronous step
// (heavy database reads, building a big page) delays all tabs until it finishes.
// - A timer ticks every intervalMs; when a tick arrives more than blockedMs late, the event loop was blocked,
//   and the line lists the requests that were in progress.
// - A request taking longer than slowRequestMs in total is logged when it finishes.
// Logged: method, path (no query string), milliseconds. No bodies, names, emails or IDs from the query.
export const BLOCKED_MS = 200, SLOW_REQUEST_MS = 2000, INTERVAL_MS = 100;

const label = req => {
  let pathname = '';
  try { pathname = new URL(req.url || '/', 'http://local').pathname; } catch { pathname = '/'; }
  // Long IDs in paths (reviews, jobs, attempts) are shortened so the log shows the route, not the record.
  pathname = pathname.split('/').map(part => part.length > 24 || /^[0-9a-f-]{16,}$/i.test(part) ? ':id' : part).join('/');
  return String(req.method || 'GET') + ' ' + pathname;
};

export function createSlowStepMonitor({log = console.warn, now = () => performance.now(), setIntervalFn = setInterval, clearIntervalFn = clearInterval,
  blockedMs = BLOCKED_MS, slowRequestMs = SLOW_REQUEST_MS, intervalMs = INTERVAL_MS} = {}) {
  const active = new Map(), recent = [];
  let next = 0, timer = null, expected = 0;
  // Requests still running, plus any that finished during the wait (a blocking request often ends before the late tick).
  const describe = (at, since) => [...[...active.values()].map(r => `${r.label} (${Math.round(at - r.started)} ms)`),
    ...recent.filter(r => r.ended >= since).map(r => `${r.label} (${Math.round(r.ended - r.started)} ms, finished)`)].join(', ') || 'none (start-up or background work)';

  function tick() {
    const at = now(), late = at - expected;
    if (late > blockedMs) log(`[SLOW] Every tab waited about ${Math.round(late)} ms. In progress: ${describe(at, expected - intervalMs)}`);
    expected = at + intervalMs;
    while (recent.length && recent[0].ended < at - 60000) recent.shift();
  }

  function track(req, res) {
    const id = ++next, entry = {label: label(req), started: now()};
    active.set(id, entry);
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      active.delete(id);
      const ended = now(), took = ended - entry.started;
      recent.push({...entry, ended}); if (recent.length > 50) recent.shift();
      if (took > slowRequestMs) log(`[SLOW] ${entry.label} took ${Math.round(took)} ms`);
    };
    res.once?.('finish', finish); res.once?.('close', finish);
  }

  return {
    track, tick, activeCount: () => active.size,
    // prependListener: tracking starts before the app's own handler, so a request that blocks at once is still named.
    attach(server) { (server.prependListener ? server.prependListener('request', track) : server.on('request', track)); return this; },
    start() { if (!timer) { expected = now() + intervalMs; timer = setIntervalFn(tick, intervalMs); timer?.unref?.(); } return this; },
    stop() { if (timer) clearIntervalFn(timer); timer = null; }
  };
}
