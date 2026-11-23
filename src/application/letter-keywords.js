// Letter keyword check: which of the advert's key terms (the same ATS terms as the ATS score) the letter already uses,
// and, for the missing ones, whether your evidence supports them, with the evidence line to draw on. Free and local.
import {extractAtsTerms, matchAtsTerms, termsFoundIn} from '../domain/ats/ats-engine.js';

export const KEYWORD_LIMIT = 20;
// Advert filler the ATS extractor can return as single words; not worth highlighting or adding to a letter.
export const KEYWORD_FILLER = new Set(['hiring', 'desirable', 'essential', 'candidate', 'candidates', 'successful', 'opportunity', 'required', 'preferred', 'ideal', 'ideally', 'looking', 'join', 'apply', 'salary', 'benefits', 'experience', 'team', 'teams', 'work', 'working', 'role', 'responsibilities']);

export function letterKeywordCoverage({jobDescriptionText = '', organisationName = '', letterText = '', evidence = []}) {
  const terms = extractAtsTerms(String(jobDescriptionText || ''), {limit: KEYWORD_LIMIT + 10, organisationName}).filter(t => !(t.kind === 'word' && KEYWORD_FILLER.has(t.term.toLowerCase()))).slice(0, KEYWORD_LIMIT);
  const match = matchAtsTerms(terms, String(letterText || ''));
  const inLetter = new Set(match.matched), partial = new Set(match.partial);
  const lines = (Array.isArray(evidence) ? evidence : []).filter(e => e && e.text);
  return {
    score: match.score,
    terms: terms.map(t => {
      const found = inLetter.has(t.term);
      const line = found ? null : lines.find(e => termsFoundIn([t], e.text).length);
      return {term: t.term, stems: t.stems, kind: t.kind, inLetter: found, partial: !found && partial.has(t.term), supported: found || Boolean(line),
        evidence: line ? {text: String(line.text), source: String(line.source || '')} : null};
    })
  };
}

export function createLetterKeywordService({reviews, evidence = async () => []}) {
  return {
    async check(reviewId, body = {}) {
      const r = reviews.get(reviewId);
      if (!r) throw Object.assign(new Error('Saved application not found.'), {statusCode: 404});
      const text = String(body.letterText ?? '');
      if (text.length > 40000) throw Object.assign(new Error('The letter is too long to check.'), {statusCode: 413});
      const jd = String(r.formData?.jobDescriptionText || '');
      if (!jd.trim()) throw Object.assign(new Error('This application has no job description to take keywords from.'), {statusCode: 409});
      return letterKeywordCoverage({jobDescriptionText: jd, organisationName: r.formData?.organisationName || '', letterText: text, evidence: await evidence(reviewId)});
    }
  };
}
