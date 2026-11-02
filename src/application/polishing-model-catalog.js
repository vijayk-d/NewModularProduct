export const PRICING_CHECKED_AT = '2026-10-13';
export const DEFAULT_POLISHING_MODEL = 'anthropic/claude-haiku-5-5';
export const POLISHING_OUTPUT_TOKEN_BUDGET = 4096;
export const MODEL_REFERENCE_WORKLOAD = Object.freeze({inputTokens:5000,outputTokens:1500});
const catalog = [
  {id:'anthropic/claude-haiku-5-5',label:'Claude Haiku 5.5',provider:'Anthropic',inputUsdPerMillion:0.10,outputUsdPerMillion:0.50,tierThreshold:100000,highInputUsdPerMillion:0.50,highOutputUsdPerMillion:2.50},
  {id:'openai/gpt-6-luna',label:'GPT-6 Luna',provider:'OpenAI',inputUsdPerMillion:0.10,outputUsdPerMillion:0.50,tierThreshold:272000,highInputUsdPerMillion:0.20,highOutputUsdPerMillion:0.75},
  {id:'perplexity/glm-5.3-flash',label:'GLM 5.3 Flash',provider:'Perplexity-hosted Z.AI',inputUsdPerMillion:0.15,outputUsdPerMillion:0.50},
  {id:'openai/gpt-5.6-luna',label:'GPT-5.6 Luna',provider:'OpenAI',inputUsdPerMillion:0.20,outputUsdPerMillion:1.20,tierThreshold:272000,highInputUsdPerMillion:0.40,highOutputUsdPerMillion:1.80},
  {id:'google/gemini-3.1-flash-lite',label:'Gemini 3.1 Flash-Lite',provider:'Google',inputUsdPerMillion:0.25,outputUsdPerMillion:1.50},
  {id:'google/gemini-3.5-flash-lite',label:'Gemini 3.5 Flash-Lite',provider:'Google',inputUsdPerMillion:0.30,outputUsdPerMillion:2.50},
  {id:'google/gemini-3-flash-preview',label:'Gemini 3 Flash Preview',provider:'Google (preview)',inputUsdPerMillion:0.50,outputUsdPerMillion:3.00},
  {id:'anthropic/claude-haiku-4-5',label:'Claude Haiku 4.5',provider:'Anthropic',inputUsdPerMillion:1.00,outputUsdPerMillion:5.00},
  {id:'anthropic/claude-sonnet-4-6',label:'Claude Sonnet 4.6',provider:'Anthropic',inputUsdPerMillion:3.00,outputUsdPerMillion:15.00}
];
export function modelRates(model,inputTokens=0) {
  const high=Boolean(model.tierThreshold && inputTokens>model.tierThreshold);
  return {inputUsdPerMillion:high?model.highInputUsdPerMillion:model.inputUsdPerMillion,
    outputUsdPerMillion:high?model.highOutputUsdPerMillion:model.outputUsdPerMillion,tier:high?'high':'base'};
}
export function estimateModelTokenCost(model,inputTokens,outputTokens) {
  if(!Number.isFinite(inputTokens)||inputTokens<0||!Number.isFinite(outputTokens)||outputTokens<0)throw new Error('Token estimate must be non-negative.');
  const rates=modelRates(model,inputTokens);
  return (inputTokens*rates.inputUsdPerMillion+outputTokens*rates.outputUsdPerMillion)/1000000;
}
export function referenceModelCost(model) {return estimateModelTokenCost(model,MODEL_REFERENCE_WORKLOAD.inputTokens,MODEL_REFERENCE_WORKLOAD.outputTokens);}
export const POLISHING_MODELS = Object.freeze(catalog.map(model=>Object.freeze({...model,
  pricingSource:'https://docs.perplexity.ai/docs/agent-api/models',referenceCostUsd:referenceModelCost(model)}))
  .sort((a,b)=>a.referenceCostUsd-b.referenceCostUsd||a.id.localeCompare(b.id)));
export function rankModelsForRequest(inputTokens,outputTokens=POLISHING_OUTPUT_TOKEN_BUDGET) {
  return POLISHING_MODELS.map(model=>({...model,...modelRates(model,inputTokens),estimatedTokenCostUsd:estimateModelTokenCost(model,inputTokens,outputTokens)}))
    .sort((a,b)=>a.estimatedTokenCostUsd-b.estimatedTokenCostUsd||a.id.localeCompare(b.id));
}
export function normalizePolishingModel(value=DEFAULT_POLISHING_MODEL) {
  const id=String(value).trim();
  if(!POLISHING_MODELS.some(model=>model.id===id)) {
    const error=new Error('Choose a supported polishing model.');error.code='REFINEMENT_MODEL_INVALID';throw error;
  }
  return id;
}
const numeric=value=>typeof value==='number' && Number.isFinite(value) && value>=0 ? value : null;
const label=value=>typeof value==='string' && /^[A-Za-z0-9_./:-]{1,160}$/.test(value) ? value : null;
export function buildPolishingAttempt({requestModel,response,durationMs,tone,webSearchEnabled,outcome,errorCode=null,httpStatus=null}={}) {
  const usage=response?.usage||{};
  return normalizeAttemptMetadata({requestedModel:requestModel,returnedModel:response?.model,
    durationMs,tone,webSearchEnabled,outcome,errorCode,httpStatus,
    inputTokens:usage.input_tokens??usage.prompt_tokens,outputTokens:usage.output_tokens??usage.completion_tokens,
    reasoningTokens:usage.output_tokens_details?.reasoning_tokens??usage.completion_tokens_details?.reasoning_tokens,
    providerReportedCostUsd:usage.cost?.total_cost});
}
export function normalizeAttemptMetadata(value={}) {
  return {requestedModel:label(value.requestedModel),returnedModel:label(value.returnedModel),durationMs:numeric(value.durationMs),
    tone:label(value.tone),webSearchEnabled:typeof value.webSearchEnabled==='boolean'?value.webSearchEnabled:null,
    outcome:['passed','failed'].includes(value.outcome)?value.outcome:'unreported',errorCode:label(value.errorCode),
    httpStatus:numeric(value.httpStatus),inputTokens:numeric(value.inputTokens),outputTokens:numeric(value.outputTokens),
    reasoningTokens:numeric(value.reasoningTokens),providerReportedCostUsd:numeric(value.providerReportedCostUsd)};
}
export function retainSuccessfulProposal(previous,failed) {
  if(!previous?.proposedDraft) return failed;
  const oldWarnings=(Array.isArray(previous.warnings)?previous.warnings:[]).filter(warning=>!String(warning).startsWith('Latest polishing attempt failed.'));
  const errors=(Array.isArray(failed?.warnings)?failed.warnings:[]).join(' ');
  return {...previous,warnings:[...oldWarnings,`Latest polishing attempt failed. Previous proposal retained unchanged. ${errors}`.trim()]};
}
