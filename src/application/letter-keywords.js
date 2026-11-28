// Letter keyword check: what the advert asks for (read once per application by AI when available, otherwise by the
// built-in reader) against the letter and your evidence. Every requirement lands in one group:
//   in the letter · missing but backed by your evidence (with the line and where it fits) · missing with no evidence
//   (Essential: add only if true) · not worth adding (Desirable with no evidence).
// Matching, evidence and highlighting are free and local. The AI reading is one paid request per advert, saved, and a
// failed reading is never retried automatically.
import {createHash} from 'node:crypto';
import {localAdvertRequirements, normaliseRequirements, textIndex, findRequirement, compileVariant, relatedFor} from '../domain/keywords/advert-requirements.js';
import {cvEvidenceLines} from '../domain/cv/cv-facts.js';

export const PRIORITY_KEYWORD_LIMIT = 5;
const FITS = {eligibility: 'the closing paragraph', certification: 'the strong-fit paragraph', tool: 'the strong-fit paragraph', method: 'the strong-fit paragraph',
  qualification: 'the strong-fit paragraph', sector: 'the opening or the employer paragraph', skill: 'an evidence bullet', responsibility: 'an evidence bullet'};

// Claims a letter should only make when your CV or evidence shows them.
const CLAIM = new Set(['certification', 'sector', 'eligibility', 'qualification']);
const LETTER_FACING = c => c !== 'eligibility';

export function keywordReport({requirements = [], letterText = '', evidence = [], source = 'local'}) {
  const letter = textIndex(letterText);
  const lines = (Array.isArray(evidence) ? evidence : []).filter(e => e && e.text).map(e => ({...e, index: textIndex(e.text)}));
  const lineFor = r => lines.find(e => findRequirement(r, e.index)) || null;
  const asEvidence = line => line ? {text: String(line.text), source: String(line.source || '')} : null;
  const terms = requirements.map(r => {
    const base = {term: r.term, category: r.category, priority: r.priority, aliases: r.aliases || [], ...(r.guessed ? {guessed: true} : {})};
    const used = findRequirement(r, letter), direct = lineFor(r);
    const related = relatedFor(r.term);
    // The advert's own words in the letter.
    if (used) return {...base, inLetter: true, writtenAs: used.text, stems: used.stems, supported: true, evidence: asEvidence(direct), fits: null,
      unbackedClaim: CLAIM.has(r.category) && !direct};
    // An equivalent credential you hold, already named in the letter (PRINCE2 for PMP).
    for (const rel of related.filter(x => x.relation === 'equivalent')) {
      const inText = findRequirement(rel, letter), line = lineFor(rel);
      if (inText && line) return {...base, inLetter: true, writtenAs: inText.text, stems: inText.stems, supported: true, evidence: asEvidence(line), fits: null,
        via: {term: rel.term, relation: 'equivalent'}};
    }
    const shown = compileVariant(r.term);
    const missing = {...base, inLetter: false, writtenAs: null, stems: shown ? shown.stems : []};
    if (direct) return {...missing, supported: true, evidence: asEvidence(direct), fits: FITS[r.category] || 'an evidence bullet'};
    // Not in your words, but something related in your CV or evidence backs it.
    for (const rel of related) {
      const line = lineFor(rel);
      if (line) return {...missing, supported: true, evidence: asEvidence(line), fits: FITS[r.category] || 'an evidence bullet', via: {term: rel.term, relation: rel.relation}};
    }
    return {...missing, supported: false, evidence: null, fits: null};
  });
  const groups = {
    inLetter: terms.filter(t => t.inLetter),
    missingBacked: terms.filter(t => !t.inLetter && t.evidence),
    missingUnbacked: terms.filter(t => !t.inLetter && !t.evidence && t.priority === 'essential'),
    lowValue: terms.filter(t => !t.inLetter && !t.evidence && t.priority !== 'essential')
  };
  const essential = terms.filter(t => t.priority === 'essential');
  const label = t => `${t.term} (${t.priority === 'essential' ? 'Essential' : 'Desirable'})`;
  const step = t => t.via?.relation === 'equivalent'
    ? `${label(t)}: you hold ${t.via.term}, not ${t.term}. Name ${t.via.term} as your equivalent in ${t.fits}; never claim ${t.term}.`
    : t.via ? `Add ${label(t)} to ${t.fits}: your evidence shows it through ${t.via.term}.`
    : t.priority === 'essential' ? `Add ${label(t)} to ${t.fits}: your evidence backs it.` : `If there is room, add ${label(t)} to ${t.fits}.`;
  const eligibility = terms.filter(t => t.category === 'eligibility');
  const nextSteps = [
    // Eligibility first: it decides whether the application can succeed at all.
    ...eligibility.filter(t => t.evidence && !t.inLetter).map(t => `${t.term}: the advert asks for it. ${t.evidence.source}: “${t.evidence.text}” State this in ${t.fits}.`),
    ...eligibility.filter(t => !t.evidence && t.priority === 'essential').map(t => `${t.term} is required, and your CV and evidence do not mention it. Check you are eligible before applying.`),
    // Claims in the letter that nothing you supplied shows.
    ...terms.filter(t => t.unbackedClaim && LETTER_FACING(t.category)).slice(0, 3).map(t => `Check: the letter mentions ${t.term}, but your CV and evidence do not show it. Keep it only if it is true for you (naming the employer's own sector is fine).`),
    ...groups.missingBacked.filter(t => t.priority === 'essential' && LETTER_FACING(t.category)).slice(0, 3).map(step),
    ...groups.missingBacked.filter(t => t.priority !== 'essential' && LETTER_FACING(t.category)).slice(0, 2).map(step)
  ];
  if (!nextSteps.length && groups.missingUnbacked.length) nextSteps.push(`${groups.missingUnbacked.length} Essential term${groups.missingUnbacked.length === 1 ? ' is' : 's are'} not in your evidence: add only what is true.`);
  return {source, summary: {total: terms.length, inLetter: groups.inLetter.length, essentialTotal: essential.length, essentialInLetter: essential.filter(t => t.inLetter).length,
    unbackedClaims: terms.filter(t => t.unbackedClaim).length},
    nextSteps, groups, terms};
}

