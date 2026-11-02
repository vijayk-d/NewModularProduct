export const EVIDENCE_RANKING_VERSION='evidence-ranking-v1.2-reviewed-coverage';
export const CAPABILITY_PROFILES=Object.freeze({
 'AI delivery':['AI delivery','artificial intelligence','AI-enabled','evaluation','adoption','production'],
 'Senior Manager':['strategy','governance','portfolio','budget','leadership','prioritisation'],
 'Delivery Leadership':['delivery','dependencies','risk','recovery','stakeholder','supplier'],
 'Agile Coaching':['coaching','agile','facilitation','continuous improvement','team capability'],
 'Digital Transformation':['transformation','operating model','digital','change','adoption','benefits']
});
export const DEFAULT_WEIGHTS=Object.freeze({requirements:55,scope:20,outcome:15,context:10});
const fail=m=>{throw Error(m);};
const clean=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const lower=s=>clean(s).toLocaleLowerCase('en');
const bounded=(n,label)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)fail('Invalid '+label);return n;};
const has=(text,term)=>{
 const t=lower(text),q=lower(term);if(!q)return false;
 let at=-1;while((at=t.indexOf(q,at+1))!==-1){const a=t[at-1]||'',b=t[at+q.length]||'';if(!/[\p{L}\p{N}]/u.test(a)&&!/[\p{L}\p{N}]/u.test(b))return true;}return false;
};
export function draftRequirements(jd,profile){
 if(typeof jd!=='string'||jd.length>30000)fail('JD must contain at most 30000 characters.');
 if(!Object.hasOwn(CAPABILITY_PROFILES,profile))fail('Choose a capability profile.');
 const groups=[
  ['AI','AI/ML','AI delivery','AI-enabled','artificial intelligence','GenAI','generative AI','machine learning'],
  ['delivery','project delivery','workstreams','programme','portfolio','end-to-end'],
  ['planning','schedules','milestones','forecasting','baselines','PI planning'],
  ['risk','risks','RAID','risk mitigation','issues','blockers','recovery'],
  ['stakeholder','stakeholders','client','clients','leadership','cross-squad'],
  ['reporting','status reports','status reporting','readiness discussions','documentation'],
  ['governance','steering committees','approvals','audit','change control','prioritisation','priority alignment'],
  ['agile','hybrid','coaching','Scrum','facilitation','ceremonies','PI planning'],
  ['integration','integrations','APIs','platform','platforms','Salesforce','core banking'],
  ['adoption','training','handover','service transition','hyper care','support'],
  ['acceptance','UAT','sign-offs','production readiness','go-live','release'],
  ['budget','budgets','cost','financial','commercial','SOW','PO','invoicing','procurement'],
  ['quality','QA','validation','defect','defects','evaluation'],
  ['precision','recall','latency','false positives','model performance','retraining'],
  ['infrastructure','cloud','on-premises','DevOps','GPU','GPUs','datasets','data preparation'],
  ['computer vision','camera','camera streams','edge AI','video analytics','CCTV'],
  ['security','cybersecurity','privacy','data protection','confidential'],
  ['site','permits','logistics','safety','field','mobilization'],
  ...['PMP','PMI','CPMAI','certification','degree','English','Arabic','Saudi Arabia','travel','onsite','Excel','PowerPoint','MS Project','Jira','resource management'].map(t=>[t])
 ];
 const stop=new Set('the and for with including required requirements strong ability maintain coordinate manage project projects ensure ensuring experience knowledge understanding of to in on as or a an is be by at from'.split(' '));
 const lines=jd.split(/\r?\n+/).map(line=>clean(line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/,''))).filter(Boolean);
 const heading=line=>/^(?:key responsibilities|responsibilities|key duties|duties|requirements|required qualifications|minimum qualifications|qualifications|preferred qualifications|preferred|desirable qualifications|nice to have)\s*:?$/i.test(line);
 const structured=lines.some(heading);let section='';const result=[];
 for(const line of lines){
  if(heading(line)){section=/preferred|desirable|nice to have/i.test(line)?'preferred':/requirements|qualifications/i.test(line)?'required':'responsibilities';continue;}
  if(structured&&!section)continue;
  if(line.length<12)continue;
  const pools=groups.filter(g=>g.some(t=>has(line,t)));
  const terms=[];const add=t=>{if(!terms.some(x=>x.toLowerCase()===t.toLowerCase()))terms.push(t);};
  // Round-robin keeps multiple concepts represented within the existing 20-phrase budget.
  for(let i=0;terms.length<20&&i<Math.max(0,...pools.map(p=>p.length));i++)for(const pool of pools){if(pool[i])add(pool[i]);if(terms.length>=20)break;}
  if(!terms.length){for(const t of line.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}/-]*/gu)||[])if(t.length>=4&&!stop.has(t))add(t);}
  const optional=/\b(?:desirable|preferred|advantage|nice to have)\b/i.test(line);
  const strongRequirement=/^(?:must\b|essential\b|mandatory\b|you must\b)|\b(?:is essential|is mandatory|is required|must have)\b/i.test(line);
  const weight=section==='preferred'||optional?1:section==='required'||strongRequirement?3:2;
  result.push({id:'r'+(result.length+1),text:line,weight,terms:terms.slice(0,20),draft:true});
 }
 if(result.length>100)fail('More than 100 requirement lines found. Shorten the JD or prepare requirements in smaller groups; no lines were silently discarded.');
 return result;
}
function requirementsOf(value){
 if(!Array.isArray(value))fail('Requirement map is invalid. Draft the requirements again.');
 if(!value.length)fail('Add at least one requirement using Draft requirements locally or Add requirement.');
 if(value.length>100)fail('There are more than 100 requirements. Remove extra rows.');
 const seen=new Map();
 return value.map((r,index)=>{
  const error=message=>fail('Requirement '+(index+1)+': '+message);
  if(!r||typeof r!=='object'||Array.isArray(r))error('invalid row. Remove it and add the requirement again.');
  if(typeof r.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(r.id))error('invalid internal identifier. Remove this row and add it again.');
  if(seen.has(r.id))error('duplicate identifier with requirement '+seen.get(r.id)+'. Remove and recreate the duplicate row.');
  if(typeof r.text!=='string'||!r.text.trim())error('wording is empty. Fill in Requirement wording or remove this row.');
  if(![1,2,3].includes(r.weight))error('importance is invalid. Choose Essential, Important or Desirable.');
  if(!Array.isArray(r.terms))error('matching phrases are invalid. Recreate this row.');
  if(r.terms.length>20)error('too many matching phrases. Keep at most 20 comma-separated phrases.');
  for(const [i,t] of r.terms.entries()){
   if(typeof t!=='string'||!t.trim())error('matching phrase '+(i+1)+' is blank or invalid. Remove it.');
   if(t.length>100)error('matching phrase '+(i+1)+' exceeds 100 characters. Use a short phrase rather than a full paragraph.');
  }
  seen.set(r.id,index+1);
  return {id:r.id,text:r.text,weight:r.weight,terms:r.terms.map(clean)};
 });
}
export const validateRequirements=value=>requirementsOf(value);
function weightsOf(w){if(!w||Object.keys(w).sort().join(',')!=='context,outcome,requirements,scope'||!Object.values(w).every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||Object.values(w).reduce((a,b)=>a+b,0)!==100)fail('Weights must be nonnegative and total 100.');return {...w};}
// Coverage distinguishes suggestions, human-reviewed support and independent checks.
export function classifyEvidenceRequirement(text){
 const checks=[];const add=(kind,label)=>{if(!checks.some(c=>c.kind===kind&&c.label===label))checks.push({kind,label,status:'not-recorded'});};
 if(/\b(?:bachelor(?:['’]s)?|master['’]s|degree)\b/i.test(text))add('qualification','Degree qualification and field');
 if(/\bPMP\b/i.test(text))add('certification','PMP or explicitly accepted equivalent');
 if(/\bCPMAI\b/i.test(text))add('certification','CPMAI / stated AI project-management training');
 if(/\bcertification\b/i.test(text)&&!checks.some(c=>c.kind==='certification'))add('certification','Stated certification');
 for(const m of text.matchAll(/\b(\d+)\s*(\+)?\s*years?\b/gi))add('experience-duration',m[1]+(m[2]?'+':'')+' years — verify relevant dates and scope');
 for(const name of ['English','Arabic'])if(new RegExp('\\b'+name+'\\b','i').test(text))add('language',name+' proficiency — verify level required by JD');
 if(/\b(?:willingness|willing|available|availability)\b/i.test(text)&&/\b(?:travel|onsite|on-site|relocat)/i.test(text))add('availability','Onsite / travel / relocation willingness');
 for(const name of ['Excel','PowerPoint','MS Project','Jira'])if(text.toLowerCase().includes(name.toLowerCase()))add('tool-proficiency',name);
 if(/enterprise project and resource management systems/i.test(text))add('tool-proficiency','Enterprise project/resource-management system');
 return {checks,compound:/\b(?:including|such as)\b/i.test(text)||(text.match(/[,;]/g)||[]).length>=3};
}
export function summariseEvidenceCoverage(rows,requirements){
 const narrative=requirements.filter(r=>!classifyEvidenceRequirement(r.text).checks.length),ids=new Set(narrative.map(r=>r.id));
 const direct=new Set(),partial=new Set(),leads=new Set(),candidateCovered=new Set(),suggestedKeys=[];
 for(const row of rows){for(const m of row.matches){if(!ids.has(m.requirementId)||m.level<=0)continue;if(m.reviewed&&m.level===1)direct.add(m.requirementId);else if(m.reviewed)partial.add(m.requirementId);else leads.add(m.requirementId);}
  const added=row.matches.filter(m=>ids.has(m.requirementId)&&m.level>0&&!candidateCovered.has(m.requirementId));if(added.length){suggestedKeys.push(row.key);for(const m of added)candidateCovered.add(m.requirementId);}
 }
 return {suggestedKeys,reviewedDirectRequirementIds:[...direct],reviewedPartialRequirementIds:[...partial].filter(id=>!direct.has(id)),lexicalLeadRequirementIds:[...leads].filter(id=>!direct.has(id)&&!partial.has(id)),uncoveredRequirements:narrative.filter(r=>!direct.has(r.id)).map(r=>r.id),verificationChecks:requirements.flatMap(r=>classifyEvidenceRequirement(r.text).checks.map(c=>({...c,requirementId:r.id,requirementText:r.text}))),narrativeRequirementCount:narrative.length};
}

export function rankEvidence({assignments,requirements,weights=DEFAULT_WEIGHTS,reviews={}}){
 const reqs=requirementsOf(requirements),requirementVersion=JSON.stringify(reqs),w=weightsOf(weights),rows=[],excluded=[],seen=new Set();if(!Array.isArray(assignments)||assignments.length>5000||!reviews||typeof reviews!=='object'||Array.isArray(reviews))fail('Invalid ranking input.');
 for(const a of assignments){if(!a||!Array.isArray(a.scenarios))fail('Invalid assignment.');for(const s of a.scenarios){if(typeof a.id!=='string'||typeof s?.id!=='string'||!a.id||!s.id||!Number.isInteger(a.revision)||a.revision<1||!Number.isInteger(s.revision)||s.revision<1)fail('Invalid scenario version identity.');
  const key=JSON.stringify([a.id,s.id]);if(seen.has(key))fail('Duplicate scenario identity.');seen.add(key);const d=s.data||{},wording=clean(d.approvedWording);
  const reasons=[];
  if(d.approved!==true||s.approvalCurrent!==true)reasons.push('not currently approved');
  if(!['source-supported','user-confirmed'].includes(d.evidenceState))reasons.push('ineligible evidence state');
  if(!wording||wording.length>8000)reasons.push('approved wording unavailable');
  if(d.evidenceState==='source-supported'&&(!clean(d.sourceReference)||!clean(d.sourceQuote)))reasons.push('source provenance incomplete');
  if(d.evidenceState==='user-confirmed'&&!clean(d.confirmation))reasons.push('confirmation basis missing');
  if(/\bmicro\s*1\b/i.test([a.data?.title,a.data?.employer,a.data?.client,wording].join(' ')))reasons.push('existing excluded-engagement policy');
  if(reasons.length){excluded.push({key,assignmentId:a.id,scenarioId:s.id,reasons});continue;}
  const review=reviews[key]||{};
  if(review.version!==undefined&&review.version!==`${a.revision}:${s.revision}`)fail('Review is stale; evidence version changed.');
  if((review.matches||review.scope!==undefined||review.outcome!==undefined||review.context!==undefined)&&review.version!==`${a.revision}:${s.revision}`)fail('Reviewed scores must bind the current evidence version.');
  if((review.matches||review.scope!==undefined||review.outcome!==undefined||review.context!==undefined)&&review.requirementVersion!==requirementVersion)fail('Requirement map changed; review scores again.');
  const matches=reqs.map(r=>{
   const classification=classifyEvidenceRequirement(r.text),manual=review.matches?.[r.id];
   if(classification.checks.length){if(manual?.level>0)fail('Requirement '+r.id+' contains an independent verification item. Check qualifications/experience/language/tools separately; split mixed requirements first.');return {requirementId:r.id,level:0,reviewed:false,verificationRequired:true,reason:'Independent verification required; not inferred from achievement wording.',quote:'',matchedTerms:[]};}
   if(manual?.level===1&&classification.compound)fail('Requirement '+r.id+' contains multiple obligations. Split it into smaller requirements before marking direct support, or choose partial support.');
   const matchedTerms=r.terms.filter(t=>has(wording,t));
   if(manual){if(![0,.5,1].includes(manual.level)||typeof manual.reason!=='string'||!manual.reason.trim())fail('Reviewed matches need a level and explanation.');if(manual.level>0&&(!clean(manual.quote)||!wording.includes(clean(manual.quote))))fail('Reviewed match must quote the approved wording.');return {requirementId:r.id,level:manual.level,reviewed:true,reason:manual.reason,quote:clean(manual.quote),matchedTerms};}
   return {requirementId:r.id,level:matchedTerms.length?.5:0,reviewed:false,reason:matchedTerms.length?'Lexical lead only; not proof. Review the approved passage.':'No lexical lead; not evidence of missing experience.',quote:'',matchedTerms};
  });
  if(review.matches&&Object.keys(review.matches).some(id=>!reqs.some(r=>r.id===id)))fail('Review references an unknown requirement.');
  const narrativeWeight=reqs.reduce((sum,r,i)=>sum+(matches[i].verificationRequired?0:r.weight),0);
  const components={requirements:narrativeWeight?matches.reduce((sum,m,i)=>sum+(m.verificationRequired?0:reqs[i].weight*m.level),0)/narrativeWeight:0};
  for(const field of ['scope','outcome','context']){components[field]=review[field]===undefined?0:bounded(review[field],field);if(review[field]!==undefined&&!clean(review.basis?.[field]))fail('Reviewed '+field+' score needs an explanation.');}
  const score=Object.keys(w).reduce((sum,k)=>sum+w[k]*components[k],0);
  rows.push({key,assignmentId:a.id,scenarioId:s.id,version:`${a.revision}:${s.revision}`,title:d.title||s.id,assignmentTitle:a.data?.title||a.id,evidenceState:d.evidenceState,approvedWording:wording,score:Math.round(score*100)/100,components,matches,reviewBasis:review.basis||{},unassessed:['scope','outcome','context'].filter(k=>review[k]===undefined),autoSelected:false});
 }}
 rows.sort((a,b)=>b.score-a.score||(a.key<b.key?-1:a.key>b.key?1:0));
 const coverage=summariseEvidenceCoverage(rows,reqs);
 return {policyVersion:EVIDENCE_RANKING_VERSION,requirementVersion,weights:w,requirements:reqs,rows,excluded,...coverage,notice:'Local relevance aid, not ATS/hiring probability. Lexical leads do not satisfy requirements. Reviewed support is your assessment, not independent verification. Qualifications, experience duration, languages, tools and availability need separate checks. No provider request or saved-library mutation.'};
}
