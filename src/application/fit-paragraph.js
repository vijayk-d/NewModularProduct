// "Why I am a strong fit" paragraph: one short paragraph for this role from your own evidence only:
// the advert's key terms your evidence supports, certifications and years stated in your selected CV, and your two
// evidence lines that match the advert best. The draft is free and local; polishing it with AI uses the
// Application questions writer (estimate first, one paid request).
import {extractAtsTerms, termsFoundIn} from '../domain/ats/ats-engine.js';
import {KEYWORD_FILLER} from './letter-keywords.js';

export const FIT_WORD_LIMIT = 120;
export const FIT_QUESTION = 'Write one paragraph for my cover letter on why I am a strong fit for this role: my most relevant experience, any certifications listed in my evidence, and the key requirements of the advert that my evidence shows I meet. One paragraph, no heading.';

const list = items => items.length <= 1 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items.at(-1);
// CV bullets often start with a past-tense verb ("Introduced …"): give them a subject so the paragraph reads as prose.
const sentence = text => {
  let t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  if (/^(?:[A-Z][a-z]+ed|Led|Built|Ran|Won|Drove|Grew|Set|Cut|Took|Made|Wrote|Brought|Taught|Oversaw)\b/.test(t)) t = 'I ' + t[0].toLowerCase() + t.slice(1);
  return /[.!?]$/.test(t) ? t : t + '.';
};

export function draftFitParagraph({jobTitle = '', organisationName = '', jobDescriptionText = '', evidence = []}) {
  const lines = (Array.isArray(evidence) ? evidence : []).filter(e => e && e.text);
  const facts = lines.filter(e => e.source === 'Selected CV'), stories = lines.filter(e => e.source !== 'Selected CV');
  const certifications = facts.find(f => f.kind === 'certifications')?.items || [];
  const years = facts.find(f => f.kind === 'years')?.value || '';
  const terms = extractAtsTerms(String(jobDescriptionText || ''), {limit: 30, organisationName}).filter(t => !(t.kind === 'word' && KEYWORD_FILLER.has(t.term.toLowerCase())));
  const supported = new Set(termsFoundIn(terms, stories.map(e => e.text).join('\n')));
  const named = terms.filter(t => supported.has(t.term) && t.kind !== 'word').slice(0, 3).map(t => t.term);
  const ranked = stories.map((e, i) => ({e, i, hits: termsFoundIn(terms, e.text).length})).sort((a, b) => b.hits - a.hits || a.i - b.i);
  const chosen = (ranked.some(r => r.hits) ? ranked.filter(r => r.hits) : ranked).slice(0, 2).map(r => r.e);
  const role = String(jobTitle || '').trim(), org = String(organisationName || '').trim();
  const opening = `I am a strong fit for ${role ? `this ${role} role` : 'this role'}${org ? ` at ${org}` : ''}: `
    + (years ? `I bring ${years} of experience` : 'I bring hands-on experience') + (named.length ? ` in ${list(named)}` : '')
    + (certifications.length ? `, and I hold ${list(certifications)}` : '') + '.';
  const paragraph = [opening, ...chosen.map(e => sentence(e.text))].join(' ');
  return {paragraph, used: {terms: named, certifications, years, evidence: chosen.map(e => ({text: e.text, source: e.source}))}};
}

export function createFitParagraphService({reviews, evidence = async () => []}) {
  return {
    async draft(reviewId) {
      const r = reviews.get(reviewId);
      if (!r) throw Object.assign(new Error('Saved application not found.'), {statusCode: 404});
      const ev = await evidence(reviewId);
      if (!ev.length) throw Object.assign(new Error('No evidence yet: select achievements, build a tailored CV or choose approved scenarios first.'), {statusCode: 409});
      const f = r.formData || {};
      return {...draftFitParagraph({jobTitle: f.jobTitle, organisationName: f.organisationName, jobDescriptionText: f.jobDescriptionText, evidence: ev}), aiQuestion: FIT_QUESTION, aiLimit: FIT_WORD_LIMIT};
    }
  };
}
