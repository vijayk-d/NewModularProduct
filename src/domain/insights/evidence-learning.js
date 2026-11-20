// Evidence engine (programme slice 2): learns, from your own applications and outcomes, which evidence lines tend to
// get responses and which job terms your evidence keeps missing. Pure and local. It ranks and suggests; it never writes evidence.
import {hasResponse} from './application-outcome.js';

export const MIN_USES_FOR_RATE = 5;
const norm = text => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Stable short key for an evidence line (53-bit string hash), so the snapshot holds keys, not text.
export function evidenceKey(text) {
  const s = norm(text);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'ach:' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const scenarioKey = id => 'scn:' + String(id || '');

// Which evidence an application used: its selected achievements and its approved polishing scenarios.
export function evidenceUsed(review) {
  const items = [];
  for (const text of Array.isArray(review?.formData?.cvHighlights) ? review.formData.cvHighlights : []) {
    if (String(text || '').trim() && String(text).toLowerCase() !== 'null') items.push({key: evidenceKey(text), kind: 'achievement', label: String(text).replace(/\s+/g, ' ').trim().slice(0, 600)});
  }
  for (const ref of Array.isArray(review?.polishingScenarios?.references) ? review.polishingScenarios.references : []) {
    if (ref?.scenarioId) items.push({key: scenarioKey(ref.scenarioId), kind: 'scenario', label: '', scenarioId: ref.scenarioId, assignmentId: ref.assignmentId || ''});
  }
  const seen = new Set();
  return items.filter(i => !seen.has(i.key) && seen.add(i.key));
}

const interviewed = outcome => outcome === 'interview' || outcome === 'offer';

// rows: feature snapshot rows (with evidenceKeys, jobTerms, missingTerms, outcome). Only rows with a recorded outcome teach rates.
export function learnFromApplications(rows = []) {
  const items = new Map(), terms = new Map();
  for (const row of rows) {
    const decided = Boolean(row.outcome);
    for (const key of row.evidenceKeys || []) {
      const s = items.get(key) || {key, uses: 0, decided: 0, responded: 0, interviews: 0, lastUsed: ''};
      s.uses++;
      if (decided) { s.decided++; if (hasResponse({outcome: row.outcome})) s.responded++; if (interviewed(row.outcome)) s.interviews++; }
      const when = row.appliedAt || row.createdAt || '';
      if (when > s.lastUsed) s.lastUsed = when;
      items.set(key, s);
    }
    const missing = new Set((row.missingTerms || []).map(norm));
    for (const term of new Set((row.jobTerms || []).map(norm))) {
      if (!term) continue;
      const t = terms.get(term) || {term, adverts: 0, missing: 0};
      t.adverts++; if (missing.has(term)) t.missing++;
      terms.set(term, t);
    }
  }
  const evidence = [...items.values()].map(s => ({...s, responseRate: s.decided >= MIN_USES_FOR_RATE ? s.responded / s.decided : null, interviewRate: s.decided >= MIN_USES_FOR_RATE ? s.interviews / s.decided : null}));
  // A gap: asked for in at least 3 adverts and missing from the chosen CV in at least half of them.
  const gaps = [...terms.values()].filter(t => t.adverts >= 3 && t.missing / t.adverts >= 0.5).sort((a, b) => b.missing - a.missing || b.adverts - a.adverts || a.term.localeCompare(b.term));
  return {evidence: evidence.sort((a, b) => (b.responseRate ?? -1) - (a.responseRate ?? -1) || b.uses - a.uses), gaps, applications: rows.length, withOutcome: rows.filter(r => r.outcome).length};
}

// A small, bounded nudge for ranking: proven evidence moves up, evidence that keeps getting no response moves down.
// Nothing changes until an item has at least MIN_USES_FOR_RATE decided applications.
export function learnedBonus(stat) {
  if (!stat || stat.responseRate === null || stat.responseRate === undefined) return 0;
  return Math.max(-2, Math.min(2, Math.round((stat.responseRate - 0.3) * 6)));
}

export function learningNote(stat) {
  if (!stat?.uses) return '';
  const used = `Used in ${stat.uses} application${stat.uses === 1 ? '' : 's'}`;
  if (stat.responseRate === null) return `${used}; ${stat.decided} with an outcome so far (rates show from ${MIN_USES_FOR_RATE}).`;
  return `${used} · ${Math.round(stat.responseRate * 100)}% got a response · ${stat.interviews} interview${stat.interviews === 1 ? '' : 's'}.`;
}
