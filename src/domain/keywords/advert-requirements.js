// Advert requirements: what an advert actually asks for, as named skills, tools, certifications, methods, sectors and
// responsibilities, each Essential or Desirable, with the other ways people write the same thing.
// Pure domain code. The local reader uses a built-in vocabulary plus the ATS phrase extractor; an AI reading (made
// elsewhere, once per application) is checked here so that only terms the advert really contains are kept.
import {extractAtsTerms, stem} from '../ats/ats-engine.js';

export const REQUIREMENTS_VERSION = 'advert-requirements-v1';
export const MAX_REQUIREMENTS = 25;
export const CATEGORIES = Object.freeze(['certification', 'tool', 'method', 'skill', 'sector', 'responsibility', 'qualification']);
export const PRIORITIES = Object.freeze(['essential', 'desirable']);

// [name, category, other ways it is written]. Delivery, programme and transformation vocabulary.
const VOCABULARY = [
  // Certifications
  ['PRINCE2', 'certification', ['PRINCE2 Practitioner', 'PRINCE2 Foundation', 'PRINCE 2']],
  ['MSP', 'certification', ['Managing Successful Programmes']],
  ['PMP', 'certification', ['Project Management Professional']],
  ['APM PMQ', 'certification', ['PMQ', 'APM Project Management Qualification', 'APM qualification']],
  ['ChPP', 'certification', ['Chartered Project Professional']],
  ['SAFe', 'certification', ['Scaled Agile', 'Scaled Agile Framework', 'SAFe Agilist', 'SAFe POPM', 'SAFe RTE']],
  ['PSM', 'certification', ['Professional Scrum Master']],
  ['CSM', 'certification', ['Certified ScrumMaster', 'Certified Scrum Master']],
  ['ITIL', 'certification', ['ITIL 4', 'ITIL v3']],
  ['AgilePM', 'certification', ['DSDM', 'Agile Project Management qualification']],
  ['MoP', 'certification', ['Management of Portfolios']],
  ['P3O', 'certification', []],
  ['PgMP', 'certification', ['Program Management Professional']],
  ['CAPM', 'certification', []],
  ['PMI-ACP', 'certification', ['PMI Agile Certified Practitioner']],
  ['Lean Six Sigma', 'certification', ['Six Sigma', 'Green Belt', 'Black Belt']],
  ['ICAgile', 'certification', []],
  // Tools
  ['Jira', 'tool', ['JIRA', 'Jira Align']],
  ['Confluence', 'tool', []],
  ['Azure DevOps', 'tool', ['ADO', 'VSTS', 'TFS']],
  ['MS Project', 'tool', ['Microsoft Project', 'Project Online']],
  ['Smartsheet', 'tool', []],
  ['ServiceNow', 'tool', []],
  ['Power BI', 'tool', ['PowerBI']],
  ['Excel', 'tool', ['Microsoft Excel', 'MS Excel']],
  ['SharePoint', 'tool', []],
  ['Asana', 'tool', []],
  ['Trello', 'tool', []],
  ['Miro', 'tool', []],
  ['Primavera P6', 'tool', ['Primavera', 'P6']],
  ['Clarity PPM', 'tool', ['Clarity']],
  ['Salesforce', 'tool', []],
  ['SAP', 'tool', ['S/4HANA', 'S4HANA']],
  ['Workday', 'tool', []],
  ['Tableau', 'tool', []],
  ['AWS', 'tool', ['Amazon Web Services']],
  ['Microsoft Azure', 'tool', ['Azure']],
  ['Google Cloud', 'tool', ['GCP']],
  // Methods
  ['Agile', 'method', ['agile delivery', 'agile methodologies', 'agile methodology', 'agile ways of working', 'agile practices']],
  ['Scrum', 'method', ['Scrum ceremonies', 'sprint planning', 'sprints']],
  ['Kanban', 'method', []],
  ['Waterfall', 'method', ['traditional delivery']],
  ['Hybrid delivery', 'method', ['hybrid methodology', 'hybrid methodologies', 'hybrid project delivery', 'agile and waterfall']],
  ['Lean', 'method', ['lean principles']],
  ['DevOps', 'method', ['CI/CD', 'continuous delivery']],
  ['Design thinking', 'method', []],
  ['OKRs', 'method', ['OKR', 'objectives and key results']],
  ['GDS Service Standard', 'method', ['GDS', 'Service Standard', 'Government Digital Service', 'service assessments']],
  ['Stage gate', 'method', ['stage-gate', 'gated process', 'gateway reviews']],
  ['Earned value', 'method', ['earned value management', 'EVM']],
  ['Critical path', 'method', ['critical path analysis']],
  // Skills
  ['Stakeholder management', 'skill', ['stakeholder engagement', 'managing stakeholders', 'stakeholder relationships', 'senior stakeholders', 'stakeholders']],
  ['Risk management', 'skill', ['risks and issues', 'risk and issue management', 'managing risk', 'risk mitigation']],
  ['RAID logs', 'skill', ['RAID log', 'RAID', 'risks, assumptions, issues and dependencies']],
  ['Budget management', 'skill', ['budgets', 'budget', 'financial management', 'budget control', 'cost management', 'cost control', 'P&L', 'forecasting']],
  ['Change management', 'skill', ['organisational change', 'business change', 'change control']],
  ['Programme management', 'skill', ['programme delivery', 'program management', 'managing programmes']],
  ['Project management', 'skill', ['project delivery', 'managing projects']],
  ['Portfolio management', 'skill', ['portfolio governance', 'portfolio delivery']],
  ['Governance', 'skill', ['programme governance', 'project governance', 'steering committee', 'steering group', 'steerco']],
  ['Supplier management', 'skill', ['vendor management', 'third-party suppliers', 'third party suppliers', 'suppliers', 'vendors', 'contract management']],
  ['Digital transformation', 'skill', ['transformation programmes', 'transformation programme', 'business transformation', 'technology transformation']],
  ['Data migration', 'skill', ['migration programmes']],
  ['Business cases', 'skill', ['business case']],
  ['Benefits realisation', 'skill', ['benefits management', 'benefits tracking']],
  ['Resource planning', 'skill', ['resource management', 'capacity planning']],
  ['Requirements management', 'skill', ['requirements gathering', 'business requirements']],
  ['Release management', 'skill', ['release planning']],
  ['Team leadership', 'skill', ['line management', 'people management', 'leading teams', 'managing teams', 'leading multidisciplinary teams']],
  ['Continuous improvement', 'skill', ['process improvement']],
  ['Dependency management', 'skill', ['dependencies']],
  ['Cross-functional delivery', 'skill', ['cross-functional teams', 'cross functional teams', 'multidisciplinary teams', 'multi-disciplinary teams']],
  // Sectors
  ['Financial services', 'sector', ['banking', 'bank', 'insurance', 'fintech', 'capital markets', 'asset management', 'wealth management', 'payments']],
  ['Public sector', 'sector', ['government', 'central government', 'local government', 'civil service', 'public services']],
  ['Healthcare', 'sector', ['NHS', 'health and social care', 'life sciences']],
  ['Defence', 'sector', ['MOD', 'Ministry of Defence', 'defense']],
  ['Energy and utilities', 'sector', ['energy', 'utilities', 'oil and gas', 'renewables']],
  ['Telecommunications', 'sector', ['telecoms', 'telco']],
  ['Retail', 'sector', ['ecommerce', 'e-commerce']],
  ['Higher education', 'sector', ['university', 'universities']],
  ['Pharmaceuticals', 'sector', ['pharma', 'pharmaceutical']],
  ['Transport', 'sector', ['rail', 'aviation']],
  ['Charity', 'sector', ['not-for-profit', 'not for profit', 'third sector', 'non-profit']],
  ['Manufacturing', 'sector', []]
];

