const safeMessages = new Map([
  ['Provider returned incomplete output. No proposal was accepted.', 'REFINEMENT_INCOMPLETE_OUTPUT'],
  ['Provider reported a failed response. No proposal was accepted.', 'REFINEMENT_PROVIDER_FAILED'],
  ['Provider reported a cancelled response. No proposal was accepted.', 'REFINEMENT_PROVIDER_CANCELLED'],
  ['Provider returned a pending response rather than a completed letter. No proposal was accepted.', 'REFINEMENT_RESPONSE_PENDING'],
  ['Provider returned an unrecognized response status. No proposal was accepted.', 'REFINEMENT_STATUS_UNRECOGNIZED'],
  ['Provider did not return a completed response. No proposal was accepted.', 'REFINEMENT_INCOMPLETE_OUTPUT'],
  ['Choose a supported polishing model.', 'REFINEMENT_MODEL_INVALID'],
  ['Research links, citations or Markdown links appeared in the experience body. The proposal was not accepted.', 'REFINEMENT_BODY_LINK_REJECTED'],
  ['Editorial commentary appeared in the experience body. The proposal was not accepted.', 'REFINEMENT_COMMENTARY_REJECTED'],
  ['An excluded employer appeared in the experience body. The proposal was not accepted.', 'REFINEMENT_EXCLUDED_EMPLOYER'],
  ['Choose a supported cover-letter tone.', 'REFINEMENT_TONE_INVALID'],
  ['Provider returned unexpected mixed-language letter or warning text. The proposal was not accepted.', 'REFINEMENT_LANGUAGE_REJECTED'],
  ['Cover-letter proposal contains an unresolved internal placeholder.', 'REFINEMENT_TOKEN_REJECTED'],
  ['Cover-letter proposal does not end with the configured candidate name.', 'REFINEMENT_SIGNOFF_REJECTED'],
  ['The complete outreach letter exceeds the configured word limit.', 'REFINEMENT_COMPOSED_TOO_LONG'],
  ['Perplexity cover-letter refinement exceeded the configured word limit.', 'REFINEMENT_DRAFT_TOO_LONG'],
  ['Perplexity cover-letter refinement returned no usable draft.', 'REFINEMENT_EMPTY_OUTPUT'],
  ['Perplexity cover-letter refinement returned an invalid response.', 'REFINEMENT_INVALID_OUTPUT'],
  ['The proposal needs substantive experience paragraphs.', 'REFINEMENT_BODY_MISSING'],
  ['The proposal contains unresolved placeholders or raw HTML.', 'REFINEMENT_BODY_REJECTED'],
  ['A valid job advert URL is required.', 'REFINEMENT_ADVERT_INVALID'],
  ['Job advert URL must use HTTP or HTTPS.', 'REFINEMENT_ADVERT_INVALID'],
  ['Application role must be supplied as plain single-line text.', 'REFINEMENT_ROLE_INVALID'],
  ['Organisation name must be supplied as plain single-line text.', 'REFINEMENT_ORGANISATION_INVALID'],
  ['Candidate name must be supplied as plain single-line text.', 'REFINEMENT_NAME_INVALID'],
  ['Job advert URL must be supplied as plain single-line text.', 'REFINEMENT_ADVERT_INVALID']
]);
const token = value => /^[A-Za-z0-9_.-]{1,100}$/.test(String(value || '')) ? String(value) : undefined;
export function refinementError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.refinementDetails = details;
  return error;
}
export function describeRefinementFailure(error) {
  const suppliedCode = token(error?.code);
  const known = safeMessages.get(error?.message);
  const code = known || (suppliedCode?.startsWith('REFINEMENT_') ? suppliedCode :
    suppliedCode === 'CV_EVIDENCE_UNAVAILABLE' || suppliedCode === 'LINKEDIN_EVIDENCE_UNAVAILABLE' ? suppliedCode : 'REFINEMENT_FAILED');
  const details = error?.refinementDetails || {};
  const result = { errorCode: code };
  if(/^CLQ_[A-Z0-9_]+$/.test(error?.auditReasonCode||''))result.auditReasonCode=error.auditReasonCode;
  const replayStatus=error?.privateReplayStatus||error?.refinementDetails?.privateReplayStatus;
  if(['saved','disabled','size-limit','redirected-path','linked-file','local-write-unavailable'].includes(replayStatus))result.privateReplayStatus=replayStatus;
  if (Number.isInteger(details.httpStatus)) result.httpStatus = details.httpStatus;
  if (Number.isFinite(details.elapsedMs)) result.elapsedMs = details.elapsedMs;
  for (const key of ['networkCode', 'networkName', 'providerErrorCode', 'providerErrorType', 'providerRequestId']) {
    const value = token(details[key]); if (value) result[key] = value;
  }
  if (details.outputShape) {
    const shape = details.outputShape;
    result.outputItemCount = Number.isInteger(shape.itemCount) ? shape.itemCount : 0;
    result.textBlockCount = Number.isInteger(shape.textBlocks) ? shape.textBlocks : 0;
    result.hasOutputParsed = shape.hasParsed === true;
  }
  const meta=error?.attemptMetadata||{};
  const extra=error?.refinementDetails||{};
  const extended=value=>typeof value==='string'&&/^[A-Za-z0-9_./:-]{1,160}$/.test(value)?value:undefined;
  for(const key of ['requestedModel','returnedModel','responseStatus','incompleteReason','providerErrorCategory']) {
    const value=extended(extra[key]??meta[key]);if(value!==undefined)result[key]=value;
  }
  for(const key of ['inputTokens','outputTokens','reasoningTokens','outputTokenBudget','providerReportedCostUsd']) {
    const value=extra[key]??meta[key];if(typeof value==='number'&&Number.isFinite(value)&&value>=0)result[key]=value;
  }
  if(typeof extra.outputAtTokenBudget==='boolean')result.outputAtTokenBudget=extra.outputAtTokenBudget;
  if(!Number.isInteger(result.httpStatus)&&Number.isInteger(meta.httpStatus))result.httpStatus=meta.httpStatus;
  if(result.elapsedMs===undefined&&typeof meta.durationMs==='number')result.elapsedMs=meta.durationMs;
  return result;
}
export function formatRefinementFailure(error) {
  const details = describeRefinementFailure(error);
  let message = safeMessages.has(error?.message) ? error.message : ['REFINEMENT_EVIDENCE_V2_REJECTED','REFINEMENT_EVIDENCE_V2_INPUT'].includes(details.errorCode) ? 'The v2 evidence audit failed its source, permission or completeness checks. Current letter unchanged. No automatic paid retry.' : 'Cover-letter refinement is currently unavailable.';
  if (details.auditReasonCode) message += ' Audit reason: '+details.auditReasonCode+'.';
  if (details.providerErrorCategory) message += ' Provider category: '+details.providerErrorCategory+'.';
  if (details.privateReplayStatus) message += ' Private replay: '+details.privateReplayStatus+'.';
  if (details.httpStatus) message += ` Provider HTTP status: ${details.httpStatus}.`;
  if (details.networkCode) message += ` Network error: ${details.networkCode}.`;
  return `[${details.errorCode}] ${message} Details: Maintenance, "Recent polishing and letter errors".`;
}
