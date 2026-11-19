// Portal application questions: exact limits, an evidence-only draft and checks. Pure.
import {normalize, overlap, unique, tokenize} from '../shared/text-normalization.js';
import {figuresIn} from '../cv/cv-tailoring-policy.js';

export const UNITS = Object.freeze(['words', 'characters']);
export const LIMITS = Object.freeze({words: {min: 10, max: 2000}, characters: {min: 50, max: 10000}});
const STOP = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'describe', 'do', 'does', 'example', 'for', 'from', 'give', 'have', 'how', 'in', 'is', 'it', 'me', 'of', 'on', 'or', 'our',
  'please', 'tell', 'that', 'the', 'this', 'to', 'us', 'was', 'were', 'what', 'when', 'where', 'which', 'why', 'with', 'would', 'you', 'your', 'about', 'using', 'words', 'characters', 'maximum', 'max', 'limit']);

const fail = message => { throw Object.assign(new Error(message), {statusCode: 400, code: 'QUESTION_INVALID'}); };
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();

// Words as portals count them (anything between spaces); characters include spaces, as most portals do.
export const countWords = text => (String(text || '').trim().match(/\S+/g) || []).length;
export const countCharacters = text => String(text || '').replace(/\r\n/g, '\n').trim().length;
export const count = (text, unit) => unit === 'characters' ? countCharacters(text) : countWords(text);

export function validateQuestion({question, unit = 'words', limit} = {}) {
  const q = clean(question);
  if (q.length < 5) fail('Paste the question from the application form.');
  if (q.length > 1500) fail('The question is longer than 1,500 characters.');
  if (!UNITS.includes(unit)) fail('Choose words or characters.');
  const n = Number(limit), range = LIMITS[unit];
  if (!Number.isInteger(n) || n < range.min || n > range.max) fail(`Set a limit between ${range.min} and ${range.max} ${unit}.`);
  return {question: q, unit, limit: n};
}

export const questionTerms = question => unique(tokenize(question).map(t => t.replace(/[^a-z0-9+#.-]/g, '')).filter(t => t.length > 2 && !STOP.has(t)));

const sentence = text => { const t = clean(text).replace(/^[-•*]\s*/, ''); return /[.!?]$/.test(t) ? t : t + '.'; };

// Ranks evidence for the question and fills the limit with whole sentences. Never writes a new claim.
export function draftAnswer({question, evidence = [], keywords = [], unit = 'words', limit = 250}) {
  const terms = questionTerms(question), jd = unique(keywords.map(normalize).filter(Boolean)).slice(0, 30);
  const seen = new Set();
  const ranked = evidence.map((e, order) => ({...e, text: sentence(e.text), order}))
    .filter(e => e.text.length > 1 && !seen.has(normalize(e.text)) && seen.add(normalize(e.text)))
    .map(e => { const q = overlap(terms, e.text), k = overlap(jd, e.text); return {...e, matched: q, score: q.length * 2 + k.length}; })
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const used = [], anyMatch = ranked.some(e => e.score > 0);
  let answer = '';
  for (const e of ranked) {
    // Unrelated lines are used only when nothing in the evidence matches the question at all.
    if (anyMatch && e.score === 0) break;
    const next = answer ? answer + ' ' + e.text : e.text;
    if (count(next, unit) > limit) continue;
    answer = next; used.push(e);
  }
  return {answer, used: used.map(({text, source, matched}) => ({text, source, matched})), unused: ranked.filter(e => !used.includes(e)).slice(0, 10).map(({text, source}) => ({text, source}))};
}

// Checks an answer before you copy it: the limit, and figures that are not in the evidence.
export function checkAnswer({answer, unit = 'words', limit = 250, evidence = []}) {
  const used = count(answer, unit);
  const known = new Set(figuresIn(evidence.map(e => e.text || e).join('\n')).flatMap(f => [f, f.replace(/^[£$€]/, '')]));
  const unsupported = figuresIn(answer).filter(f => !known.has(f));
  return {count: used, limit, unit, within: used <= limit, remaining: limit - used, unsupportedFigures: unsupported};
}

// Shortens to the limit at a sentence boundary, only when you ask for it.
export function trimToLimit(answer, unit, limit) {
  const sentences = String(answer || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [];
  let out = '';
  for (const s of sentences) { const next = (out + ' ' + s.trim()).trim(); if (count(next, unit) > limit) break; out = next; }
  return out;
}
