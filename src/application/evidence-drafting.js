// Draft one evidence-library scenario with AI from your CV and the assignment notes, for you to review and amend.
// Estimate first (free, local), then one paid request per confirmed click, no retries. Nothing is saved or approved
// here: the draft only fills the boxes on the page.
import {createHash} from 'node:crypto';
import {checkAnswer} from '../domain/questions/answer-policy.js';
import {DEFAULT_POLISHING_MODEL, normalizePolishingModel} from './polishing-model-catalog.js';
import {estimatePolishingApiRequest} from './polishing-cost-estimator.js';
import {ASSIGNMENT_FIELDS, QUICK_FIELDS} from './assignment-evidence-library.js';

export const EVIDENCE_DRAFT_OFF = 'Drafting with AI is off. It uses the same setting as letter polishing: ENABLE_COVER_LETTER_REFINEMENT=true and PERPLEXITY_API_KEY in .env, then restart.';
const CV_LIMIT = 24000;
const fail = (message, statusCode = 400, code = 'EVIDENCE_DRAFT_BLOCKED') => { throw Object.assign(new Error(message), {statusCode, code}); };
const sha = v => createHash('sha256').update(v).digest('hex');
const SCENARIO_KEYS = Object.keys(QUICK_FIELDS.scenario);

// cvChoices(): [{code, name}]; cvTextFor(code): the CV's text. library: the evidence store (read only here).
export function createEvidenceDraftingService({library, writer = null, cvChoices = async () => [], cvTextFor = async () => '', activity = null}) {
  let writing = false;

  async function target(body = {}) {
    if (!library) fail('The evidence library is unavailable.', 503, 'EVIDENCE_LIBRARY_UNAVAILABLE');
    if (!writer || typeof writer.buildRequest !== 'function') fail(EVIDENCE_DRAFT_OFF, 503, 'EVIDENCE_DRAFT_DISABLED');
    const code = String(body.cvCode || '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(code)) fail('Choose the CV to draft from.');
    const cvText = String(await cvTextFor(code) || '').trim().slice(0, CV_LIMIT);
    if (cvText.length < 200) fail('That CV has no readable text. Choose another CV.', 409, 'EVIDENCE_DRAFT_NO_CV');
    const a = library.get(String(body.assignmentId || ''));
    const assignment = Object.fromEntries(Object.keys(ASSIGNMENT_FIELDS).map(k => [k, String(a.data?.[k] || '')]).filter(([, v]) => v));
    const given = body.scenario && typeof body.scenario === 'object' ? body.scenario : {};
    const scenario = Object.fromEntries(SCENARIO_KEYS.map(k => [k, String(given[k] ?? '').trim().slice(0, 4000)]));
    const request = {assignment, scenario, cvText};
    const model = normalizePolishingModel(body.model || DEFAULT_POLISHING_MODEL);
    const apiBody = writer.buildRequest(request, model);
    return {request, model, apiBody, costProof: sha(JSON.stringify(apiBody))};
  }

  return {
    async cvs() { try { return {cvs: (await cvChoices()).filter(c => c?.code).map(c => ({code: String(c.code), name: String(c.name || c.code)})), aiAvailable: Boolean(writer?.available)}; } catch { return {cvs: [], aiAvailable: Boolean(writer?.available)}; } },
    // Cost estimate only: nothing is sent anywhere.
    async estimate(body) {
      const t = await target(body), e = estimatePolishingApiRequest(t.apiBody), m = e.models.find(x => x.id === t.model) || e.models[0];
      return {available: Boolean(writer.available), model: t.model, costProof: t.costProof, estimatedTokenCostUsd: m?.estimatedTokenCostUsd ?? null, ...(writer.available ? {} : {message: EVIDENCE_DRAFT_OFF})};
    },
    // One paid request after you confirmed this exact estimate. The draft only fills the boxes on the page.
    async write(body) {
      if (writing) fail('A draft is already being written. Wait for it to finish.', 409, 'EVIDENCE_DRAFT_BUSY');
      writing = true;
      try {
        const t = await target(body);
        if (!writer.available) fail(EVIDENCE_DRAFT_OFF, 503, 'EVIDENCE_DRAFT_DISABLED');
        if (body.confirmedCostProof !== t.costProof) fail('The CV, the assignment or your notes changed since the estimate. Estimate again; nothing was sent.', 409, 'EVIDENCE_DRAFT_ESTIMATE_STALE');
        let out, activityId = null;
        try { activityId = activity?.start({kind: 'evidence-draft'}) || null; } catch {}
        try { out = await writer.write(t.request, t.model); try { activity?.finish(activityId); } catch {} }
        catch (error) { try { activity?.fail(activityId, error.message); } catch {} fail(`${String(error.code || '').startsWith('EVIDENCE_DRAFT_') ? error.message : 'The drafting service failed.'} Nothing changed and no retry was made.`, 503, error.code || 'EVIDENCE_DRAFT_FAILED'); }
        if (!out?.draft?.approvedWording && !out?.draft?.actions) fail('The drafting service returned an empty draft, so nothing changed.', 502, 'EVIDENCE_DRAFT_INVALID_RESPONSE');
        // Any figure not found in your CV, assignment notes or your own notes is flagged for you to check or remove.
        const sources = [t.request.cvText, ...Object.values(t.request.assignment), ...Object.values(t.request.scenario)].map(text => ({text}));
        const unsupportedFigures = [...new Set(Object.values(out.draft).flatMap(v => checkAnswer({answer: v, limit: 100000, evidence: sources}).unsupportedFigures || []))];
        return {draft: out.draft, notes: out.notes || '', model: out.model, unsupportedFigures};
      } finally { writing = false; }
    }
  };
}
