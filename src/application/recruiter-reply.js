// Reply assistant: drafts a polite, evidence-led reply to a recruiter's answer (for example "please apply online"),
// for the owner to copy into Gmail. It never sends anything. Writing uses the same AI setting as letter polishing:
// estimate first (free), then one paid request per confirmed click, no retries.
import {createHash} from 'node:crypto';
import {checkAnswer} from '../domain/questions/answer-policy.js';
import {DEFAULT_POLISHING_MODEL, normalizePolishingModel} from './polishing-model-catalog.js';
import {estimatePolishingApiRequest} from './polishing-cost-estimator.js';

export const REPLY_STATUSES = Object.freeze({
  applied: 'I have already applied online',
  'will-apply': 'I will complete the online application today',
  'not-yet': 'I have not applied online yet; ask how they prefer to receive it'
});
const OFF = 'Writing replies with AI is off. It uses the same setting as letter polishing: ENABLE_COVER_LETTER_REFINEMENT=true and PERPLEXITY_API_KEY in .env, then restart.';
const fail = (message, statusCode = 400, code = 'REPLY_BLOCKED') => { throw Object.assign(new Error(message), {statusCode, code}); };
const sha = v => createHash('sha256').update(v).digest('hex');
const text = (v, max, label, {required = false, min = 0} = {}) => {
  if (v !== undefined && v !== null && typeof v !== 'string') fail(label + ' must be text.');
  const s = String(v ?? '').replace(/\r\n/g, '\n').trim();
  if (required && !s) fail(label + ' is required.');
  if (s && s.length < min) fail(`${label} is too short to reply to (at least ${min} characters).`);
  if (s.length > max) fail(`${label} is too long (at most ${max} characters).`);
  return s;
};

export function validateReplyRequest(body = {}) {
  const status = String(body.applicationStatus || '');
  if (!REPLY_STATUSES[status]) fail('Choose where your online application stands.');
  return {theirMessage: text(body.theirMessage, 8000, 'Their message', {required: true, min: 20}), applicationStatus: status,
    recipientName: text(body.recipientName, 80, 'Their name'), ownerNote: text(body.ownerNote, 1000, 'Your note')};
}

export function createRecruiterReplyService({reviews, evidence = async () => [], writer = null, candidateName = ''}) {
  if (!reviews) throw new Error('The reply assistant needs saved applications.');
  let writing = false;
  const review = id => { const r = reviews.get(id); if (!r) fail('Saved application not found.', 404); return r; };

  async function target(reviewId, body) {
    if (!writer || typeof writer.buildRequest !== 'function') fail(OFF, 503, 'REPLY_DISABLED');
    const r = review(reviewId), v = validateReplyRequest(body), ev = await evidence(reviewId), form = r.formData || {};
    const request = {...v, applicationStatusText: REPLY_STATUSES[v.applicationStatus], candidateName: String(candidateName || ''),
      jobTitle: String(form.jobTitle || ''), organisationName: String(form.organisationName || ''), evidence: ev.slice(0, 40)};
    const model = normalizePolishingModel(body.model || r.polishingModel || DEFAULT_POLISHING_MODEL);
    const apiBody = writer.buildRequest(request, model);
    return {request, ev, model, apiBody, costProof: sha(JSON.stringify(apiBody))};
  }

  return {
    async overview(reviewId) { review(reviewId); const ev = await evidence(reviewId); return {evidenceCount: ev.length, aiAvailable: Boolean(writer?.available), statuses: REPLY_STATUSES}; },
    // Cost estimate only: nothing is sent anywhere.
    async estimate(reviewId, body) {
      const t = await target(reviewId, body), e = estimatePolishingApiRequest(t.apiBody);
      return {available: Boolean(writer.available), model: t.model, costProof: t.costProof, evidenceCount: t.ev.length,
        models: e.models.map(m => ({id: m.id, label: m.label, estimatedTokenCostUsd: m.estimatedTokenCostUsd})), ...(writer.available ? {} : {message: OFF})};
    },
    // One paid request after the owner confirmed this exact estimate. The reply only fills the editor.
    async write(reviewId, body) {
      if (writing) fail('A reply is already being written. Wait for it to finish.', 409, 'REPLY_BUSY');
      writing = true;
      try {
        const t = await target(reviewId, body);
        if (!writer.available) fail(OFF, 503, 'REPLY_DISABLED');
        if (body.confirmedCostProof !== t.costProof) fail('Their message, your choices or the model changed since the estimate. Estimate again; nothing was sent.', 409, 'REPLY_ESTIMATE_STALE');
        let out;
        try { out = await writer.write(t.request, t.model); }
        catch (error) { fail(`${String(error.code || '').startsWith('REPLY_') ? error.message : 'The reply service failed.'} Nothing changed and no retry was made.`, 503, error.code || 'REPLY_FAILED'); }
        if (!out.reply) fail('The reply service returned an empty reply, so nothing changed.', 502, 'REPLY_INVALID_RESPONSE');
        const check = checkAnswer({answer: out.reply, unit: 'words', limit: 1000, evidence: t.ev});
        return {reply: out.reply, notes: out.notes, model: out.model, unsupportedFigures: check.unsupportedFigures || []};
      } finally { writing = false; }
    }
  };
}
