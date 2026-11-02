import { refinementError } from './refinement-error-details.js';
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_./:-]{1,160}$/.test(value)?value:'unreported';
const numeric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:undefined;
function category(message) {
  const text=String(message||'');
  if(/max.?output|output.?token|token.?limit/i.test(text))return 'token_limit';
  if(/schema|structured.?output/i.test(text))return 'structured_output';
  if(/rate.?limit/i.test(text))return 'rate_limit';
  if(/api.?key|authentication|unauthorized/i.test(text))return 'authentication';
  if(/content.?filter|safety/i.test(text))return 'content_filter';
  if(/model.{0,30}(?:not found|unavailable|unsupported)/i.test(text))return 'model_availability';
  if(/timed.?out|timeout/i.test(text))return 'provider_timeout';
  if(/invalid.?param|validation/i.test(text))return 'request_validation';
  return 'unreported';
}
export function assertCompletedRefinement(payload,context={}) {
  const status=payload?.status;
  const messages=(Array.isArray(payload?.output)?payload.output:[]).filter(item=>item.type==='message');
  const messageIncomplete=messages.some(item=>item.status&&item.status!=='completed');
  if((status===undefined||status===null||status===''||status==='completed')&&!messageIncomplete)return;
  const usage=payload?.usage||{};
  const output=numeric(usage.output_tokens??usage.completion_tokens),budget=numeric(context.outputTokenBudget);
  const details={httpStatus:numeric(context.httpStatus),elapsedMs:numeric(context.elapsedMs),providerRequestId:context.providerRequestId,
    requestedModel:token(context.requestedModel),returnedModel:token(payload?.model),responseStatus:token(status),
    incompleteReason:token(payload?.incomplete_details?.reason),providerErrorCode:token(payload?.error?.code),
    providerErrorType:token(payload?.error?.type),providerErrorCategory:category(payload?.error?.message),
    inputTokens:numeric(usage.input_tokens??usage.prompt_tokens),outputTokens:output,
    reasoningTokens:numeric(usage.output_tokens_details?.reasoning_tokens??usage.completion_tokens_details?.reasoning_tokens),
    outputTokenBudget:budget,providerReportedCostUsd:numeric(usage.cost?.total_cost),
    outputAtTokenBudget:output!==undefined&&budget!==undefined?output>=budget:undefined};
  let code,message;
  if(status==='failed'){code='REFINEMENT_PROVIDER_FAILED';message='Provider reported a failed response. No proposal was accepted.';}
  else if(status==='cancelled'){code='REFINEMENT_PROVIDER_CANCELLED';message='Provider reported a cancelled response. No proposal was accepted.';}
  else if(['queued','in_progress'].includes(status)){code='REFINEMENT_RESPONSE_PENDING';message='Provider returned a pending response rather than a completed letter. No proposal was accepted.';}
  else if(status==='incomplete'||messageIncomplete){code='REFINEMENT_INCOMPLETE_OUTPUT';message='Provider returned incomplete output. No proposal was accepted.';}
  else {code='REFINEMENT_STATUS_UNRECOGNIZED';message='Provider returned an unrecognized response status. No proposal was accepted.';}
  throw refinementError(code,message,details);
}
