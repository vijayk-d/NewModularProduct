// Pure rules for a tailored CV. Only the profile (summary), an optional Key achievements section and the order or
// wording of each employer's bullets change, and only with evidence that already exists in the base CV or in the
// achievements selected for this application. Nothing moves between employers.
import {normalize, overlap, unique} from '../shared/text-normalization.js';

export const TAILORED_LIMITS = Object.freeze({maxLines: 12, maxLine: 600, maxProfileLine: 1200, maxProfileChars: 2000, minAchievements: 3, maxAchievements: 8, maxRoles: 25});

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = value => normalize(value).replace(/[^a-z0-9%£$€]+/g, ' ').trim();

function rank(lines, terms, source, bonus = 0, seen = new Set()) {
  const out = [];
  for (const text of lines.map(clean)) {
    if (!text || seen.has(key(text))) continue;
    seen.add(key(text));
    const matched = overlap(terms, text);
    out.push({text, source, matched, score: matched.length + bonus, order: out.length});
  }
  return out;
}
const byScore = (a, b) => b.score - a.score || a.order - b.order;
const strip = ({text, source, matched}) => ({text, source, matched});

// Ranks the existing evidence for the job. Never writes new claims: every line comes from a source.
export function draftTailoredCv({profile = [], achievements = null, roles = [], selected = [], keywords = []} = {}) {
  const terms = unique(keywords.map(clean).filter(Boolean)).slice(0, 40);
  const draftProfile = profile.map(clean).filter(Boolean).slice(0, TAILORED_LIMITS.maxLines);
  let chosen = [], suggestions = [], pool = [];
  if (Array.isArray(achievements)) {
    const seen = new Set();
    pool = [...rank(selected, terms, 'selected', 0.5, seen), ...rank(achievements, terms, 'cv', 0, seen)];
    const ranked = [...pool].sort(byScore);
    const baseCount = achievements.filter(t => clean(t)).length;
    const size = Math.min(ranked.length, Math.max(TAILORED_LIMITS.minAchievements, Math.min(TAILORED_LIMITS.maxAchievements, baseCount || TAILORED_LIMITS.minAchievements)));
    chosen = ranked.slice(0, size);
    suggestions = ranked.slice(size);
  }
  // Each employer keeps its own bullets; only their order changes in the draft.
  const draftRoles = roles.slice(0, TAILORED_LIMITS.maxRoles).map(role => ({title: clean(role.title), bullets: rank(role.bullets || [], terms, 'cv').sort(byScore).map(strip)}));
  const draftText = [...draftProfile, ...chosen.map(c => c.text), ...draftRoles.flatMap(r => r.bullets.map(b => b.text))].join(' ');
  const evidenceText = [draftProfile.join(' '), pool.map(p => p.text).join(' '), selected.join(' '), draftRoles.flatMap(r => r.bullets.map(b => b.text)).join(' ')].join(' ');
  const covered = overlap(terms, draftText), evidenced = overlap(terms, evidenceText);
  return {
    profile: draftProfile,
    achievements: Array.isArray(achievements) ? chosen.map(strip) : null,
    suggestions: suggestions.map(strip),
    roles: draftRoles,
    selected: selected.map(clean).filter(Boolean),
    keywordsCovered: covered,
    // In your evidence but not in the draft: candidates to work in. Keywords with no evidence are listed as gaps only.
    keywordsToWorkIn: evidenced.filter(t => !covered.includes(t)),
    keywordGaps: terms.map(normalize).filter(t => !evidenced.includes(t)).slice(0, 15)
  };
}

const FIGURE = /(?:[£$€]\s?)?\d[\d,.]*(?:\s?(?:%|k|m|bn|million|billion|x))?/gi;
const figure = value => value.toLowerCase().replace(/[\s,]/g, '').replace(/\.$/, '');

export function figuresIn(text) {
  return unique((String(text || '').match(FIGURE) || []).map(figure).filter(f => /\d/.test(f)));
}
const evidenceSet = sources => new Set(figuresIn(sources.join('\n')).flatMap(f => [f, f.replace(/^[£$€]/, '')]));

// Checks owner-edited wording before a file is built. Figures must appear in the evidence; nothing is invented.
export function checkTailoredCv({profile, achievements = null, roles = null, sources = [], roleSources = []} = {}) {
  const problems = [];
  const lines = (value, name, limit = TAILORED_LIMITS.maxLine) => {
    if (!Array.isArray(value)) { problems.push(`${name} is missing.`); return []; }
    const out = value.map(clean).filter(Boolean);
    if (!out.length) problems.push(`${name} needs at least one line.`);
    if (out.length > TAILORED_LIMITS.maxLines) problems.push(`${name} has more than ${TAILORED_LIMITS.maxLines} lines.`);
    if (out.some(l => l.length > limit)) problems.push(`A line in ${name} is longer than ${limit} characters.`);
    if (out.some(l => /<\/?[a-z][^>]*>|\{\{|\}\}/i.test(l))) problems.push(`${name} contains markup or a placeholder.`);
    return out;
  };
  const p = lines(profile, 'Summary', TAILORED_LIMITS.maxProfileLine);
  if (p.join(' ').length > TAILORED_LIMITS.maxProfileChars) problems.push(`Summary is longer than ${TAILORED_LIMITS.maxProfileChars} characters.`);
  const a = achievements === null || achievements === undefined ? null : lines(achievements, 'Key achievements');
  const evidence = evidenceSet(sources);
  const unsupported = figuresIn([...p, ...(a || [])].join('\n')).filter(f => !evidence.has(f));
  if (unsupported.length) problems.push(`These figures are not in your CV or selected evidence: ${unsupported.join(', ')}. Remove them or add them to your CV first.`);
  let r = null;
  if (roles !== null && roles !== undefined) {
    if (!Array.isArray(roles) || roles.length !== roleSources.length) problems.push('The employers in your CV changed. Draft again.');
    else r = roles.map((role, i) => {
      const name = roleSources[i].title || `employer ${i + 1}`;
      const out = lines(role, name);
      const own = evidenceSet(roleSources[i].bullets || []);
      const foreign = figuresIn(out.join('\n')).filter(f => !own.has(f));
      if (foreign.length) problems.push(`${name}: figures ${foreign.join(', ')} are not in this employer's own bullets. Figures cannot move between employers.`);
      return out;
    });
  }
  if (a === null && r === null) problems.push('Nothing to tailor besides the summary.');
  return {ok: problems.length === 0, problems, profile: p, achievements: a, roles: r};
}