// Working arrangements and advert filler: never requirements.
const NOISE = new Set(['hybrid', 'remote', 'week', 'weeks', 'day', 'days', 'office', 'offices', 'onsite', 'on site', 'location', 'salary',
  'benefits', 'bonus', 'pension', 'holiday', 'holidays', 'permanent', 'contract', 'temporary', 'flexible', 'hours', 'annum', 'package',
  'london', 'manchester', 'uk', 'united kingdom', 'hiring', 'candidate', 'opportunity', 'role', 'team', 'teams', 'experience', 'work',
  'working', 'hybrid working', 'flexible working', 'remote working', 'full time', 'part time', 'logs', 'services', 'sector', 'public',
  'financial', 'certification', 'certifications', 'qualification', 'qualifications', 'essential', 'desirable']);
export const isNoiseTerm = term => NOISE.has(String(term || '').trim().toLowerCase());

// --- Matching ------------------------------------------------------------------------------------------------------
function tokens(text) {
  const out = [];
  const normalised = String(text || '').replace(/\bprince\s*2\b/gi, 'PRINCE2').replace(/[‐‑‒–—\-/]/g, ' ');
  for (const m of normalised.matchAll(/[A-Za-z][A-Za-z0-9+&’']*/g)) out.push(m[0].replace(/[’']s$/, ''));
  return out;
}
// Short capitals (MSP, SAP, NHS) and mixed-case names (SAFe) only match as written, so "sap" or "safe" never count.
const exactCase = word => /^[A-Z][A-Z0-9&]{1,5}$/.test(word) || /^[A-Z][a-z]*[A-Z]/.test(word);
export function compileVariant(text) {
  const list = tokens(text);
  return list.length ? {text: String(text).trim(), stems: list.map(w => stem(w)), exact: list.map(w => exactCase(w) ? w : null)} : null;
}
export function textIndex(text) {
  const list = tokens(text);
  return {raw: list, stems: list.map(w => stem(w))};
}
function variantAt(index, v, i) {
  return v.stems.every((s, k) => index.stems[i + k] === s && (!v.exact[k] || index.raw[i + k] === v.exact[k]));
}
export function variantIn(index, v) {
  if (!v) return false;
  for (let i = 0; i + v.stems.length <= index.stems.length; i++) if (variantAt(index, v, i)) return true;
  return false;
}
// The first way of writing a requirement that the text uses, or null.
export function findRequirement(requirement, index) {
  for (const text of [requirement.term, ...(requirement.aliases || [])]) {
    const v = compileVariant(text);
    if (v && variantIn(index, v)) return v;
  }
  return null;
}
// Every place in the text where the requirement appears, as [start, end) word positions.
export function requirementSpans(requirement, index) {
  const spans = [];
  for (const text of [requirement.term, ...(requirement.aliases || [])]) {
    const v = compileVariant(text);
    if (!v) continue;
    for (let i = 0; i + v.stems.length <= index.stems.length; i++) if (variantAt(index, v, i)) spans.push([i, i + v.stems.length]);
  }
  return spans;
}
// "Azure" and "DevOps" are not separate requirements when the advert only says "Azure DevOps".
export function dropContained(list, index) {
  const spans = list.map(r => requirementSpans(r, index));
  return list.filter((r, a) => !spans[a].length || !spans[a].every(([s, e]) => spans.some((other, b) => b !== a &&
    other.some(([os, oe]) => os <= s && e <= oe && oe - os > e - s))));
}

