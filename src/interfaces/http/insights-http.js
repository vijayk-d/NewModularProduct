import {insightPatterns} from '../../domain/insights/insight-patterns.js';
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

const pct = v => v === null || v === undefined ? '—' : Math.round(v * 100) + '%';
export function renderEvidenceLearning(l) {
  const proven = l.evidence.filter(e => e.responseRate !== null), early = l.evidence.filter(e => e.responseRate === null);
  const row = e => `<tr data-evidence="${esc(e.key)}"><td>${esc(e.kind === 'scenario' ? 'Scenario' : 'Achievement')}</td><td class="text">${esc(e.label || '(no longer in the snapshot)')}</td><td>${e.uses}</td><td>${e.decided}</td><td>${pct(e.responseRate)}</td><td>${e.interviews}</td><td>${esc((e.lastUsed || '').slice(0, 10))}</td></tr>`;
  const table = (rows, empty) => rows.length ? `<div class="scroll"><table><thead><tr><th>Kind</th><th>Evidence</th><th>Used</th><th>With outcome</th><th>Response rate</th><th>Interviews</th><th>Last used</th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>` : `<p class="muted">${empty}</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evidence learning</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#f5f7fb;color:#172033;margin:0}main{max-width:1200px;margin:auto;padding:24px}section{background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:16px 18px;margin:16px 0}
h2{margin:0 0 .5rem;font-size:1.15rem}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top}th{color:#475569}td.text{min-width:22rem}
.muted{color:#475569;font-size:.92rem}.gap{display:flex;justify-content:space-between;gap:1rem;border-bottom:1px solid #e2e8f0;padding:.4rem 0}</style></head><body><main>
<h1>Evidence learning</h1>
<p data-learning-summary>${l.applications} application${l.applications === 1 ? '' : 's'} in the snapshot, ${l.withOutcome} with an outcome; ${l.evidence.length} evidence item${l.evidence.length === 1 ? '' : 's'} used.</p>
<p class="muted">Learned only from your own applications and the outcomes you record. Response rates show once an item has ${l.minUses} applications with an outcome; until then the numbers are counts only. The engine ranks and suggests; it never writes or changes your evidence, and nothing leaves this PC.</p>
<section aria-labelledby="proven"><h2 id="proven">Evidence with enough outcomes</h2>${table(proven, `None yet. Keep recording outcomes; an item needs ${l.minUses} applications with an outcome.`)}</section>
<section aria-labelledby="gaps"><h2 id="gaps">Gaps: asked for, but missing from your chosen CV</h2>
${l.gaps.length ? l.gaps.slice(0, 25).map(g => `<div class="gap" data-gap="${esc(g.term)}"><span><strong>${esc(g.term)}</strong></span><span>asked in ${g.adverts} advert${g.adverts === 1 ? '' : 's'}, missing in ${g.missing}</span></div>`).join('') + `<p class="muted">If you have real experience of these, add it to your CV or write a scenario in the <a href="/evidence-library">Evidence library</a>. Nothing is added for you.</p>` : '<p class="muted">No repeated gaps yet (a gap needs at least 3 adverts, missing in at least half).</p>'}</section>
<section aria-labelledby="early"><h2 id="early">Evidence still building a record</h2>${table(early.slice(0, 60), 'No evidence used yet.')}</section>
<p class="muted">Updated with the Insights data snapshot${l.builtAt ? ' (' + esc(new Date(l.builtAt).toISOString().replace('T', ' ').slice(0, 16)) + ' UTC)' : ''}. <a href="/insights/data">Insights data</a></p>
</main></body></html>`;
}