// Missing Essential requirements your evidence backs, for the polishing prompt ("include only if true, never stuffed").
// An equivalent credential is passed as yours (PRINCE2), never as the one the advert asks for (PMP).
export function priorityKeywordsFrom(report, limit = PRIORITY_KEYWORD_LIMIT) {
  return report.groups.missingBacked.filter(t => t.priority === 'essential').slice(0, limit).map(t => ({
    term: t.via?.relation === 'equivalent' ? `${t.via.term} (your equivalent of the ${t.term} the advert asks for; never claim ${t.term})`
      : t.category === 'eligibility' ? `${t.term}, stated exactly as in the evidence line` : t.term,
    evidence: t.evidence.text.slice(0, 400)}));
}

const advertHash = text => createHash('sha256').update(String(text)).digest('hex').slice(0, 24);

// cvText(reviewId): the selected CV's own text, read line by line as further evidence after your curated lines.
export function createLetterKeywordService({reviews, evidence = async () => [], cvText = async () => '', reader = null, store = null, activity = null}) {
  const inFlight = new Map();
  function local(review, note) {
    return {requirements: localAdvertRequirements(review.formData?.jobDescriptionText || '', {organisationName: review.formData?.organisationName || ''}), source: 'local', note};
  }
  // allowPaid false: use a saved AI reading if there is one, otherwise the built-in reading (never a paid request).
  // readAgain: you asked to read the advert with AI again after an earlier reading failed (one paid request, never automatic).
  async function requirementsFor(reviewId, review, {allowPaid = true, readAgain = false} = {}) {
    const jd = String(review.formData?.jobDescriptionText || '');
    const hash = advertHash(jd);
    let saved = null; try { saved = store?.get(reviewId) || null; } catch {}
    const retry = readAgain && allowPaid && saved?.source === 'failed' && reader?.available && store;
    if (saved?.advertHash === hash && !retry) {
      if (saved.source === 'ai') {
        const requirements = normaliseRequirements(saved.requirements, jd, {source: 'ai'});
        if (requirements.length) return {requirements, source: 'ai', note: ''};
      }
      return {...local(review, 'The AI reading of this advert did not work earlier, so the built-in reading is used. It is not retried automatically.'), canReadAgain: Boolean(reader?.available && store)};
    }
    if (!reader?.available || !store) return local(review, reader?.available ? '' : 'AI reading of adverts is off, so the built-in reading is used.');
    if (!allowPaid) return local(review, 'The advert has not been read by AI yet; click Keywords to read it (one small paid request).');
    if (!inFlight.has(reviewId)) inFlight.set(reviewId, (async () => {
      let activityId = null; try { activityId = activity?.start({kind: 'keywords', reviewId}) || null; } catch {}
      try {
        const out = await reader.read({jobTitle: review.formData?.jobTitle || '', organisationName: review.formData?.organisationName || '', jobDescriptionText: jd});
        const requirements = normaliseRequirements(out.requirements, jd, {source: 'ai'});
        try { store.set(reviewId, requirements.length ? {advertHash: hash, source: 'ai', model: out.model, requirements} : {advertHash: hash, source: 'failed', error: 'ADVERT_EMPTY'}); } catch {}
        try { if (requirements.length) activity?.finish(activityId); else activity?.fail(activityId, 'The AI reading found nothing usable.'); } catch {}
        return requirements.length ? {requirements, source: 'ai', note: ''} : local(review, 'The AI reading found nothing usable, so the built-in reading is used.');
      } catch (error) {
        try { store.set(reviewId, {advertHash: hash, source: 'failed', error: String(error.code || 'ADVERT_FAILED')}); } catch {}
        try { activity?.fail(activityId, error.message || 'unknown error'); } catch {}
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
  async function allEvidence(reviewId) {
    const curated = await evidence(reviewId);
    let cv = []; try { cv = cvEvidenceLines(await cvText(reviewId)); } catch {}
    return [...curated, ...cv];
  }
  return {
    requirementsFor,
    async check(reviewId, body = {}) {
      const text = String(body.letterText ?? '');
      if (text.length > 40000) throw Object.assign(new Error('The letter is too long to check.'), {statusCode: 413});
      const r = reviewFor(reviewId);
      const reading = await requirementsFor(reviewId, r, {allowPaid: true, readAgain: body.readAdvertAgain === true});
      return {...keywordReport({requirements: reading.requirements, letterText: text, evidence: await allEvidence(reviewId), source: reading.source}), note: reading.note, canReadAgain: Boolean(reading.canReadAgain)};
    },
    // For polishing: never fails the polish; an empty list when anything is missing.
    async priorityKeywords(reviewId, letterText, {allowPaid = false} = {}) {
      try {
        const r = reviewFor(reviewId);
        const reading = await requirementsFor(reviewId, r, {allowPaid});
        return priorityKeywordsFrom(keywordReport({requirements: reading.requirements, letterText, evidence: await allEvidence(reviewId), source: reading.source}));
      } catch { return []; }
    }
  };
}
