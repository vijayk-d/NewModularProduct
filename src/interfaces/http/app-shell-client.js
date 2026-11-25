// Status lights on the review page's floating section rail, and optional desktop notifications. Read-only.
// - Each slow task for this application lights its section: Polishing, Email domain, Linked/imported contacts,
//   Current letter (Keywords) or Reply assistant. Pulsing amber while it runs, green when it finishes, red when it fails.
// - The section holding this application's next step gets that step's colour.
// - The link's tooltip and accessible name say the status, so colour is never the only signal.
// - Checks every 3 seconds while a task runs, every 15 seconds otherwise, and at once when you come back to the tab.
// - Desktop notification (turned on from the Next steps page) when a task finishes while the app is in the background.
(() => {
  const ACTIVITY_SECTION = {polish: 'polishing', domain: 'email', contacts: 'contacts', keywords: 'letter', reply: 'reply'};
  const reviewId = document.querySelector('input[name="reviewId"]')?.value || '';
  let timer = null, known = null, lights = new Map(), anyRunning = false;
  const canNotify = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';
  const schedule = () => {
    clearTimeout(timer);
    if (document.visibilityState === 'visible') timer = setTimeout(refresh, anyRunning ? 3000 : 15000);
    else if (anyRunning && canNotify()) timer = setTimeout(refresh, 5000);
  };

  // Which section a next step belongs to, from where its Go link points.
  function stepSection(step) {
    const href = String(step.href || '');
    if (/^Find contacts/.test(step.action || '')) return 'contacts';
    if (href === '/outreach-queue') return 'queue';
    const anchor = href.split('#')[1] || '';
    return {'recruiter-reply': 'reply', 'email-domain-resolution': 'email', 'application-outcome': 'outcome', 'proposed-cover-letter': 'proposal'}[anchor] || 'outcome';
  }
  function paint() {
    const nav = document.querySelector('.workspace-section-nav');
    if (!nav) return;
    for (const a of nav.querySelectorAll('a[data-section-key]')) {
      const base = a.dataset.baseLabel || a.getAttribute('aria-label') || a.title || '';
      if (!a.dataset.baseLabel) a.dataset.baseLabel = base;
      const s = lights.get(a.dataset.sectionKey);
      const dot = a.querySelector('.nmp-rail-light');
      const text = s ? `${base} — ${s.text}` : base;
      if (a.title !== text) { a.title = text; a.setAttribute('aria-label', text); }
      if (!s) { dot?.remove(); continue; }
      const el = dot || Object.assign(document.createElement('i'), {className: 'nmp-rail-light'});
      el.setAttribute('aria-hidden', 'true'); el.dataset.level = s.level; el.dataset.running = String(Boolean(s.running));
      if (!dot) a.append(el);
      a.dataset.activityId = s.activityId || '';
    }
  }
  // The rail redraws itself as sections appear; put the lights back each time.
  function watchRail() {
    const nav = document.querySelector('.workspace-section-nav');
    if (!nav || nav.__nmpLights) return Boolean(nav);
    nav.__nmpLights = true;
    new MutationObserver(() => paint()).observe(nav, {childList: true});
    // Opening a finished task's section counts as seeing it.
    nav.addEventListener('click', e => { const id = e.target.closest?.('a[data-activity-id]')?.dataset.activityId; if (id) fetch('/activity/open?id=' + encodeURIComponent(id), {redirect: 'manual'}).catch(() => {}); });
    return true;
  }

  function notifyFinished(items) {
    const now = new Map(items.map(a => [a.id, a.state]));
    if (known && document.visibilityState !== 'visible' && canNotify()) {
      for (const a of items) {
        if (known.get(a.id) !== 'running' || a.state === 'running') continue;
        try {
          const n = new Notification(a.state === 'done' ? `${a.label} ✓` : a.label, {body: a.name || '', tag: 'nmp-' + a.id});
          n.onclick = () => { window.focus(); location.href = '/activity/open?id=' + encodeURIComponent(a.id); n.close(); };
        } catch { /* notifications blocked */ }
      }
    }
    known = now;
  }

  async function refresh() {
    try {
      const r = await fetch('/api/activity', {cache: 'no-store'});
      const d = await r.json();
      const items = r.ok && d.ok && Array.isArray(d.items) ? d.items : [];
      anyRunning = items.some(a => a.state === 'running');
      notifyFinished(items);
      if (reviewId && watchRail()) {
        const next = new Map();
        try {
          const s = await (await fetch('/api/next-steps', {cache: 'no-store'})).json();
          const step = (s.steps || []).find(x => x.reviewId === reviewId);
          if (step && step.level !== 'green') next.set(stepSection(step), {level: step.level, text: `Next step: ${step.action}`});
        } catch {}
        // Tasks win over the next step on the same section; the latest task per section is shown.
        for (const a of items.filter(x => x.reviewId === reviewId).reverse()) {
          const key = ACTIVITY_SECTION[a.kind];
          if (key) next.set(key, {level: a.level, running: a.state === 'running', activityId: a.state === 'running' ? '' : a.id,
            text: a.state === 'running' ? `${a.label}… (still running)` : a.state === 'done' ? `${a.label} ✓` : `${a.label}${a.error ? ': ' + a.error : ''}`});
        }
        lights = next;
        paint();
      }
    } catch { /* lights stay as they were */ }
    schedule();
  }

  // The Next steps page has the switch for desktop notifications.
  function attachNotifySwitch() {
    const button = document.querySelector('[data-notify-toggle]');
    const status = document.querySelector('[data-notify-status]');
    if (!button) return;
    const show = () => {
      const p = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
      button.hidden = p !== 'default';
      if (status) status.textContent = p === 'granted' ? 'Desktop notifications are on: you are told when a task finishes while this app is in the background.'
        : p === 'denied' ? 'Desktop notifications are blocked for this site in the browser settings.'
        : p === 'unsupported' ? 'This browser does not support desktop notifications.' : 'Get a desktop notification when a slow task finishes while this app is in the background.';
    };
    button.addEventListener('click', async () => { try { await Notification.requestPermission(); } catch {} show(); });
    show();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); else schedule(); });
  document.addEventListener('nmp-activity-started', () => setTimeout(refresh, 500));
  attachNotifySwitch();
  refresh();
})();
