// "Next steps" page (what to click next, across applications) and a JSON view of the same. Read-only.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const HEADINGS = {red: 'Act now', amber: 'Next step ready', green: 'Waiting or closed'};

export function renderNextStepsPage(summary) {
  const groups = ['red', 'amber', 'green'].map(level => {
    const items = summary.steps.filter(s => s.level === level);
    if (!items.length) return '';
    return `<section data-next-group="${level}"><h2>${HEADINGS[level]} (${items.length})</h2><ul class="nmp-next-list">${items.map(s =>
      `<li data-next-level="${level}" data-review-id="${esc(s.reviewId)}"><span class="nmp-shell__dot" aria-hidden="true"></span><span class="nmp-next-name">${esc(s.name)}</span><span>${esc(s.action)}</span><a href="${esc(s.href)}">Go</a><span class="nmp-next-why">${esc(s.why)}</span></li>`).join('')}</ul></section>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Next steps</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f8fafc;color:#0f172a;margin:0}main{max-width:960px;margin:0 auto;padding:16px}h1{font-size:1.5rem;margin:.5rem 0}h2{font-size:1.05rem;margin:1.4rem 0 .6rem}.lead{color:#475569}</style></head>
<body><main><h1>Next steps</h1><p class="lead">What to click next, worked out from your saved applications, the outreach queue, sent emails, recruiter replies and outcomes. Red: act now. Amber: a next step is ready. Green: nothing to do. Applications quiet for over 60 days are left out.</p>
<p class="lead"><span data-notify-status></span> <button type="button" data-notify-toggle hidden>Turn on desktop notifications</button></p>
${groups || '<p data-next-empty>Nothing to show yet: save an application to start.</p>'}</main></body></html>`;
}

export function createNextStepsHandler({service, sendHtml, sendJson}) {
  return async (req, res, url) => {
    if ((req.method || 'GET') !== 'GET' || !['/next-steps', '/api/next-steps'].includes(url.pathname)) return false;
    const summary = service ? service.all() : {level: 'green', red: 0, amber: 0, green: 0, steps: [], label: 'All clear'};
    if (url.pathname === '/api/next-steps') sendJson(res, 200, {ok: true, ...summary});
    else sendHtml(res, 200, renderNextStepsPage(summary));
    return true;
  };
}
