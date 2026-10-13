import { rankModelsForRequest, POLISHING_OUTPUT_TOKEN_BUDGET, PRICING_CHECKED_AT } from './polishing-model-catalog.js';
export function estimatePolishingApiRequest(body) {
  const inputCharacters=JSON.stringify(body.input||[]).length+JSON.stringify(body.response_format||{}).length+
    JSON.stringify(body.tools||[]).length+String(body.instructions||'').length;
  const estimatedInputTokens=Math.ceil(inputCharacters/4)+64;
  const outputTokenBudget=body.max_output_tokens||POLISHING_OUTPUT_TOKEN_BUDGET;
  const models=rankModelsForRequest(estimatedInputTokens,outputTokenBudget);
  return {estimatedInputTokens,inputCharacters,outputTokenBudget,models,recommendedModel:models[0].id,
    pricingCheckedAt:PRICING_CHECKED_AT,webSearchAllowed:Array.isArray(body.tools)&&body.tools.some(tool=>tool.type==='web_search'),
    assumption:'Approximate input tokens: request input/schema/tool characters divided by 4, plus 64. No provider tokenizer is used. The subtotal uses the full output-token budget, not a prediction of output length.',
    limitation:'Not a billing ceiling. Cache discounts, cache writes, search invocations and search-result tokens are not estimated. Provider tokenizers can differ; tier estimates can be wrong near a threshold.',
    fastSearchUsdPerInvocation:0.001};
}
