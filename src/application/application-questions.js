// Application questions helper: answer portal questions within an exact limit, from this application's evidence only.
// The draft is free and local. Writing with AI is optional: estimate first, one paid request per confirmed click, no retries.
import {createHash} from 'node:crypto';
import {validateQuestion, draftAnswer, checkAnswer} from '../domain/questions/answer-policy.js';
import {extractJobKeywords} from '../domain/job-description/extract-job-keywords.js';
import {DEFAULT_POLISHING_MODEL, normalizePolishingModel} from './polishing-model-catalog.js';
import {estimatePolishingApiRequest} from './polishing-cost-estimator.js';

const fail = (message, statusCode = 400, code = 'QUESTION_BLOCKED') => { throw Object.assign(new Error(message), {statusCode, code}); };
const sha = v => createHash('sha256').update(v).digest('hex');
const OFF = 'Writing answers with AI is off. It uses the same setting as letter polishing: ENABLE_COVER_LETTER_REFINEMENT=true and PERPLEXITY_API_KEY in .env, then restart.';

function lines(value) { return (Array.isArray(value) ? value : []).map(v => String(v || '').trim()).filter(v => v && v.toLowerCase() !== 'null'); }

export function createApplicationQuestionsService({reviews, store, tailoredLatest = () => null, scenarioEvidence = () => [], writer = null}) {
  if (!reviews || !store) throw new Error('Application questions need reviews and a store.');
  let writing = false;

  function review(reviewId) { const r = reviews.get(reviewId); if (!r) fail('Saved application not found.', 404); return r; }

  // Evidence: selected achievements, the latest tailored CV (summary and bullets), and approved scenarios used for polishing.
  async function evidence(reviewId) {
    const r = review(reviewId), out = [];
    for (const text of lines(r.formData?.cvHighlights)) out.push({text, source: 'Selected achievement'});
    const t = await tailoredLatest(reviewId);
    if (t) {
      for (const text of lines(t.profile)) out.push({text, source: 'Tailored CV summary'});
      const ach = Array.isArray(t.achievements) ? t.achievements : t.achievements?.achievements;
      for (const text of lines(ach)) out.push({text, source: 'Tailored CV key achievement'});
      for (const role of Array.isArray(t.achievements?.roles) ? t.achievements.roles : []) for (const text of lines(role)) out.push({text, source: 'Tailored CV bullet'});
    }
    for (const s of await scenarioEvidence(r)) if (s?.text) out.push({text: String(s.text), source: s.source || 'Approved scenario'});
    return out;
  }

  const keywords = r => { const k = r.prepared?.jobDescription?.keywords; return Array.isArray(k) && k.length ? k : extractJobKeywords(String(r.formData?.jobDescriptionText || '')); };

  async function target(reviewId, body) {
    const r = review(reviewId), q = validateQuestion(body), ev = await evidence(reviewId);
    if (!ev.length) fail('No evidence yet: select achievements for this application, build a tailored CV, or choose approved scenarios for polishing.', 409, 'QUESTION_NO_EVIDENCE');
    return {r, q, ev};
  }

  async function aiTarget(reviewId, body) {
    if (!writer || typeof writer.buildRequest !== 'function') fail(OFF, 503, 'ANSWER_DISABLED');
    const {r, q, ev} = await target(reviewId, body), form = r.formData || {};
    const request = {...q, jobTitle: String(form.jobTitle || ''), organisationName: String(form.organisationName || ''), jobDescriptionText: String(form.jobDescriptionText || ''), evidence: ev.slice(0, 60), currentDraft: String(body.currentDraft || '').slice(0, 12000)};
    const model = normalizePolishingModel(body.model || r.polishingModel || DEFAULT_POLISHING_MODEL);
    const apiBody = writer.buildRequest(request, model);
    return {q, ev, request, model, costProof: sha(JSON.stringify(apiBody)), apiBody};
  }

  return {
    // Shared with the reply assistant: the same evidence lines, nothing else.
    evidenceFor: reviewId => evidence(reviewId),
    async overview(reviewId) {
      const ev = await evidence(reviewId);
      return {evidenceCount: ev.length, sources: [...new Set(ev.map(e => e.source))], aiAvailable: Boolean(writer?.available), saved: store.list(reviewId)};
    },
    async draft(reviewId, body) {
      const {r, q, ev} = await target(reviewId, body);
      const d = draftAnswer({question: q.question, evidence: ev, keywords: keywords(r), unit: q.unit, limit: q.limit});
      return {...q, ...d, check: checkAnswer({answer: d.answer, unit: q.unit, limit: q.limit, evidence: ev})};
    },
    async check(reviewId, body) {
      const {q, ev} = await target(reviewId, body);
      return checkAnswer({answer: String(body.answer || ''), unit: q.unit, limit: q.limit, evidence: ev});
    },
    // Cost estimate only: nothing is sent anywhere.
    async estimate(reviewId, body) {
      const t = await aiTarget(reviewId, body), e = estimatePolishingApiRequest(t.apiBody);
      return {available: Boolean(writer.available), model: t.model, costProof: t.costProof, estimatedInputTokens: e.estimatedInputTokens, outputTokenBudget: e.outputTokenBudget,
        models: e.models.map(m => ({id: m.id, label: m.label, estimatedTokenCostUsd: m.estimatedTokenCostUsd})), ...(writer.available ? {} : {message: OFF})};
    },
    // One paid request after the owner confirmed this exact estimate. The result only fills the editor.
    async write(reviewId, body) {
      if (writing) fail('An answer is already being written. Wait for it to finish.', 409, 'ANSWER_BUSY');
      writing = true;
      try {
        const t = await aiTarget(reviewId, body);
        if (!writer.available) fail(OFF, 503, 'ANSWER_DISABLED');
        if (body.confirmedCostProof !== t.costProof) fail('The question, limit, draft or model changed since the estimate. Estimate again; nothing was sent.', 409, 'ANSWER_ESTIMATE_STALE');
        let out;
        try { out = await writer.write(t.request, t.model); }
        catch (error) { fail(`${String(error.code || '').startsWith('ANSWER_') ? error.message : 'The answer service failed.'} Nothing changed and no retry was made.`, 503, error.code || 'ANSWER_FAILED'); }
        if (!out.answer) fail('The answer service returned an empty answer, so nothing changed.', 502, 'ANSWER_INVALID_RESPONSE');
        return {answer: out.answer, notes: out.notes, model: out.model, check: checkAnswer({answer: out.answer, unit: t.q.unit, limit: t.q.limit, evidence: t.ev})};
      } finally { writing = false; }
    },
    async save(reviewId, body) {
      review(reviewId);
      const q = validateQuestion(body), answer = String(body.answer || '').replace(/\r\n/g, '\n').trim();
      if (!answer) fail('Write or draft an answer before saving.');
      if (answer.length > 20000) fail('The answer is too long to save.');
      return store.save(reviewId, {...q, answer, origin: ['evidence', 'ai', 'edited'].includes(body.origin) ? body.origin : 'edited'});
    },
    remove(reviewId, id) { review(reviewId); if (!store.remove(reviewId, id)) fail('That saved answer was not found.', 404); return store.list(reviewId); }
  };
}
