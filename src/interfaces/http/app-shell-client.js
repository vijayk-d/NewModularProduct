// Keeps the activity pill on the bar current: every 3 seconds while a task is running, every 15 seconds otherwise
// (so a task started on this page appears), and at once when you come back to the tab. Read-only.
(() => {
  const SELECTOR = '[data-activity-pill]';
  let timer = null;
  const running = () => Boolean(document.querySelector(SELECTOR + '[data-activity-state="running"]'));
  const schedule = () => { clearTimeout(timer); if (document.visibilityState === 'visible') timer = setTimeout(refresh, running() ? 3000 : 15000); };
  async function refresh() {
    try {
      const r = await fetch('/api/activity', {cache: 'no-store'});
      const d = await r.json();
      const pill = document.querySelector(SELECTOR);
      if (r.ok && d.ok && pill && typeof d.html === 'string') {
        const t = document.createElement('template');
        t.innerHTML = d.html;
        const next = t.content.firstElementChild;
        if (next && next.outerHTML !== pill.outerHTML) pill.replaceWith(next);
      }
    } catch { /* the pill stays as it was */ }
    schedule();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); else clearTimeout(timer); });
  document.addEventListener('nmp-activity-started', () => setTimeout(refresh, 500));
  schedule();
})();
