import { POLISHING_OUTPUT_TOKEN_BUDGET } from './polishing-model-catalog.js';
const numeric=(value,missing='unreported')=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:missing;
const label=(value,missing='unreported')=>typeof value==='string'&&/^[A-Za-z0-9_./:-]{1,160}$/.test(value)?value:missing;
export function refinementAttemptLogFields(attempt={}) {
  const meta=attempt||{};
  const cost=numeric(meta.providerReportedCostUsd,'unavailable');
  return {requestedModel:label(meta.requestedModel),returnedModel:label(meta.returnedModel),
    inputTokens:numeric(meta.inputTokens),outputTokens:numeric(meta.outputTokens),reasoningTokens:numeric(meta.reasoningTokens),
    reportedRequestCostUsd:cost,costSource:typeof cost==='number'?'provider_reported':'unavailable',currency:'USD',
    durationMs:numeric(meta.durationMs),outcome:['passed','failed'].includes(meta.outcome)?meta.outcome:'unreported',
    errorCode:label(meta.errorCode,'none'),outputTokenBudget:POLISHING_OUTPUT_TOKEN_BUDGET};
}
