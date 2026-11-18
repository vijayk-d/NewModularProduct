// ATS engine: one shared, local and free keyword model for CV selection and the tailored CV check.
// Pure domain code: no I/O. It reads only the job description and CV text it is given and never invents evidence.
//
// 1. Clean the advert: company, benefits and diversity text, location/contract lines and eligibility wording are left out.
// 2. Extract terms: known skill phrases, repeated 2-3 word phrases, acronyms and content words (filler words removed).
// 3. Weight each term by section (requirements > duties > intro), cue words (essential/must > ideally) and repetition.
// 4. Match whole words with simple word-form variants (manage/managing/management), never parts of words.
// Eligibility (security clearance, right to work, qualifications, licence, travel) is reported separately: confirm, do not add as keywords.

export const ATS_ENGINE_VERSION = 'ats-terms-v1';
const MAX_TERMS = 40;

const FILLER = new Set(`a an and are as at be been being but by can could do does for from had has have he her his how i if in into is it its
me my no not of on or our out over she so than that the their them then there these they this those to too under up upon us was we were what
when where which while who whom why will with within would you your yours about above across after again against all also always am any
because before below between both during each few further here just more most much must nor off once only other ought own same should some
such through until very via well able ability need needs needed pass passed right full new strong apply applying ensure ensuring ensures
successful success successfully track record proven confident clear solid commitment committed excellent good great high highly level
levels experience experienced skills skilled knowledge understanding including include includes include role roles job jobs candidate
candidates team teams work working works ideally awareness place putting keep keeping running smoothly early future use using used support
supporting provide providing make making made take taking get getting give given part time year years day days one two three way ways
like lot lots per plus etc eg ie various related relevant key main major wide wider range overall others another every ever often
whilst whose ability abilities opportunity opportunities looking join joining help helping want wants wish within around along based
including include working worked world global international national ad hoc hoc line lines sound effectively effective efficient
efficiently successful outcomes outcome deliverable along need also able build building identify identifying internal external maintain
maintaining lead leading leads complex complexity drive driving provide review reviewing assess assessing oversee overseeing carry capture
stay proactive protect enhance highlight allocate following independently completed qualification qualifications requirement requirements
reputable recognised association obtain hold bring adaptable long lasting focus robust aligning align matches intent impact impacts maintains
taking concept launch value objectives approach basis guiding apply background business manage`.split(/\s+/).filter(Boolean));

// Known skill phrases (written as plain words; matched on word forms).
const KNOWN_PHRASES = ['project management', 'programme management', 'portfolio management', 'risk management', 'issue management',
  'stakeholder management', 'stakeholder engagement', 'change control', 'change management', 'lessons learned', 'continuous improvement',
  'benefits realisation', 'design for manufacture', 'project plans', 'project plan', 'budget management', 'financial control',
  'resource planning', 'resource management', 'supplier management', 'contract management', 'quality assurance', 'quality management',
  'product development', 'product lifecycle', 'new product development', 'cross functional', 'gated process', 'stage gate',
  'requirements management', 'scope management', 'release management', 'service management', 'vendor management', 'people management',
  'line management', 'agile delivery', 'delivery management', 'digital transformation', 'business case', 'business cases',
  'cost control', 'earned value', 'critical path', 'dependency management', 'raid log', 'safety leadership', 'technical risk',
  'manufacturing risk', 'contingency plans', 'scope changes', 'cash flow', 'cashflow', 'data analysis', 'process improvement'];
// Last words that make a two or three word phrase a skill (for example "budget forecasting", "risk assessments").
const HEAD_WORDS = new Set(['management', 'control', 'engagement', 'delivery', 'planning', 'governance', 'assessment', 'assessments',
  'process', 'processes', 'lifecycle', 'realisation', 'improvement', 'capability', 'design', 'manufacture', 'manufacturing', 'engineering',
  'analysis', 'reporting', 'leadership', 'strategy', 'forecasting', 'forecasts', 'budgets', 'standards', 'plans', 'transformation',
  'architecture', 'integration', 'testing', 'compliance', 'operations', 'requirements', 'methodology', 'framework', 'frameworks']);

// Verbs that start duties ("manage project budgets") rather than name a skill.
const ACTION_STEMS = new Set(['manag', 'deliver', 'lead', 'driv', 'develop', 'build', 'run', 'own', 'implement', 'creat', 'defin', 'oversee', 'review', 'report', 'coordinat', 'plan', 'forecast', 'track', 'monitor', 'control']);