// Insights page (/insights): rates per choice, shown only for groups with enough outcomes. Correlation, not cause.
export function renderInsights(p, {builtAt = null, labels = new Map()} = {}) {
  const o = p.overall, min = p.minGroupOutcomes;
  const rate = g => g.ready ? pct(g.responseRate) : `<span class="muted">needs ${g.needed} more</span>`;
  const irate = g => g.ready ? pct(g.interviewRate) : '—';
  const diff = g => g.versusOverall === null ? '' : `<span class="${g.versusOverall >= 0 ? 'up' : 'down'}">${g.versusOverall >= 0 ? '+' : ''}${g.versusOverall} pts</span>`;
  const section = d => `<section aria-labelledby="dim-${esc(d.id)}" data-dimension="${esc(d.id)}"><h2 id="dim-${esc(d.id)}">${esc(d.label)}</h2>
<div class="scroll"><table><thead><tr><th scope="col">${esc(d.label)}</th><th scope="col">Applications</th><th scope="col">With outcome</th><th scope="col">Response rate</th><th scope="col">Interview rate</th><th scope="col">Versus overall</th></tr></thead><tbody>
${d.groups.map(g => `<tr data-group="${esc(g.value)}" data-ready="${g.ready}"><td>${esc(g.value)}</td><td>${g.applications}</td><td>${g.decided}</td><td>${rate(g)}</td><td>${irate(g)}</td><td>${diff(g)}</td></tr>`).join('')}
</tbody></table></div></section>`;
  const evidence = p.interviewEvidence.slice(0, 25);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Insights</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#f5f7fb;color:#172033;margin:0}main{max-width:1200px;margin:auto;padding:24px}section{background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:16px 18px;margin:16px 0}
h2{margin:0 0 .5rem;font-size:1.15rem}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top}th{color:#475569}
.muted{color:#475569;font-size:.92rem}.up{color:#166534}.down{color:#9a3412}.note{border-left:4px solid #2563eb;background:#eff6ff;padding:.6rem .8rem}</style></head><body><main>
<h1>Insights</h1>
<p data-insights-overall>${o.applications} application${o.applications === 1 ? '' : 's'}, ${o.decided} with an outcome. ${o.ready ? `Overall: ${pct(o.responseRate)} got a response, ${pct(o.interviewRate)} reached interview.` : `Overall rates show once ${min} applications have an outcome (${o.needed} more needed).`}</p>
<p class="note">These are patterns in your own applications, not causes: a group may do better for reasons this page cannot see (the market, the advert, timing). A rate shows only once a group has ${min} applications with an outcome; smaller groups show how many more are needed. Nothing here changes your CVs, letters or evidence, and nothing leaves this PC.</p>
${p.dimensions.map(section).join('\n')}
<section aria-labelledby="interview-evidence"><h2 id="interview-evidence">Evidence in applications that reached interview</h2>
${evidence.length ? `<div class="scroll"><table><thead><tr><th scope="col">Evidence</th><th scope="col">Interviews or offers</th></tr></thead><tbody>${evidence.map(e => `<tr data-evidence="${esc(e.key)}"><td>${esc(labels.get(e.key) || (e.key.startsWith('scn:') ? 'Polishing scenario' : '(no longer in the snapshot)'))}</td><td>${e.interviews}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No interviews or offers recorded yet.</p>'}
<p class="muted">Keyword gaps and response rates per evidence line are on <a href="/insights/evidence">Evidence learning</a>.</p></section>
<section aria-labelledby="spend"><h2 id="spend">Spend per application</h2><p class="muted">Not available yet: the cost of paid calls is not stored per application.</p></section>
<p class="muted">Updated with the Insights data snapshot${builtAt ? ' (' + esc(new Date(builtAt).toISOString().replace('T', ' ').slice(0, 16)) + ' UTC)' : ''}. <a href="/insights/data">Insights data</a> · <a href="/api/insights/patterns">JSON</a></p>
</main></body></html>`;
}

export function createInsightsHandler({snapshot, learning = null, sendJson, sendHtml}) {
  return async (req, res, url) => {
    const method = req.method || 'GET', route = url.pathname;
    if (!((method === 'GET' && ['/insights', '/api/insights/patterns', '/insights/data', '/api/insights/features', '/insights/evidence', '/api/insights/evidence'].includes(route)) || (method === 'POST' && ['/insights/rebuild', '/api/insights/rebuild'].includes(route)))) return false;
    const origin = req.headers.origin;
    if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
    if (!snapshot) { sendJson(res, 503, {ok: false, error: 'Insights are unavailable in this configuration.'}); return true; }
    if (route === '/insights/evidence' || route === '/api/insights/evidence') {
      if (!learning) { sendJson(res, 503, {ok: false, error: 'Evidence learning is unavailable in this configuration.'}); return true; }
      const l = learning.summary();
      if (route === '/api/insights/evidence') sendJson(res, 200, {ok: true, ...l}); else sendHtml(res, 200, renderEvidenceLearning(l));
      return true;
    }
    if (route === '/insights' || route === '/api/insights/patterns') {
      const {rows, builtAt} = snapshot.read(), patterns = insightPatterns(rows);
      let labels = new Map();
      try { if (learning) labels = new Map(learning.summary().evidence.filter(e => e.label).map(e => [e.key, e.label])); } catch { /* labels are optional */ }
      if (route === '/api/insights/patterns') sendJson(res, 200, {ok: true, builtAt, ...patterns});
      else sendHtml(res, 200, renderInsights(patterns, {builtAt, labels}));
      return true;
    }
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
