// Pure rules for a tailored CV. Only the Profile and Key achievements sections change, and only with evidence
// that already exists in the base CV or in the achievements selected for this application.
import {normalize, overlap, unique} from '../shared/text-normalization.js';

export const TAILORED_LIMITS = Object.freeze({maxLines: 12, maxLine: 600, maxProfileChars: 1500, minAchievements: 3, maxAchievements: 8});

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = value => normalize(value).replace(/[^a-z0-9%£$€]+/g, ' ').trim();

// Ranks the existing evidence for the job. Never writes new claims: every line comes from a source.
export function draftTailoredCv({profile = [], achievements = [], selected = [], keywords = []} = {}) {
  const terms = unique(keywords.map(clean).filter(Boolean)).slice(0, 40);
  const pool = [];
  const seen = new Set();
  const add = (text, source, bonus) => {
    const line = clean(text);
    if (!line || line.length > TAILORED_LIMITS.maxLine || seen.has(key(line))) return;
    seen.add(key(line));
    const matched = overlap(terms, line);
    pool.push({text: line, source, matched, score: matched.length + bonus, order: pool.length});
  };
  selected.forEach(text => add(text, 'selected', 0.5));
  achievements.forEach(text => add(text, 'cv', 0));
  const ranked = [...pool].sort((a, b) => b.score - a.score || a.order - b.order);
  const baseCount = achievements.filter(t => clean(t)).length;
  const size = Math.min(ranked.length, Math.max(TAILORED_LIMITS.minAchievements, Math.min(TAILORED_LIMITS.maxAchievements, baseCount || TAILORED_LIMITS.minAchievements)));
  const chosen = ranked.slice(0, size);
  const draftProfile = profile.map(clean).filter(Boolean).slice(0, TAILORED_LIMITS.maxLines);
  const text = [...draftProfile, ...chosen.map(c => c.text)].join(' ');
  const covered = overlap(terms, text);
  const evidenced = overlap(terms, [...draftProfile, ...pool.map(p => p.text)].join(' '));
  return {
    profile: draftProfile,
    achievements: chosen.map(({text, source, matched}) => ({text, source, matched})),
    suggestions: ranked.slice(size).map(({text, source, matched}) => ({text, source, matched})),
    keywordsCovered: covered,
    // In your evidence but not in the draft: candidates to work in. Keywords with no evidence are listed as gaps only.
    keywordsToWorkIn: evidenced.filter(t => !covered.includes(normalize(t))),
    keywordGaps: terms.map(normalize).filter(t => !evidenced.includes(t)).slice(0, 15)
  };
}

const FIGURE = /(?:[£$€]\s?)?\d[\d,.]*(?:\s?(?:%|k|m|bn|million|billion|x))?/gi;
const figure = value => value.toLowerCase().replace(/[\s,]/g, '').replace(/\.$/, '');

export function figuresIn(text) {
  return unique((String(text || '').match(FIGURE) || []).map(figure).filter(f => /\d/.test(f)));
}

// Checks owner-edited wording before a file is built. Figures must appear in the evidence; nothing is invented.
export function checkTailoredCv({profile, achievements, sources = []} = {}) {
  const problems = [];
  const lines = (value, name) => {
    if (!Array.isArray(value)) { problems.push(`${name} is missing.`); return []; }
    const out = value.map(clean).filter(Boolean);
    if (!out.length) problems.push(`${name} needs at least one line.`);
    if (out.length > TAILORED_LIMITS.maxLines) problems.push(`${name} has more than ${TAILORED_LIMITS.maxLines} lines.`);
    if (out.some(l => l.length > TAILORED_LIMITS.maxLine)) problems.push(`A ${name.toLowerCase()} line is longer than ${TAILORED_LIMITS.maxLine} characters.`);
    if (out.some(l => /<\/?[a-z][^>]*>|\{\{|\}\}/i.test(l))) problems.push(`${name} contains markup or a placeholder.`);
    return out;
  };
  const p = lines(profile, 'Profile'), a = lines(achievements, 'Key achievements');
  if (p.join(' ').length > TAILORED_LIMITS.maxProfileChars) problems.push(`Profile is longer than ${TAILORED_LIMITS.maxProfileChars} characters.`);
  const evidence = new Set(figuresIn(sources.join('\n')).flatMap(f => [f, f.replace(/^[£$€]/, '')]));
  const unsupported = figuresIn([...p, ...a].join('\n')).filter(f => !evidence.has(f));
  if (unsupported.length) problems.push(`These figures are not in your CV or selected evidence: ${unsupported.join(', ')}. Remove them or add them to your CV first.`);
  return {ok: problems.length === 0, problems, profile: p, achievements: a};
}
