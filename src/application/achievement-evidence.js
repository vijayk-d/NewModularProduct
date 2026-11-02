import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
export const canonicalCvText=text=>String(text??'').replace(/\r\n?/g,'\n').trim();
function bad(message,statusCode=400){throw Object.assign(new Error(message),{statusCode,code:'ACHIEVEMENT_EVIDENCE_INVALID'});}
export function achievementCatalogue({text,roleCode,roleName='',jobDescriptionText=''}={}){
 const source=canonicalCvText(text);if(!source||source.length>120000)bad('CV text is empty or exceeds the evidence limit.',422);
 const sourceHash=sha(source),items=[],seen=new Set(),terms=new Set(String(jobDescriptionText).toLowerCase().match(/[a-z][a-z-]{3,}/g)||[]);
 const result=/\b(?:achieved|delivered|reduced|increased|improved|saved|generated|accelerated|cut|grew|enabled|launched|implemented|transformed|established|streamlined|secured|eliminated|decreased|raised|boosted)\b/i;
 // Never join separate paragraphs/bullets or infer employer, date or contribution ownership.
 for(const m of source.matchAll(/[^\n]+(?:\n(?!\s*(?:\n|[•●▪*-]\s))[^\n]+)*/g)){
  const quote=m[0].trim(),text=quote.replace(/^[•●▪*-]\s*/u,'').replace(/\s+/g,' ').trim(),start=m.index,end=start+m[0].length;
  if(text.length<35||text.length>1400||!result.test(text)||/^(?:will|aim|plan|target|seeking|objective)\b/i.test(text))continue;
  const context=source.slice(Math.max(0,start-220),Math.min(source.length,end+100));
  if(/[<>]|\{\{|\}\}|https?:|www\.|\b(?:micro\s*1)\b/i.test(text+' '+context)||seen.has(text))continue;
  seen.add(text);
  const signals={method:/\b(?:by|through|using|via)\b/i.test(text),measurement:/(?:[£$€]\s*\d|\b\d+(?:[.,]\d+)?\s*(?:%|million|billion|[mk]\b|hours?\b|people\b|teams?\b|squads?\b|users?\b|projects?\b))/i.test(text),timeframe:/\b(?:within|over|in|during)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:business\s+)?(?:days?|weeks?|months?|years?)\b/i.test(text)};
  const id=sha(roleCode+'\0'+sourceHash+'\0'+start+'\0'+end);
  const relevance=[...new Set(text.toLowerCase().match(/[a-z][a-z-]{3,}/g)||[])].filter(t=>terms.has(t)).length;
  items.push({id,text,quote,start,end,context,signals,relevance,attribution:'Verbatim CV passage. Employer/current-role attribution is not inferred; verify the context before selecting.'});
 }
 // Keep the selectable set source-ordered, so changing JD text cannot change which IDs resolve.
 const selected=items.slice(0,120);
 return {schemaVersion:1,roleCode,roleName,sourceHash,candidates:selected,totalCandidates:items.length,omittedCount:Math.max(0,items.length-selected.length),normalisation:'CRLF to LF; outer whitespace removed'};
}
export function validateAchievementSnapshot(snapshot,{text,roleCode,roleName=''}={}){
 const catalogue=achievementCatalogue({text,roleCode,roleName});
 if(!snapshot||snapshot.schemaVersion!==1||snapshot.roleCode!==roleCode||snapshot.sourceHash!==catalogue.sourceHash||!Array.isArray(snapshot.items)||snapshot.items.length>12)bad('Achievement evidence changed or belongs to another CV. Reload and review it in preparation.',409);
 const map=new Map(catalogue.candidates.map(x=>[x.id,x])),seen=new Set();
 for(const item of snapshot.items){const actual=map.get(item.id);if(!actual||seen.has(item.id)||actual.text!==item.text||actual.quote!==item.quote||actual.start!==item.start||actual.end!==item.end)bad('Saved achievement does not match the selected CV source.',409);seen.add(item.id);}
 return snapshot;
}
export function createAchievementEvidenceService({inventoryRepository,documentExtractor}={}){
 if(typeof inventoryRepository?.load!=='function'||typeof documentExtractor?.extract!=='function')throw new Error('Inventory and document ports are required.');
 async function cvs(){const inv=await inventoryRepository.load(),items=inv.cv_inventory?.cvs||inv.cvs;if(!Array.isArray(items))bad('CV inventory is unavailable.',503);const codes=items.map(x=>String(x.role_code||''));if(codes.some(x=>!/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(x))||new Set(codes).size!==codes.length)bad('CV role codes require review.',503);return items;}
 async function load({roleCode,jobDescriptionText=''}={}){
  if(typeof roleCode!=='string'||typeof jobDescriptionText!=='string'||jobDescriptionText.length>100000)bad('Invalid evidence request.');
  const cv=(await cvs()).find(x=>x.role_code===roleCode);if(!cv?.local_path)bad('Select a CV with a configured document.',404);
  let extracted;try{extracted=await documentExtractor.extract({relativePath:cv.local_path});}catch{bad('CV extraction failed. Check CV_FOLDER and the selected document. No provider request was made.',422);}
  return achievementCatalogue({text:extracted?.text,roleCode,roleName:cv.role_name||roleCode,jobDescriptionText});
 }
 return {async roles(){return (await cvs()).map(x=>({roleCode:x.role_code,roleName:String(x.role_name||x.role_code),hasDocument:Boolean(x.local_path)}));},load,
 async resolve({roleCode,sourceHash,ids}={}){
  if(!Array.isArray(ids)||ids.length>12||ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))||new Set(ids).size!==ids.length)bad('Choose at most twelve distinct achievement checkboxes.');
  const catalogue=await load({roleCode});if(catalogue.sourceHash!==sourceHash)bad('CV evidence changed. Reload the checklist and review your choices.',409);
  const map=new Map(catalogue.candidates.map(x=>[x.id,x]));if(ids.some(id=>!map.has(id)))bad('A selected achievement is not in this CV evidence.',409);
  return {schemaVersion:1,roleCode,roleName:catalogue.roleName,sourceHash,items:ids.map(id=>{const {text,quote,start,end,signals,attribution}=map.get(id);return {id,text,quote,start,end,signals,attribution};})};
 }};
}