const SECTION = [
  {weight: 0, pattern: /^(about (us|the company|the business|the team)|why join us|what we offer|benefits|perks|our values|our culture|equal opportunit|diversity|how to apply|about jfd|explore more|visit our website|not specified)\b/i},
  {weight: 3, pattern: /^(what we('|’)?re looking for|what you('|’)?ll (need|bring|have)|requirements|essential|desirable|about you|skills|qualifications|person specification|experience required|you will have|who you are)\b/i},
  {weight: 2, pattern: /^(what you('|’)?ll be doing|responsibilities|key responsibilities|the role|key duties|duties|day to day|your role|role overview|about the (role|job))\b/i}
];
const HEADINGS = /(Why join us\??|About Us|About You|What We(?:'|’)re Looking For|What You(?:'|’)ll Be Doing|What we offer|Key responsibilities|Responsibilities|Requirements|The Role)/g;
const BOILERPLATE_LINE = /(click\s+['‘’]?apply|apply now|applications? may close|disability confident|positive action|diversity|inclusive|equal opportunit|visit our website|follow the link|pension|private medical|life assurance|cycle to work|competitive salary|salary|early finish|holiday|annual leave|career development|values and behaviours|benefits package)/i;
const CONTRACT_WORDS = /^(permanent|contract|temporary|fixed[- ]term|full[- ]time|part[- ]time|hybrid|remote|on[- ]site|office[- ]based|flexible)$/i;

const ELIGIBILITY = [
  {id: 'security-clearance', label: 'Security clearance (SC/DV/BPSS)', pattern: /\b(?:(?:sc|dv|nppv|bpss|ctc)[\s‑-]*(?:level\s+)?(?:security\s+)?(?:clearance|vetting|cleared)|security\s+clearance|developed\s+vetting|security\s+vetting)\b/gi},
  {id: 'right-to-work', label: 'Right to work in the UK', pattern: /\b(?:right to work(?: and reside)?(?: in the uk)?|eligib\w* to work in the uk|visa sponsorship|work permit)\b/gi},
  {id: 'qualification', label: 'Qualification', pattern: /\b(?:recognised\s+)?project management qualification\b|\b(?:APM|PMP|PRINCE2|Prince ?2|MSP|PMQ|ChPP|CAPM|PgMP|PSM|CSM|SAFe)\b/g},
  {id: 'driving-licence', label: 'Driving licence', pattern: /\b(?:full\s+)?(?:uk\s+)?driving licen[cs]e\b/gi},
  {id: 'travel', label: 'Travel', pattern: /\b(?:national and international|international|national|overseas|regular|occasional|ad[- ]hoc)?\s*travel(?:ling)?\b/gi}
];

// Word forms: manage/managing/management/manager -> manag; stakeholders -> stakehold; programme/program -> programm.
export function stem(word) {
  let w = String(word || '').toLowerCase().replace(/[’']/g, '').replace(/iz(e|es|ed|ing|ation|ations)$/, 'is$1');
  if (w === 'program' || w === 'programs') w = 'programme';
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  for (const suffix of ['ations', 'ation', 'ators', 'ator', 'ments', 'ment', 'ings', 'ing', 'ers', 'er', 'ed', 'es', 's']) {
    if (w.endsWith(suffix) && !(suffix === 's' && /(ss|us|is)$/.test(w)) && w.length - suffix.length >= 4) { w = w.slice(0, -suffix.length); break; }
  }
  if (w.length > 4 && /[ey]$/.test(w)) w = w.slice(0, -1);
  return w;
}

// Words with their original spelling, so acronyms and proper nouns can be recognised. Hyphens and slashes split words.
function words(text) {
  const out = [];
  const normalised = String(text || '').replace(/\bprince\s*2\b/gi, 'PRINCE2').replace(/[‐‑‒–—-]/g, ' ');
  for (const m of normalised.matchAll(/[A-Za-z][A-Za-z0-9+&’']*/g)) out.push({raw: m[0].replace(/[’']s$/, ''), index: m.index});
  return out;
}
const isAcronym = raw => /^[A-Z][A-Z0-9+&]{1,7}$/.test(raw) && /[A-Z].*[A-Z0-9]/.test(raw);

function stripEligibility(text) {
  let out = text;
  for (const rule of ELIGIBILITY) out = out.replace(rule.pattern, ' ');
  return out;
}

// Splits the advert into weighted lines; company, benefits and contract/location text get weight 0.
export function advertSections(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').replace(HEADINGS, '\n$1\n');
  let weight = 1.5, started = false;
  const lines = [];
  for (const source of raw.split('\n')) {
    const line = source.replace(/^[\s*•●▪-]+/, '').trim();
    if (!line) continue;
    const heading = line.length <= 60 && !/[.;]$/.test(line) && SECTION.find(s => s.pattern.test(line));
    // LinkedIn's "About the job" wrapper comes before the location lines, so it does not end the header block.
    if (heading) { weight = /^about the job\b/i.test(line) ? 1.5 : heading.weight; started ||= !/^about the job\b/i.test(line); continue; }
    const tokens = line.split(/[\s,|/]+/).filter(Boolean);
    // Location and contract lines at the top ("Westhill, Aberdeen", "Permanent, Hybrid").
    if (!started && tokens.length <= 4 && (tokens.every(t => CONTRACT_WORDS.test(t)) || tokens.every(t => /^[A-Z]/.test(t)))) continue;
    if (BOILERPLATE_LINE.test(line)) continue;
    const cue = /\b(essential|must|required|requirement|mandatory)\b/i.test(line) ? 1.5 : /\b(ideally|desirable|nice to have|preferred|bonus|advantageous)\b/i.test(line) ? 0.6 : 1;
    lines.push({text: line, weight: weight * cue});
  }
  return lines;
}

// cvText (optional): named qualifications already shown in the CV are reported, so you know which to confirm.
export function eligibilityChecks(text, cvText = '') {
  const raw = String(text || ''), cv = String(cvText || '');
  const found = [];
  for (const rule of ELIGIBILITY) {
    const hits = [...new Set([...raw.matchAll(rule.pattern)].map(m => m[0].replace(/\s+/g, ' ').trim()))];
    if (!hits.length) continue;
    if (rule.id === 'qualification') {
      const named = [...new Set(hits.filter(h => !/qualification/i.test(h)).map(h => (/prince/i.test(h) ? 'PRINCE2' : h.toUpperCase())))];
      const inCv = named.filter(q => (q === 'PRINCE2' ? /\bprince\s*2\b/i : new RegExp('\\b' + q + '\\b', 'i')).test(cv));
      found.push({id: rule.id, label: named.length ? `Project management qualification (${named.join(', ')})` : 'Project management qualification', ...(inCv.length ? {inCv} : {})});
    } else found.push({id: rule.id, label: rule.label});
  }
  return found;
}

function properNouns(lines) {
  // A word that is always capitalised away from the start of a sentence is a name or place (Aberdeen, Fisher), not a skill.
  const seen = new Map();
  for (const {text} of lines) {
    for (const [i, w] of words(text).entries()) {
      if (isAcronym(w.raw)) continue;
      const key = w.raw.toLowerCase(), before = text.slice(0, w.index).trimEnd();
      const sentenceStart = i === 0 || /[.:!?]$/.test(before);
      const entry = seen.get(key) || {capital: 0, lower: 0};
      if (/^[a-z]/.test(w.raw)) entry.lower++; else if (!sentenceStart) entry.capital++;
      seen.set(key, entry);
    }
  }
  return new Set([...seen].filter(([, e]) => e.capital > 0 && e.lower === 0).map(([k]) => k));
}

const label = list => list.map(w => (isAcronym(w.raw) ? w.raw : w.raw.toLowerCase())).join(' ');

// Ranked job terms: [{term, stems, kind, weight}], at most `limit`, highest weight first.
export function extractAtsTerms(jobDescriptionText, {limit = MAX_TERMS, organisationName = ''} = {}) {
  const lines = advertSections(jobDescriptionText).filter(l => l.weight > 0);
  const names = properNouns(lines);
  const orgInitials = String(organisationName || '').split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).map(w => w[0].toUpperCase()).join('');
  const terms = new Map();
  // Weight: the strongest line it appears in, plus a little for each repeat (capped), times a bonus for phrases and acronyms.
  const add = (key, entry, weight) => { const t = terms.get(key) || {...entry, best: 0, count: 0}; t.best = Math.max(t.best, weight); t.count++; terms.set(key, t); };
  const BONUS = {phrase: 2, acronym: 1.5, word: 1};
  const known = KNOWN_PHRASES.map(p => p.split(' ').map(stem));

  for (const line of lines) {
    const stripped = stripEligibility(line.text).replace(/\bprince\s*2\b/gi, 'PRINCE2').replace(/[‐‑‒–—-]/g, ' ');
    const list = words(stripped);
    const stems = list.map(w => stem(w.raw));
    const used = new Set();
    // Known phrases first ("design for manufacture" keeps its small word).
    for (const phrase of known) {
      for (let i = 0; i + phrase.length <= stems.length; i++) {
        if (phrase.every((s, k) => stems[i + k] === s)) {
          add('p:' + phrase.join(' '), {term: label(list.slice(i, i + phrase.length)), stems: phrase, kind: 'phrase'}, line.weight);
          for (let k = 0; k < phrase.length; k++) used.add(i + k);
        }
      }
    }
    const content = list.map((w, i) => ({...w, i, stem: stems[i], ok: (isAcronym(w.raw) || (w.raw.length >= 4 && !FILLER.has(w.raw.toLowerCase()))) && !names.has(w.raw.toLowerCase())}));
    // Two or three content words ending in a skill head word ("budget forecasting", "risk assessments").
    // Words separated only by a space; never across commas. Not overlapping a known phrase; first word not an action verb.
    for (let i = 0; i < content.length;) {
      let taken = 0;
      for (const size of [3, 2]) {
        const run = content.slice(i, i + size);
        if (run.length !== size || run.some(w => !w.ok || isAcronym(w.raw) || used.has(w.i))) continue;
        if (run.some((w, k) => k && stripped.slice(run[k - 1].index + run[k - 1].raw.length, w.index) !== ' ')) continue;
        if (/ing$/i.test(run[0].raw) || ACTION_STEMS.has(run[0].stem) || !HEAD_WORDS.has(run[size - 1].raw.toLowerCase())) continue;
        add('p:' + run.map(w => w.stem).join(' '), {term: label(run), stems: run.map(w => w.stem), kind: 'phrase'}, line.weight * 0.8);
        taken = size; break;
      }
      i += taken || 1;
    }
    for (const w of content) {
      if (!w.ok || used.has(w.i)) continue;
      if (isAcronym(w.raw)) {
        if (['UK', 'USA', 'EU'].includes(w.raw) || (orgInitials.length >= 2 && w.raw.startsWith(orgInitials.slice(0, 2)))) continue;
        add('a:' + w.raw.toLowerCase(), {term: w.raw, stems: [stem(w.raw)], kind: 'acronym'}, line.weight);
      } else add('w:' + w.stem, {term: w.raw.toLowerCase(), stems: [w.stem], kind: 'word'}, line.weight);
    }
  }
  for (const t of terms.values()) t.weight = t.best * Math.min(2, 1 + 0.25 * (t.count - 1)) * BONUS[t.kind];
  return [...terms.values()]
    .sort((a, b) => b.weight - a.weight || b.stems.length - a.stems.length || a.term.localeCompare(b.term))
    .slice(0, limit)
    .map(({term, stems, kind, weight}) => ({term, stems, kind, weight: Math.round(weight * 10) / 10}));
}

function cvStems(text) {
  return words(text).map(w => stem(w.raw));
}
function contains(sequence, set, stems) {
  if (stems.length === 1) return set.has(stems[0]);
  for (let i = 0; i + stems.length <= sequence.length; i++) if (stems.every((s, k) => sequence[i + k] === s)) return true;
  return false;
}

// Weighted match of ranked terms against CV text. Score is the weighted share of terms found.
// A phrase whose words all appear in the CV, but not together, counts half and is listed as partial (still missing).
export function matchAtsTerms(terms = [], text = '') {
  const sequence = cvStems(text), set = new Set(sequence);
  const matched = [], missing = [], partial = [];
  let have = 0, total = 0;
  for (const t of terms) {
    total += t.weight;
    if (contains(sequence, set, t.stems)) { matched.push(t.term); have += t.weight; continue; }
    missing.push(t.term);
    if (t.stems.length > 1 && t.stems.every(s => set.has(s))) { partial.push(t.term); have += t.weight / 2; }
  }
  return {total: terms.length, matched, missing, partial, score: total ? Math.round((have / total) * 100) : 0};
}

// Terms from a list that the text supports (used for "missing but evidenced elsewhere in your CV").
export function termsFoundIn(terms = [], text = '') {
  const sequence = cvStems(text), set = new Set(sequence);
  return terms.filter(t => contains(sequence, set, t.stems)).map(t => t.term);
}
