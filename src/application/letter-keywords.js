// Letter keyword check: what the advert asks for (read once per application by AI when available, otherwise by the
// built-in reader) against the letter and your evidence. Every requirement lands in one group:
//   in the letter · missing but backed by your evidence (with the line and where it fits) · missing with no evidence
//   (Essential: add only if true) · not worth adding (Desirable with no evidence).
// Matching, evidence and highlighting are free and local. The AI reading is one paid request per advert, saved, and a
// failed reading is never retried automatically.
import {createHash} from 'node:crypto';
import {localAdvertRequirements, normaliseRequirements, textIndex, findRequirement, compileVariant} from '../domain/keywords/advert-requirements.js';

export const PRIORITY_KEYWORD_LIMIT = 5;
const FITS = {certification: 'the strong-fit paragraph', tool: 'the strong-fit paragraph', method: 'the strong-fit paragraph',
  qualification: 'the strong-fit paragraph', sector: 'the opening or the employer paragraph', skill: 'an evidence bullet', responsibility: 'an evidence bullet'};

export function keywordReport({requirements = [], letterText = '', evidence = [], source = 'local'}) {
  const letter = textIndex(letterText);
  const lines = (Array.isArray(evidence) ? evidence : []).filter(e => e && e.text).map(e => ({...e, index: textIndex(e.text)}));
  const terms = requirements.map(r => {
    const used = findRequirement(r, letter);
    const line = used ? null : lines.find(e => findRequirement(r, e.index));
    const shown = used || compileVariant(r.term);
    return {term: r.term, category: r.category, priority: r.priority, aliases: r.aliases || [], inLetter: Boolean(used),
      writtenAs: used ? used.text : null, stems: shown ? shown.stems : [],
      supported: Boolean(used || line), evidence: line ? {text: String(line.text), source: String(line.source || '')} : null,
      fits: !used && line ? FITS[r.category] || 'an evidence bullet' : null};
  });
  const groups = {
    inLetter: terms.filter(t => t.inLetter),
    missingBacked: terms.filter(t => !t.inLetter && t.evidence),
    missingUnbacked: terms.filter(t => !t.inLetter && !t.evidence && t.priority === 'essential'),
    lowValue: terms.filter(t => !t.inLetter && !t.evidence && t.priority !== 'essential')
  };
  const essential = terms.filter(t => t.priority === 'essential');
  const nextSteps = [
    ...groups.missingBacked.filter(t => t.priority === 'essential').slice(0, 3).map(t => `Add ${t.term} (Essential) to ${t.fits}: your evidence backs it.`),
    ...groups.missingBacked.filter(t => t.priority !== 'essential').slice(0, 1).map(t => `If there is room, add ${t.term} (Desirable) to ${t.fits}.`)
  ];
  if (!nextSteps.length && groups.missingUnbacked.length) nextSteps.push(`${groups.missingUnbacked.length} Essential term${groups.missingUnbacked.length === 1 ? ' is' : 's are'} not in your evidence: add only what is true.`);
  return {source, summary: {total: terms.length, inLetter: groups.inLetter.length, essentialTotal: essential.length, essentialInLetter: essential.filter(t => t.inLetter).length},
    nextSteps, groups, terms};
}

// Missing Essential requirements your evidence backs, for the polishing prompt ("include only if true, never stuffed").
export function priorityKeywordsFrom(report, limit = PRIORITY_KEYWORD_LIMIT) {
  return report.groups.missingBacked.filter(t => t.priority === 'essential').slice(0, limit).map(t => ({term: t.term, evidence: t.evidence.text.slice(0, 400)}));
}

const advertHash = text => createHash('sha256').update(String(text)).digest('hex').slice(0, 24);

export function createLetterKeywordService({reviews, evidence = async () => [], reader = null, store = null}) {
  const inFlight = new Map();
  function local(review, note) {
    return {requirements: localAdvertRequirements(review.formData?.jobDescriptionText || '', {organisationName: review.formData?.organisationName || ''}), source: 'local', note};
  }
  // allowPaid false: use a saved AI reading if there is one, otherwise the built-in reading (never a paid request).
  async function requirementsFor(reviewId, review, {allowPaid = true} = {}) {
    const jd = String(review.formData?.jobDescriptionText || '');
    const hash = advertHash(jd);
    let saved = null; try { saved = store?.get(reviewId) || null; } catch {}
    if (saved?.advertHash === hash) {
      if (saved.source === 'ai') {
        const requirements = normaliseRequirements(saved.requirements, jd, {source: 'ai'});
        if (requirements.length) return {requirements, source: 'ai', note: ''};
      }
      return local(review, 'The AI reading of this advert did not work earlier, so the built-in reading is used. It is not retried automatically.');
    }
    if (!reader?.available || !store) return local(review, reader?.available ? '' : 'AI reading of adverts is off, so the built-in reading is used.');
    if (!allowPaid) return local(review, 'The advert has not been read by AI yet; click Keywords to read it (one small paid request).');
    if (!inFlight.has(reviewId)) inFlight.set(reviewId, (async () => {
      try {
        const out = await reader.read({jobTitle: review.formData?.jobTitle || '', organisationName: review.formData?.organisationName || '', jobDescriptionText: jd});
        const requirements = normaliseRequirements(out.requirements, jd, {source: 'ai'});
        try { store.set(reviewId, requirements.length ? {advertHash: hash, source: 'ai', model: out.model, requirements} : {advertHash: hash, source: 'failed', error: 'ADVERT_EMPTY'}); } catch {}
        return requirements.length ? {requirements, source: 'ai', note: ''} : local(review, 'The AI reading found nothing usable, so the built-in reading is used.');
      } catch (error) {
        try { store.set(reviewId, {advertHash: hash, source: 'failed', error: String(error.code || 'ADVERT_FAILED')}); } catch {}
        return local(review, 'The AI reading did not work (' + (error.message || 'unknown error') + '), so the built-in reading is used. It is not retried automatically.');
      } finally { inFlight.delete(reviewId); }
    })());
    return inFlight.get(reviewId);
  }
  function reviewFor(reviewId) {
    const r = reviews.get(reviewId);
    if (!r) throw Object.assign(new Error('Saved application not found.'), {statusCode: 404});
    if (!String(r.formData?.jobDescriptionText || '').trim()) throw Object.assign(new Error('This application has no job description to take keywords from.'), {statusCode: 409});
    return r;
  }
  return {
    requirementsFor,
    async check(reviewId, body = {}) {
      const text = String(body.letterText ?? '');
      if (text.length > 40000) throw Object.assign(new Error('The letter is too long to check.'), {statusCode: 413});
      const r = reviewFor(reviewId);
      const reading = await requirementsFor(reviewId, r, {allowPaid: true});
      return {...keywordReport({requirements: reading.requirements, letterText: text, evidence: await evidence(reviewId), source: reading.source}), note: reading.note};
    },
    // For polishing: never fails the polish; an empty list when anything is missing.
    async priorityKeywords(reviewId, letterText, {allowPaid = false} = {}) {
      try {
        const r = reviewFor(reviewId);
        const reading = await requirementsFor(reviewId, r, {allowPaid});
        return priorityKeywordsFrom(keywordReport({requirements: reading.requirements, letterText, evidence: await evidence(reviewId), source: reading.source}));
      } catch { return []; }
    }
  };
}
