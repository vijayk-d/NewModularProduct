// ATS keyword match for a tailored CV: the same keyword-overlap rule as the CV ranking, applied to the CV text
// before and after tailoring. Pure: no I/O. It never suggests adding a keyword that has no evidence.
import {normalize, overlap, unique} from '../shared/text-normalization.js';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function keywordMatch(keywords = [], text = '') {
  const terms = unique(keywords.map(normalize).filter(Boolean));
  const matched = overlap(terms, text);
  return {total: terms.length, matched, missing: terms.filter(t => !matched.includes(t)), score: terms.length ? Math.round((matched.length / terms.length) * 100) : 0};
}

// Swaps the original section lines for the tailored ones; every other line of the CV stays.
export function tailoredCvText(baseLines = [], originalLines = [], tailoredLines = []) {
  const remove = new Map();
  for (const line of originalLines.map(clean).filter(Boolean)) remove.set(line, (remove.get(line) || 0) + 1);
  const kept = [];
  for (const line of baseLines.map(clean).filter(Boolean)) {
    const n = remove.get(line) || 0;
    if (n) remove.set(line, n - 1); else kept.push(line);
  }
  return [...kept, ...tailoredLines.map(clean).filter(Boolean)].join('\n');
}

export function compareTailoredAts({keywords = [], baseLines = [], originalLines = [], tailoredLines = [], evidence = []} = {}) {
  const before = keywordMatch(keywords, baseLines.join('\n'));
  const after = keywordMatch(keywords, tailoredCvText(baseLines, originalLines, tailoredLines));
  const evidenced = overlap(after.missing, [...evidence, ...originalLines].join('\n'));
  return {
    total: after.total,
    before: {score: before.score, matched: before.matched.length},
    after: {score: after.score, matched: after.matched.length},
    gained: after.matched.filter(t => !before.matched.includes(t)),
    lost: before.matched.filter(t => !after.matched.includes(t)),
    // Missing from the tailored CV but present in your CV lines or selected achievements: safe to work in.
    workIn: after.missing.filter(t => evidenced.includes(t)),
    // No evidence anywhere: leave out rather than claim it.
    noEvidence: after.missing.filter(t => !evidenced.includes(t))
  };
}
