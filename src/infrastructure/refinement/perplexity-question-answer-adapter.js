// Optional, paid answer writer for portal application questions. One request per confirmed click: no web search, no retries.
// Only the question, the limit, the job summary and the owner's evidence lines are sent.
import {providerTimeLimitMs, timeLimitSignal, isTimeLimitError, timeLimitMessage} from '../provider-time-limit.js';

const ENDPOINT = 'https://api.perplexity.ai/v1/agent';
const OUTPUT_TOKENS = 1600;

export const ANSWER_INSTRUCTIONS = [
  'You answer one question from a UK job application form, as the candidate, in the first person and British English.',
  'Use only facts in the evidence provided. Never add employers, job titles, clients, sectors, tools, qualifications, figures or outcomes that are not in the evidence.',
  'Keep every figure exactly as written in the evidence.',
  'Answer the question that is asked, directly, with specific examples from the evidence; mirror the language of the job where the evidence supports it.',
  'The limit is strict: stay within it, counting as stated (words, or characters including spaces). Aim for 90 to 100 percent of the limit.',
  'Plain text paragraphs only: no headings, markdown, bullets, emoji or placeholders, unless the question asks for a list.',
  'Put any caution for the candidate (for example missing evidence) in notes, otherwise leave notes empty.'
].join(' ');

export const ANSWER_SCHEMA = Object.freeze({type: 'object', additionalProperties: false, required: ['answer', 'notes'], properties: {answer: {type: 'string'}, notes: {type: 'string'}}});

export function buildAnswerApiRequest(request, model) {
  return {
    model,
    max_output_tokens: OUTPUT_TOKENS,
    input: [
      {role: 'system', content: [{type: 'input_text', text: ANSWER_INSTRUCTIONS}]},
      {role: 'user', content: [{type: 'input_text', text: JSON.stringify({
        question: request.question, limit: `${request.limit} ${request.unit}`,
        job: {title: request.jobTitle, organisation: request.organisationName, description: String(request.jobDescriptionText || '').slice(0, 4000)},
        evidence: request.evidence.map(e => ({source: e.source, text: e.text})), currentDraft: request.currentDraft || ''})}]}
    ],
    response_format: {type: 'json_schema', json_schema: {name: 'application_answer', strict: true, schema: ANSWER_SCHEMA}}
  };
}

function parsed(payload) {
  if (payload?.output_parsed && typeof payload.output_parsed === 'object') return payload.output_parsed;
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const block of Array.isArray(item?.content) ? item.content : []) {
      if (block?.json && typeof block.json === 'object') return block.json;
      if (typeof block?.text === 'string') { try { return JSON.parse(block.text); } catch {} }
    }
  }
  throw Object.assign(new Error('The answer service returned no usable text.'), {code: 'ANSWER_INVALID_RESPONSE'});
}

export function createQuestionAnswerWriter({apiKey = '', enabled = false, fetchImpl = fetch, timeoutMs = providerTimeLimitMs()} = {}) {
  const available = Boolean(enabled && String(apiKey).trim());
  return {
    available,
    buildRequest: buildAnswerApiRequest,
    async write(request, model) {
      if (!available) throw Object.assign(new Error('Writing answers with AI is off.'), {code: 'ANSWER_DISABLED'});
      let response, payload;
      try { response = await fetchImpl(ENDPOINT, {method: 'POST', signal: timeLimitSignal(timeoutMs), headers: {authorization: `Bearer ${apiKey}`, 'content-type': 'application/json'}, body: JSON.stringify(buildAnswerApiRequest(request, model))}); }
      catch (error) { if (isTimeLimitError(error)) throw Object.assign(new Error(timeLimitMessage('The answer service', timeoutMs)), {code: 'ANSWER_TIMEOUT'}); throw Object.assign(new Error('The answer service could not be reached.'), {code: 'ANSWER_NETWORK_FAILED'}); }
      if (!response.ok) throw Object.assign(new Error(`The answer service refused the request (HTTP ${response.status}).`), {code: 'ANSWER_PROVIDER_FAILED'});
      try { payload = await response.json(); }
      catch (error) { if (isTimeLimitError(error)) throw Object.assign(new Error(timeLimitMessage('The answer service', timeoutMs)), {code: 'ANSWER_TIMEOUT'}); throw Object.assign(new Error('The answer service returned an unreadable response.'), {code: 'ANSWER_INVALID_RESPONSE'}); }
      if (payload?.status && payload.status !== 'completed') throw Object.assign(new Error('The answer service did not finish.'), {code: 'ANSWER_INCOMPLETE'});
      const out = parsed(payload);
      return {answer: String(out.answer || '').trim(), notes: String(out.notes || '').trim(), model: String(payload?.model || model)};
    }
  };
}
