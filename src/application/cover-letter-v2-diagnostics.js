import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const REASONS={
  "Evidence audit object does not match its contract.": "CLQ_OBJECT_SHAPE",
  "Evidence audit contains invalid text.": "CLQ_REVIEW_TEXT",
  "Evidence audit list exceeds its contract.": "CLQ_LIST_LIMIT",
  "Evidence audit references an unknown or duplicate ID.": "CLQ_REFERENCE_ID",
  "Evidence audit is missing, stale or incomplete.": "CLQ_SNAPSHOT_OR_COMPLETENESS",
  "Evidence audit contains no assessed JD priorities.": "CLQ_NO_REQUIREMENTS",
  "Evidence audit requirement IDs are invalid.": "CLQ_REQUIREMENT_ID",
  "Evidence audit JD quote or support category is invalid.": "CLQ_JD_QUOTE_OR_CATEGORY",
  "Supported requirements need permitted evidence IDs.": "CLQ_SUPPORT_WITHOUT_EVIDENCE",
  "A not-evidenced requirement must not assert supporting evidence.": "CLQ_INCONSISTENT_SUPPORT",
  "An audited claim does not locate a unique draft passage.": "CLQ_DRAFT_PASSAGE",
  "A candidate claim has no supporting source quote.": "CLQ_NO_SOURCE_QUOTE",
  "An audited claim references an unknown or duplicate source.": "CLQ_CLAIM_SOURCE_ID",
  "An evidence quote is not present in its permitted source.": "CLQ_SOURCE_QUOTE",
  "An audited claim exceeds the source permission, including explicit achievement selection.": "CLQ_SOURCE_PERMISSION",
  "An excluded source was used in the evidence audit.": "CLQ_EXCLUDED_SOURCE",
  "Profile text is corroboration, not independent candidate proof.": "CLQ_PROFILE_ONLY",
  "A prospective claim is not explicitly framed as a proposal.": "CLQ_PROSPECTIVE_FRAMING",
  "Numeric results must be audited as outcomes, not capability or prospective claims.": "CLQ_NUMERIC_CLAIM_TYPE",
  "Prospective claims must not introduce numeric outcome promises.": "CLQ_FUTURE_NUMERIC_PROMISE",
  "An audited numeric result is not present in its quoted evidence.": "CLQ_NUMERIC_SOURCE",
  "A numeric outcome in the body is missing from the claim audit.": "CLQ_UNMAPPED_NUMERIC_RESULT",
  "Evidence audit returned unexpected mixed-language review text.": "CLQ_REVIEW_LANGUAGE",
  "Selected CV text is required.": "CLQ_INPUT_CV",
  "The full job description is required.": "CLQ_INPUT_JD",
  "Evidence source is too large.": "CLQ_INPUT_SIZE",
  "Approved achievement selection is malformed.": "CLQ_INPUT_SELECTION",
  "An approved achievement quote is not in the selected CV snapshot.": "CLQ_INPUT_ACHIEVEMENT_QUOTE",
  "Approved scenarios are malformed.": "CLQ_INPUT_SCENARIOS",
  "Approved scenario wording is unavailable.": "CLQ_INPUT_SCENARIO_WORDING"
};
export const auditReason=message=>REASONS[message]||'CLQ_OTHER_RULE';
export function providerCategory(error){const text=String(error?.message||'').toLowerCase();if(/reasoning|effort/.test(text))return 'PROVIDER_REASONING_PARAMETER';if(/schema|response_format|structured output/.test(text))return 'PROVIDER_SCHEMA_OR_FORMAT';if(/model/.test(text)&&/not found|unsupported|unavailable|invalid|does not exist/.test(text))return 'PROVIDER_MODEL_SELECTION';if(/tool|web_search|search/.test(text))return 'PROVIDER_TOOL_CONFIGURATION';if(/max_output_tokens|token/.test(text))return 'PROVIDER_TOKEN_PARAMETER';return 'PROVIDER_INVALID_REQUEST_UNCLASSIFIED';}
export function captureEnabled(env=process.env){return env.ENABLE_COVER_LETTER_V2_PRIVATE_REPLAY==='true'&&env.ENABLE_COVER_LETTER_QUALITY_V2==='true'&&(env.NMP_ENV||'development')==='development'&&String(env.PORT||'3000')==='3000'&&['127.0.0.1','localhost','::1'].includes(env.HOST||'127.0.0.1');}
export function projectCapture(input){
 const fields=['applicationJobTitle','jobDescriptionSummary','jobDescriptionText','selectedCvText','candidateLinkedInText','candidateProfessionalValues','achievementSelectionExplicit','approvedAchievementEvidence','approvedScenarioEvidence','excludedEmployers'];
 const request=Object.fromEntries(fields.filter(k=>input.request?.[k]!==undefined).map(k=>[k,input.request[k]]));
 const base={version:1,kind:input.kind,model:String(input.model||''),savedAt:new Date().toISOString()};
 if(input.kind==='evidence')return {...base,auditReasonCode:String(input.auditReasonCode||'CLQ_OTHER_RULE'),request,result:input.result,body:input.body};
 if(input.kind==='provider')return {...base,providerCategory:providerCategory(input.providerError),httpStatus:input.httpStatus,providerError:{code:String(input.providerError?.code||''),type:String(input.providerError?.type||''),message:String(input.providerError?.message||'').slice(0,4000)}};
 throw Error('Unexpected capture kind.');
}
export async function savePrivateFailure(input,{env=process.env,root=fileURLToPath(new URL('../../',import.meta.url))}={}){
 if(!captureEnabled(env))return {saved:false,reason:'disabled'};
 try{
  root=await fs.realpath(root);const dir=path.join(root,'output','cover-letter-v2-diagnostics');await fs.mkdir(dir,{recursive:true});
  if(await fs.realpath(dir)!==path.join(root,'output','cover-letter-v2-diagnostics'))return {saved:false,reason:'redirected-path'};
  const file=path.join(dir,'last-failure.json');try{if((await fs.lstat(file)).isSymbolicLink())return {saved:false,reason:'linked-file'};}catch(e){if(e.code!=='ENOENT')throw e;}
  const raw=JSON.stringify(projectCapture(input),null,2);if(Buffer.byteLength(raw)>1048576)return {saved:false,reason:'size-limit'};
  const temp=path.join(dir,'last-failure.tmp');const h=await fs.open(temp,'wx',0o600);try{await h.writeFile(raw);await h.sync();}finally{await h.close();}try{await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}
  return {saved:true};
 }catch{return {saved:false,reason:'local-write-unavailable'};}
}
export function replayCapture(capture,validate){
 if(!capture||capture.version!==1)throw Error('Unrecognised capture.');
 if(capture.kind==='provider')return {kind:'provider',savedAt:capture.savedAt,httpStatus:capture.httpStatus,model:capture.model,providerCategory:providerCategory(capture.providerError),note:'No new API call. Provider message stays in the private capture for local inspection.'};
 if(capture.kind!=='evidence')throw Error('Unexpected capture kind.');
 try{const audit=validate(capture.result,capture.request,capture.body);return {kind:'evidence',savedAt:capture.savedAt,model:capture.model,replay:'passed_current_validator',assessmentStatus:audit.assessmentStatus,note:'This does not establish semantic truth or approve the letter.'};}
 catch(e){return {kind:'evidence',savedAt:capture.savedAt,model:capture.model,replay:'rejected',errorCode:/^REFINEMENT_[A-Z0-9_]+$/.test(e.code||'')?e.code:'LOCAL_REPLAY_FAILED',auditReasonCode:/^CLQ_[A-Z0-9_]+$/.test(e.auditReasonCode||'')?e.auditReasonCode:'CLQ_REASON_UNAVAILABLE',note:'No CV text, draft, source quotes or credentials are printed.'};}
}
