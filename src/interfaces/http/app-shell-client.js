// Keeps the activity pill on the bar current: every 3 seconds while a task is running, every 15 seconds otherwise
// (so a task started on this page appears), and at once when you come back to the tab. Read-only.
// Optional desktop notification when a task finishes while this tab is in the background: you turn it on from the
// Next steps page (the browser asks once); nothing is shown otherwise.
(() => {
  const SELECTOR = '[data-activity-pill]';
  let timer = null, known = null;
  const running = () => Boolean(document.querySelector(SELECTOR + '[data-activity-state="running"]'));
  const canNotify = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';
  // While hidden, keep checking only if something is running and you asked for notifications.
  const schedule = () => {
    clearTimeout(timer);
    if (document.visibilityState === 'visible') timer = setTimeout(refresh, running() ? 3000 : 15000);
    else if (running() && canNotify()) timer = setTimeout(refresh, 5000);
  };
  function notifyFinished(items) {
    const now = new Map(items.map(a => [a.id, a.state]));
    if (known && document.visibilityState !== 'visible' && canNotify()) {
      for (const a of items) {
        if (known.get(a.id) !== 'running' || a.state === 'running') continue;
        try {
          const n = new Notification(a.state === 'done' ? `${a.label} ✓` : a.label, {body: a.name || '', tag: 'nmp-' + a.id});
          n.onclick = () => { window.focus(); location.href = '/activity/open?id=' + encodeURIComponent(a.id); n.close(); };
        } catch { /* notifications blocked: the pill still turns green */ }
      }
    }
    known = now;
  }
  async function refresh() {
    try {
      const r = await fetch('/api/activity', {cache: 'no-store'});
      const d = await r.json();
      const pill = document.querySelector(SELECTOR);
      if (r.ok && d.ok) {
        notifyFinished(Array.isArray(d.items) ? d.items : []);
        if (pill && typeof d.html === 'string') {
          const t = document.createElement('template');
          t.innerHTML = d.html;
          const next = t.content.firstElementChild;
          if (next && next.outerHTML !== pill.outerHTML) pill.replaceWith(next);
        }
      }
    } catch { /* the pill stays as it was */ }
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
