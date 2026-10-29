export const CLAIM_TYPING_REVISION='motivation-scope-v2';
const clean=s=>String(s??'').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
export function assessMotivationScope(text){
 const s=clean(text);
 if(!s||s.length>2000)return {allowed:false,recognisedInterest:false,reason:'invalid-or-oversized-text'};
 // Positive factual-risk checks, not a mandatory opening/because template.
 if(/[£$€%]|\b(?:per cent|percent)\b/i.test(s))return {allowed:false,recognisedInterest:false,reason:'numeric-or-financial-material-needs-own-check'};
 if(/\b(?:phd|msc|pgce|certifications?|certified|accredited|clearance|eligibility)\b/i.test(s))return {allowed:false,recognisedInterest:false,reason:'qualification-or-eligibility-material-needs-own-check'};
 const withoutPreference=s.replace(/\bI have (?:a |an )?(?:(?:strong|particular|special) )?(?:interest|passion|preference)\b/gi,'I prefer');
 if(/\b(?:I|we)(?:['’](?:ve|d)|\s+(?:have|had))?\s+(?:(?:personally|successfully|previously)\s+)?(?:led|managed|delivered|achieved|reduced|increased|designed|implemented|built|created|conducted|developed|owned|established|saved|coached|hold|possess|bring|offer|lead|manage|deliver|design)\b/i.test(withoutPreference)||/\b(?:I|we)\s+(?:have|had)\b/i.test(withoutPreference)||/\b(?:my|our)\s+(?:experience|expertise|achievements?|track record|qualifications?|certifications?|results|skills)\b/i.test(s)||/\b(?:I am|I'm)\s+(?:(?:a|an)\s+)?(?:expert|qualified|certified|experienced)\b/i.test(s))return {allowed:false,recognisedInterest:false,reason:'candidate-factual-assertion-needs-evidence'};
 const interest=/\b(?:interested|interest(?:s)? me|appeals? to me|drawn to|attract(?:s)? me|resonates? with me|motivates? me|keen on|enthusiastic about|passion for|preference for)\b/i.test(s)&&/\b(?:I|me|my)\b/i.test(s);
 if(!interest&&(/\b(?:I|we)\s+(?:would|will|intend|plan|aim|seek)\b/i.test(s)||/\b(?:first|initial|next)\s+(?:3|6|three|six)\b/i.test(s)))return {allowed:false,recognisedInterest:false,reason:'future-contribution-is-not-motivation'};
 return {allowed:true,recognisedInterest:interest,reason:interest?'role-interest-or-alignment':'uncertain-motivation-requires-human-review'};
}
export const isPureRoleInterest=text=>{const a=assessMotivationScope(text);return a.allowed&&a.recognisedInterest;};
export function normaliseClaimKinds(input){
 const adjustments=[],reviewWarnings=[];
 const claims=input.map((claim,index)=>{
  if(!claim||typeof claim!=='object'||Array.isArray(claim))return claim;
  const scope=assessMotivationScope(claim.draftQuote);
  if(claim.claimType==='prospective'&&scope.allowed&&scope.recognisedInterest){adjustments.push({claimIndex:index,originalType:'prospective',effectiveType:'motivation',reason:'Expression of interest/alignment, not a past achievement or future plan.'});return {...claim,claimType:'motivation'};}
  if(claim.claimType==='motivation'&&scope.allowed&&!scope.recognisedInterest)reviewWarnings.push('Review motivation claim '+index+': its meaning is not established by local wording checks. This is not factual verification.');
  return {...claim};
 });return {claims,adjustments,reviewWarnings};
}
export function assertMotivationKind(claim){
 if(claim.claimType==='motivation'&&!assessMotivationScope(claim.draftQuote).allowed)throw Object.assign(new Error('Motivation includes material requiring its own factual or future-contribution check. Split the claims and retain evidence requirements. Current letter unchanged; no automatic paid retry.'),{code:'REFINEMENT_EVIDENCE_V2_REJECTED',statusCode:400,auditReasonCode:'CLQ_MOTIVATION_SCOPE'});
}
