// System check page (/system-check) and its JSON (/api/system-check). Read-only; runs when the page is opened.
import {summaryLine} from '../../application/system-check.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const LABEL = {pass: 'OK', warn: 'Check', fail: 'Fix', off: 'Off'};

export function renderSystemCheck(report) {
  const rows = report.groups.map(g => `<section aria-labelledby="g-${esc(g.group).replace(/\W+/g, '-')}"><h2 id="g-${esc(g.group).replace(/\W+/g, '-')}">${esc(g.group)}</h2>
<table><thead><tr><th scope="col">Check</th><th scope="col">Status</th><th scope="col">Details</th></tr></thead><tbody>
${g.items.map(i => `<tr data-check="${esc(i.id)}" data-status="${esc(i.status)}"><td>${esc(i.label)}</td><td><span class="status status-${esc(i.status)}">${LABEL[i.status]}</span></td><td>${esc(i.detail)}${i.fix ? `<p class="fix"><strong>What to do:</strong> ${esc(i.fix)}</p>` : ''}</td></tr>`).join('\n')}
</tbody></table></section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>System check</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#f5f7fb;color:#172033;margin:0}main{max-width:1100px;margin:auto;padding:24px}
section{background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:16px 18px;margin:16px 0}h2{margin:0 0 8px;font-size:1.15rem}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left;vertical-align:top}th{font-size:.9rem;color:#475569}
td:first-child{width:30%}td:nth-child(2){width:6rem}td{overflow-wrap:anywhere}.status{display:inline-block;min-width:3.2rem;text-align:center;border-radius:999px;padding:1px 10px;font-weight:600;font-size:.88rem}
.status-pass{background:#dcfce7;color:#166534}.status-warn{background:#fef3c7;color:#92400e}.status-fail{background:#fee2e2;color:#991b1b}.status-off{background:#e2e8f0;color:#334155}
.summary{font-size:1.1rem;font-weight:600}.summary-fail{color:#991b1b}.summary-warn{color:#92400e}.summary-pass{color:#166534}.fix{margin:.35rem 0 0;color:#334155}.muted{color:#475569;font-size:.92rem}
@media (max-width:700px){td:first-child{width:auto}}</style></head><body><main>
<h1>System check</h1>
<p class="summary summary-${esc(report.overall)}" role="status" data-system-summary>${esc(summaryLine(report))}</p>
<p class="muted">Checked ${esc(report.checkedAt.replace('T', ' ').slice(0, 19))} UTC. Read-only: nothing is changed, sent or charged, and credentials are never shown. <a href="/system-check">Check again</a></p>
${rows}
</main></body></html>`;
}

export function createSystemCheckHandler({runCheck, sendJson, sendHtml}) {
  return async (req, res, url) => {
    if ((req.method || 'GET') !== 'GET' || !['/system-check', '/api/system-check'].includes(url.pathname)) return false;
    if (req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
    if (typeof runCheck !== 'function') { sendJson(res, 503, {ok: false, error: 'System check is unavailable in this configuration.'}); return true; }
    const report = await runCheck();
    if (url.pathname === '/api/system-check') sendJson(res, 200, {ok: true, ...report});
    else sendHtml(res, 200, renderSystemCheck(report));
    return true;
  };
}