// --- Priority: Essential unless the advert only mentions it as desirable --------------------------------------------
const DESIRABLE = /\b(desirable|nice to have|nice-to-have|ideally|preferred|preferable|advantageous|an advantage|a plus|bonus points?)\b/i;
const ESSENTIAL = /\b(essential|must|required|requirements?|mandatory|what you('|’)?ll need|you will have|about you|you have)\b/i;
export function advertSegments(text) {
  const segments = [];
  let mode = 'essential';
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  for (const line of lines) {
    // "Essential: ..., Desirable: ..." on one line is split so each part keeps its label.
    for (const part of line.split(/(?=\b(?:Essential|Desirable|Nice to have|Preferred|Required|Bonus)\s*(?:skills|experience|criteria)?\s*[:–-])/i)) {
      const t = part.replace(/^[\s*•●▪-]+/, '').trim();
      if (!t) continue;
      const heading = t.length <= 60 && !/[.;]$/.test(t);
      if (DESIRABLE.test(t.slice(0, 40))) { if (heading && t.length < 40) { mode = 'desirable'; continue; } segments.push({text: t, priority: 'desirable'}); continue; }
      if (ESSENTIAL.test(t.slice(0, 40)) && heading && t.length < 40) { mode = 'essential'; continue; }
      if (heading && /^(responsibilities|key responsibilities|the role|what you('|’)?ll be doing|duties)\b/i.test(t)) { mode = 'essential'; continue; }
      segments.push({text: t, priority: DESIRABLE.test(t) ? 'desirable' : ESSENTIAL.test(t) ? 'essential' : mode});
    }
  }
  return segments.map(s => ({...s, index: textIndex(s.text)}));
}
function priorityIn(segments, requirement) {
  let seen = false;
  for (const s of segments) if (findRequirement(requirement, s.index)) { if (s.priority === 'essential') return {priority: 'essential', mentions: true}; seen = true; }
  return seen ? {priority: 'desirable', mentions: true} : {priority: null, mentions: false};
}

// --- Cleaning ------------------------------------------------------------------------------------------------------
const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const vocabularyEntry = term => {
  const index = textIndex(term);
  if (!index.stems.length) return null;
  const whole = text => { const c = compileVariant(text); return c && c.stems.length === index.stems.length && variantAt(index, c, 0); };
  return VOCABULARY.find(([name, , aliases]) => [name, ...aliases].some(whole)) || null;
};
// Merges the same requirement written two ways, adds the built-in other spellings, keeps only terms in the advert.
export function normaliseRequirements(list, jobDescriptionText, {source = 'ai'} = {}) {
  const segments = advertSegments(jobDescriptionText);
  const advert = textIndex(jobDescriptionText);
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    let term = clean(raw?.term, 60);
    if (!term || term.length < 2 || isNoiseTerm(term)) continue;
    const known = vocabularyEntry(term);
    let aliases = (Array.isArray(raw?.aliases) ? raw.aliases : []).map(a => clean(a, 60)).filter(a => a && !isNoiseTerm(a));
    let category = CATEGORIES.includes(raw?.category) ? raw.category : 'skill';
    if (known) { aliases = [...new Set([...(term === known[0] ? [] : [term]), ...aliases, ...known[2]])]; term = known[0]; category = known[1]; }
    aliases = [...new Set(aliases.filter(a => a.toLowerCase() !== term.toLowerCase()))].slice(0, 12);
    const requirement = {term, category, aliases};
    if (!findRequirement(requirement, advert)) continue; // never keep a term the advert does not contain
    const existing = out.find(r => r.term.toLowerCase() === term.toLowerCase());
    const found = priorityIn(segments, requirement);
    const priority = found.priority || (PRIORITIES.includes(raw?.priority) ? raw.priority : 'essential');
    if (existing) { existing.aliases = [...new Set([...existing.aliases, ...aliases])].slice(0, 12); if (priority === 'essential') existing.priority = 'essential'; continue; }
    out.push({...requirement, priority, source});
  }
  return rankRequirements(dropContained(out, advert)).slice(0, MAX_REQUIREMENTS);
}
const CATEGORY_ORDER = Object.fromEntries(CATEGORIES.map((c, i) => [c, i]));
export function rankRequirements(list) {
  return [...list].sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'essential' ? -1 : 1) || CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]);
}

const JOB_TITLE = /\b(manager|director|lead|officer|head|consultant|analyst|owner|specialist)$/i;
// --- Local reading (free; also the fallback when the AI reading is unavailable) -------------------------------------
export function localAdvertRequirements(jobDescriptionText, {organisationName = ''} = {}) {
  const advert = textIndex(jobDescriptionText);
  const found = [];
  for (const [name, category, aliases] of VOCABULARY) {
    const requirement = {term: name, category, aliases};
    if (findRequirement(requirement, advert)) found.push(requirement);
  }
  // Skill phrases and acronyms the vocabulary does not know ("budget forecasting", "CMDB"). Single words are too vague.
  for (const t of extractAtsTerms(String(jobDescriptionText || ''), {limit: 40, organisationName})) {
    if (t.kind === 'word' || isNoiseTerm(t.term) || JOB_TITLE.test(t.term)) continue;
    if (found.some(r => findRequirement(r, textIndex(t.term)))) continue;
    found.push({term: t.kind === 'acronym' ? t.term : t.term.charAt(0).toUpperCase() + t.term.slice(1), category: 'skill', aliases: []});
  }
  return normaliseRequirements(found, jobDescriptionText, {source: 'local'});
}
