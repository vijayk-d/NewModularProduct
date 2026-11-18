// ATS keyword match for a tailored CV: the same keyword-overlap rule as the CV ranking, applied to the CV text
// before and after tailoring. Pure: no I/O. It never suggests adding a keyword that has no evidence.
import {normalize, unique} from '../shared/text-normalization.js';
import {matchAtsTerms, termsFoundIn, stem} from '../ats/ats-engine.js';

// Plain keyword strings (older callers) become equally weighted terms.
export function termsFromKeywords(keywords = []) {
  return unique(keywords.map(normalize).filter(Boolean)).map(term => ({term, stems: term.split(/[^a-z0-9+&]+/).filter(Boolean).map(stem), weight: 1}));
}

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function keywordMatch(keywords = [], text = '') {
  return matchAtsTerms(termsFromKeywords(keywords), text);
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

// terms: weighted ATS terms (preferred); keywords: plain strings from older callers.
export function compareTailoredAts({terms = null, keywords = [], baseLines = [], originalLines = [], tailoredLines = [], evidence = []} = {}) {
  const list = Array.isArray(terms) ? terms : termsFromKeywords(keywords);
  const before = matchAtsTerms(list, baseLines.join('\n'));
  const after = matchAtsTerms(list, tailoredCvText(baseLines, originalLines, tailoredLines));
  const evidenced = termsFoundIn(list.filter(t => after.missing.includes(t.term)), [...evidence, ...originalLines].join('\n'));
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
