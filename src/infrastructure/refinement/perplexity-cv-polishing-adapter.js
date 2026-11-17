// Paid, optional Polish step for a tailored CV (part 2). One request per confirmed click: no web search, no retries.
// Only the CV wording on the page, the CV's own lines and the achievements selected for this application are sent.
import {TAILORED_LIMITS} from '../../domain/cv/cv-tailoring-policy.js';
import {POLISHING_OUTPUT_TOKEN_BUDGET} from '../../application/polishing-model-catalog.js';

const ENDPOINT = 'https://api.perplexity.ai/v1/agent';
const DESCRIPTION_LIMIT = 6000;

export const CV_POLISH_INSTRUCTIONS = [
  'You polish the wording of a UK CV for one job application. Use British English spelling and a concise, senior, professional tone.',
  'Rewrite only what you are given: the summary paragraphs, the Key achievements bullets (when present) and the bullets under each employer.',
  'Use only facts that appear in the text provided: the current wording, the original CV lines and the selected evidence. Never add employers, job titles, clients, sectors, tools, certifications, qualifications, public-sector claims or results that are not there.',
  'Keep every figure (percentages, money, counts, durations) exactly as written. A figure may only appear under the employer whose original bullets contain it.',
  'Return the same employers in the same order. For each employer return no more bullets than you were given, most relevant to the job first. One achievement per bullet, starting with a strong past-tense verb, no first person.',
  `Keep the summary to at most ${TAILORED_LIMITS.maxProfileChars} characters in total, in one to three paragraphs, without first person.`,
  'Rewrite actively for this job: do not just reorder lines or return them unchanged. Rephrase each summary sentence and bullet to mirror the job description\'s language and priorities, lead with the result or impact, make the scope (team size, budget, scale) visible where the text gives it, and work in job keywords that the provided text supports. Keep a line unchanged only when it already fits this job best.',
  'No markdown, HTML, emoji or placeholders. Put any caution for the owner in notes (one or two sentences), otherwise leave notes empty.'
].join(' ');

const strings = {type: 'array', items: {type: 'string'}};
export const CV_POLISH_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'keyAchievements', 'employers', 'notes'],
  properties: {
    summary: strings,
    keyAchievements: strings,
    employers: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['bullets'], properties: {bullets: strings}}},
    notes: {type: 'string'}
  }
});

function userPrompt(request) {
  return JSON.stringify({
    job: {title: request.jobTitle, organisation: request.organisationName, keywords: request.keywords, description: String(request.jobDescriptionText || '').slice(0, DESCRIPTION_LIMIT)},
    currentWording: {summary: request.profile, keyAchievements: request.achievements, employers: request.roles.map(r => ({employer: r.title, bullets: r.bullets}))},
    originalCv: {summary: request.originalProfile, keyAchievements: request.originalAchievements, employers: request.roles.map(r => ({employer: r.title, bullets: r.originalBullets}))},
    selectedEvidence: request.selectedEvidence
  });
}

export function buildCvPolishApiRequest(request, model) {
  return {
    model,
    max_output_tokens: POLISHING_OUTPUT_TOKEN_BUDGET,
    input: [
      {role: 'system', content: [{type: 'input_text', text: CV_POLISH_INSTRUCTIONS}]},
      {role: 'user', content: [{type: 'input_text', text: userPrompt(request)}]}
    ],
    response_format: {type: 'json_schema', json_schema: {name: 'cv_polish', strict: true, schema: CV_POLISH_SCHEMA}}
  };
}

function structuredOutput(payload) {
  if (payload?.output_parsed && typeof payload.output_parsed === 'object') return payload.output_parsed;
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item.type && item.type !== 'message') continue;
    for (const block of Array.isArray(item.content) ? item.content : []) {
      if (block?.json && typeof block.json === 'object') return block.json;
      if (typeof block?.text === 'string' && block.text.trim()) { try { return JSON.parse(block.text); } catch {} }
    }
  }
  const legacy = payload?.choices?.[0]?.message?.content;
  if (typeof legacy === 'string') { try { return JSON.parse(legacy); } catch {} }
  throw Object.assign(new Error('The polishing service returned no usable wording.'), {code: 'CV_POLISH_INVALID_RESPONSE'});
}

// enabled follows the letter-polishing setting; without it only cost estimates work and nothing is sent.
export function createCvPolisher({apiKey = '', enabled = false, fetchImpl = fetch} = {}) {
  const ready = Boolean(enabled && typeof apiKey === 'string' && apiKey.trim());
  return {
    buildRequest: buildCvPolishApiRequest,
    available: ready,
    async polish(request, model) {
      if (!ready) throw Object.assign(new Error('CV polishing is off.'), {code: 'CV_POLISH_DISABLED'});
      const startedAt = Date.now();
      let response;
      try {
        response = await fetchImpl(ENDPOINT, {method: 'POST', headers: {authorization: `Bearer ${apiKey}`, 'content-type': 'application/json'}, body: JSON.stringify(buildCvPolishApiRequest(request, model))});
      } catch {
        throw Object.assign(new Error('The polishing service could not be reached.'), {code: 'CV_POLISH_NETWORK_FAILED'});
      }
      if (!response.ok) throw Object.assign(new Error(`The polishing service refused the request (HTTP ${response.status}).`), {code: 'CV_POLISH_PROVIDER_FAILED', httpStatus: response.status});
      let payload;
      try { payload = await response.json(); } catch { throw Object.assign(new Error('The polishing service returned an unreadable response.'), {code: 'CV_POLISH_INVALID_RESPONSE'}); }
      if (payload?.status && payload.status !== 'completed') throw Object.assign(new Error(`The polishing service did not finish (${String(payload.status).slice(0, 40)}).`), {code: 'CV_POLISH_INCOMPLETE'});
      return {result: structuredOutput(payload), response: payload, durationMs: Date.now() - startedAt};
    }
  };
}
