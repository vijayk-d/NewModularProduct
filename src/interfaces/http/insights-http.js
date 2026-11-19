// Insights data page (/insights/data) and JSON (/api/insights/features): the feature snapshot, read-only, plus a rebuild.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const LABELS = {
  recruiter_replied: 'Recruiter replied', interview: 'Interview', rejected: 'Rejected', offer: 'Offer', withdrawn: 'Withdrawn', no_reply: 'No reply',
  'direct-employer': 'Employer', 'recruitment-intermediary': 'Agency', unknown: 'Unknown', 'not-set': '—'
};
const COLUMNS = [
  ['Applied', r => (r.appliedAt || r.createdAt || '').slice(0, 10)], ['Organisation', r => r.organisation], ['Role', r => r.jobTitle], ['Family', r => r.roleFamily], ['Level', r => r.seniority],
  ['CV', r => r.cvCode], ['ATS', r => r.atsScore ?? '—'], ['Tailored', r => r.cvTailored ? 'Yes (v' + r.tailoredVersions + ')' : 'No'], ['Tone', r => r.letterTone], ['Length', r => r.letterLength],
  ['Research', r => r.research], ['Relationship', r => LABELS[r.advertiserRelationship] || r.advertiserRelationship], ['Channel', r => r.channel], ['Outcome', r => r.outcome ? (LABELS[r.outcome] || r.outcome) + ' (' + r.outcomeOn + ')' : '—']
];

export function renderInsightsData({rows, builtAt, status}) {
  const withOutcome = rows.filter(r => r.outcome).length;
  const when = builtAt ? new Date(builtAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'not built yet';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Insights data</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#f5f7fb;color:#172033;margin:0}main{max-width:1400px;margin:auto;padding:24px}section{background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:16px 18px;margin:16px 0}
.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top;white-space:nowrap}th{color:#475569}
.muted{color:#475569;font-size:.92rem}button{font:inherit;padding:8px 12px}</style></head><body><main>
<h1>Insights data</h1>
<p data-insights-summary>${rows.length} application${rows.length === 1 ? '' : 's'} in the snapshot, ${withOutcome} with an outcome. Built ${esc(when)}${status?.status === 'failed' ? ' (the last rebuild failed; the previous snapshot is shown)' : ''}.</p>
<p class="muted">One row of facts per saved application (CV, ATS score, letter tone and length, research, advertiser relationship, channel and outcome), rebuilt from local data at start-up, every 15 minutes and after each recorded outcome. Patterns are shown on the insights page once a group has at least 10 outcomes. Read-only; no letter, CV or note text is stored here, and nothing is sent.</p>
<form method="post" action="/insights/rebuild"><button type="submit">Rebuild now</button> <a href="/api/insights/features">JSON</a></form>
<section><div class="scroll"><table><thead><tr>${COLUMNS.map(([h]) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>
${rows.map(r => `<tr data-review="${esc(r.reviewId)}">${COLUMNS.map(([, f]) => `<td>${esc(f(r))}</td>`).join('')}</tr>`).join('\n') || `<tr><td colspan="${COLUMNS.length}">No saved applications yet.</td></tr>`}
</tbody></table></div></section></main></body></html>`;
}

export function createInsightsHandler({snapshot, sendJson, sendHtml}) {
  return async (req, res, url) => {
    const method = req.method || 'GET', route = url.pathname;
    if (!((method === 'GET' && ['/insights/data', '/api/insights/features'].includes(route)) || (method === 'POST' && ['/insights/rebuild', '/api/insights/rebuild'].includes(route)))) return false;
    const origin = req.headers.origin;
    if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
    if (!snapshot) { sendJson(res, 503, {ok: false, error: 'Insights are unavailable in this configuration.'}); return true; }
    if (method === 'POST') {
      const status = await snapshot.rebuild();
      if (route === '/insights/rebuild') { res.writeHead(303, {location: '/insights/data', 'cache-control': 'no-store'}); res.end(); }
      else sendJson(res, 200, {ok: true, status});
      return true;
    }
    const data = snapshot.read();
    if (route === '/api/insights/features') sendJson(res, 200, {ok: true, ...data});
    else sendHtml(res, 200, renderInsightsData(data));
    return true;
  };
}
