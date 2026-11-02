const normal=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\u2010-\u2015-]+/gu,' ').trim();
const generic=new Set('a an the and or to of in on at for with as is are be by it this that their our your my how where use using making helping teams team risk solutions work working delivery learning'.split(' '));
export function validateContextualHighlights(selections,body,request={}){
 if(!Array.isArray(selections))return [];
 const jd=normal(request.jobDescriptionText),evidence=normal([request.selectedCvText,request.candidateLinkedInText,...(request.selectedCvHighlights||[]),...(Array.isArray(request.approvedScenarioEvidence)?request.approvedScenarioEvidence.filter(s=>['source-supported','user-confirmed'].includes(s?.evidenceState)&&typeof s?.approvedWording==='string').map(s=>s.approvedWording):[])].filter(Boolean).join('\n'));if(!jd||!evidence)return [];
 const result=[],excluded=[request.organisationName,request.candidateDisplayName,...(request.excludedHighlightEntities||[])].map(normal).filter(Boolean);
 for(const item of selections.slice(0,16)){
  if(!item||['text','context','jdRequirement','evidenceQuote','reason'].some(k=>typeof item[k]!=='string'))continue;
  const {text,context,jdRequirement,evidenceQuote,reason}=item;
  if(text.length<8||text.length>240||/[\r\n<>{}]/.test(text)||context.length>1200||reason.trim().length<12||reason.length>400||jdRequirement.length<12||jdRequirement.length>600||evidenceQuote.length<12||evidenceQuote.length>1000)continue;
  const words=normal(text).match(/[\p{L}\p{N}]+/gu)||[];if(words.length<2||!words.some(w=>w.length>=4&&!generic.has(w))||excluded.includes(normal(text)))continue;
  const ci=String(body).indexOf(context),qi=context.indexOf(text);if(ci<0||qi<0||String(body).indexOf(context,ci+1)>=0||context.indexOf(text,qi+1)>=0)continue;
  if(!jd.includes(normal(jdRequirement))||!evidence.includes(normal(evidenceQuote)))continue;
  const start=ci+qi,end=start+text.length,lineStart=String(body).lastIndexOf('\n',start-1)+1,lineEnd=String(body).indexOf('\n',start),line=String(body).slice(lineStart,lineEnd<0?undefined:lineEnd);
  if(/^(?:Dear\b|I am applying\b|I appreciate the convenience\b|Warm regards|Kind regards|Best regards|Regards|Sincerely|Role details:|Job advert:)/i.test(line.trim()))continue;
  let entityOverlap=false;for(const m of String(body).matchAll(/\b[Aa]t\s+([\p{Lu}][\p{L}\p{N}&'-]*(?:\s+[\p{Lu}][\p{L}\p{N}&'-]*){0,7})(?=\s*[,;])/gu)){const a=m.index+m[0].indexOf(m[1]),b=a+m[1].length;if(start<b&&end>a)entityOverlap=true;}if(entityOverlap)continue;
  if(result.some(r=>start<r.end&&end>r.start))continue;
  result.push({id:'ai-hl-'+start+'-'+end,text,start,end,reason:reason.trim(),jdRequirement:jdRequirement.trim()});if(result.length>=8)break;
 }return result;
}
export function roleConsistencyWarnings(body,jobTitle){const expected=normal(jobTitle);if(!expected)return [];const warnings=[];for(const m of String(body).matchAll(/\bfor the ([^\r\n,.]{2,120}?) opportunity\b/gi))if(normal(m[1])!==expected)warnings.push('Possible role-title drift: "'+m[1]+'" differs from the selected role "'+jobTitle+'". Review against the JD; wording was not rewritten.');return [...new Set(warnings)];}
