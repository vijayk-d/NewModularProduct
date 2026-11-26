import {createHash} from 'node:crypto';
import {vacancyIdentity} from './vacancy-identity.js';
import {jobImportListOptions,jobError} from './linkedin-job-import.js';
import {isAdvertId,isWebAdvertId,webAdvertId} from './web-advert-import.js';
export const ADVERT_STATUSES=Object.freeze(['new','in_progress','complete','needs_attention']);
const labels={new:'New',in_progress:'In progress',complete:'Complete — email sent',needs_attention:'Needs attention'};
const colours={new:'blue',in_progress:'amber',complete:'green',needs_attention:'red'};
function confirmed(r){return r.status==='sent'&&typeof r.messageId==='string'&&r.messageId.trim()&&!/^local-/i.test(r.messageId)&&typeof r.sendingAccount==='string'&&r.sendingAccount.trim();}
function sourceId(form){const v=vacancyIdentity(form||{});if(v.sourceId.startsWith('linkedin:'))return v.sourceId.slice(9);return v.advertUrl?webAdvertId(v.advertUrl):'';}
export const IDLE_DAYS=14;
const when=v=>{if(typeof v==='number'&&Number.isFinite(v))return v;const n=Date.parse(v);return Number.isFinite(n)?n:0;};
export function deriveAdvertStatus({jobId,reviews=[],queue=[],sent=[],sendAttempts=[],draftOperations=[],exports=[],historyAvailable=true,coverageComplete=true,now=Date.now()}={}){
 if(!isAdvertId(jobId))throw Error('Exact LinkedIn job ID or pasted-advert ID required.');
 const byReview=new Map(reviews.map(r=>[r.id,r.value])),byQueue=new Map(queue.map(r=>[r.id,r]));
 const formFor=r=>{const forms=[r.application,r.formData,r.snapshot?.application,byQueue.get(r.queueId)?.application,byReview.get(r.reviewId)?.formData];return forms.find(f=>typeof f?.jobAdvertLink==='string'&&f.jobAdvertLink.trim())||forms.find(Boolean)||{};};
 const matches=r=>sourceId(formFor(r))===jobId;
 const q=queue.filter(matches),attempts=sendAttempts.filter(matches),drafts=draftOperations.filter(matches),prepared=reviews.filter(r=>sourceId(r.value.formData)===jobId),receipts=new Map();
 const matchingSent=sent.filter(matches);
 for(const r of [...matchingSent,...attempts])if(confirmed(r)){const k=JSON.stringify([r.sendingAccount.trim().toLowerCase(),r.messageId.trim()]);if(!receipts.has(k))receipts.set(k,r);}
 const sends=[...receipts.values()],hasApplied=sends.length>0;
 const uncertain=[...q,...attempts,...drafts].some(r=>['unknown','send_unknown','draft_unknown'].includes(r.status));
 const malformedReceipt=matchingSent.some(r=>!confirmed(r))||attempts.some(r=>r.status==='sent'&&!confirmed(r));
 const orphanSent=q.some(r=>r.status==='sent')&&!hasApplied;
 const needsAttention=!historyAvailable||uncertain||malformedReceipt||orphanSent||(!coverageComplete&&!hasApplied);
 const progressed=prepared.length>0||q.length>0||attempts.length>0||drafts.length>0;
 // Housekeeping: a portal pack export counts as applied through a portal; work idle for IDLE_DAYS needs attention.
 const exported=!hasApplied&&exports.length>0;
 const latest=Math.max(0,...prepared.map(r=>when(r.updatedAt||r.value.updatedAt||r.value.createdAt)),...[...q,...attempts,...drafts].map(r=>when(r.updatedAt||r.createdAt)),...exports.map(r=>when(r.exportedAt)));
 const idle=!needsAttention&&!hasApplied&&!exported&&progressed&&latest>0&&now-latest>=IDLE_DAYS*864e5;
 const status=needsAttention||idle?'needs_attention':hasApplied||exported?'complete':progressed?'in_progress':'new';
 const dates=sends.map(r=>r.sentAt||r.updatedAt).filter(v=>v&&Number.isFinite(Date.parse(v))).sort((a,b)=>Date.parse(b)-Date.parse(a));
 const addresses=new Set(sends.map(r=>String(r.email||r.recipientKey||r.snapshot?.email||'').toLowerCase()).filter(Boolean));
 const pendingRecipientCount=new Set(q.filter(r=>r.status!=='sent'&&!addresses.has(String(r.email||'').toLowerCase())).map(r=>String(r.email||r.id).toLowerCase())).size;
 return {status,label:exported?'Complete — portal pack exported':idle?'Needs attention — no activity for '+IDLE_DAYS+' days':labels[status],colour:colours[status],hasApplied,exported,idle,confirmedSendCount:sends.length,pendingRecipientCount,lastSentAt:dates[0]||null,needsAttention,historyAvailable,coverageComplete,
  reason:idle?'Saved work has had no activity for '+IDLE_DAYS+' days. Continue it or remove the advert.':exported?'Portal application pack exported; no confirmed email send.':!historyAvailable?'History unavailable; status cannot be verified.':uncertain?'A related operation has an uncertain outcome.':malformedReceipt||orphanSent?'A sent marker lacks a valid confirmed send receipt.':hasApplied?'Confirmed email send for this exact advert.':!coverageComplete?'Historical coverage incomplete; no-send status cannot be established.':progressed?'Saved application work exists; no confirmed email send.':'No prior work or confirmed send found in checked local records.'};
}
function reviewRows(store){
 if(!store)throw Error('Review history unavailable.');
 if(typeof store.summaries==='function'){const rows=[];for(let page=1;page<=100;page++){const data=store.summaries({page,size:100});if(!Array.isArray(data.items)||!Number.isInteger(data.pages))throw Error('Invalid review history.');if(data.pages>100)throw Error('Review history exceeds bounded coverage.');for(const summary of data.items){const value=store.get(summary.id);if(value)rows.push({id:summary.id,value,updatedAt:summary.updatedAt});}if(page>=data.pages)return rows;}throw Error('Review history exceeds bounded coverage.');}
 if(typeof store[Symbol.iterator]!=='function')throw Error('Review history unavailable.');
 const values=[...store];if(values.length>10000)throw Error('Review history exceeds bounded coverage.');return values.map(([id,value])=>({id,value}));
}
function readSnapshot(reviews,outreach,exportsSource=null){
 let rows=[],queue=[],sent=[],sendAttempts=[],draftOperations=[],exports=[],historyAvailable=true;
 try{const value=typeof exportsSource==='function'?exportsSource():[];if(Array.isArray(value))exports=value;}catch{}
 try{rows=reviewRows(reviews);if(!outreach)throw Error('Outreach history unavailable.');for(const [key,set]of [['list',v=>queue=v],['listSentEmails',v=>sent=v],['listSendAttempts',v=>sendAttempts=v],['listDraftOperations',v=>draftOperations=v]]){if(typeof outreach[key]!=='function')throw Error('Outreach history unavailable.');const value=outreach[key]();if(!Array.isArray(value)||value.length>100000)throw Error('Outreach history coverage unavailable.');set(value);}}catch{historyAvailable=false;}
 return {reviews:rows,queue,sent,sendAttempts,draftOperations,exports,historyAvailable};
}
export function advertStatusIndex(jobIds,snapshot){
 const grouped=new Map(jobIds.map(id=>[id,{reviews:[],queue:[],sent:[],sendAttempts:[],draftOperations:[],exports:[],historyAvailable:snapshot.historyAvailable,coverageComplete:true}]));
 for(const e of snapshot.exports||[]){const id=sourceId({jobAdvertLink:e.jobAdvertLink});grouped.get(id)?.exports.push(e);}
 const reviewMap=new Map(snapshot.reviews.map(r=>[r.id,r.value])),queueMap=new Map(snapshot.queue.map(r=>[r.id,r])),legacy=new Map();let unidentified=0;
 const remember=(key,id)=>{if(!key||!id)return;const old=legacy.get(key);legacy.set(key,old&&old!==id?'ambiguous':id);};
 for(const id of jobIds)for(const url of ['https://www.linkedin.com/jobs/view/'+id+'/','https://www.linkedin.com/jobs/view/'+id])remember(createHash('sha256').update(url).digest('hex'),id);
 for(const r of snapshot.reviews){const v=vacancyIdentity(r.value.formData||{});if(v.sourceId.startsWith('linkedin:'))remember(v.legacyKey,v.sourceId.slice(9));}
 const formFor=r=>{const forms=[r.application,r.formData,r.snapshot?.application,queueMap.get(r.queueId)?.application,reviewMap.get(r.reviewId)?.formData];return forms.find(f=>typeof f?.jobAdvertLink==='string'&&f.jobAdvertLink.trim())||forms.find(Boolean)||{};};
 for(const key of ['reviews','queue','sent','sendAttempts','draftOperations'])for(const row of snapshot[key]){
  const form=key==='reviews'?row.value.formData:formFor(row);let id=sourceId(form);
  if(!id&&key!=='reviews'){const candidate=legacy.get(row.applicationKey);if(candidate&&candidate!=='ambiguous')id=candidate;}
  if(!id){let knownOtherSource=false;try{const u=new URL(vacancyIdentity(form).advertUrl);knownOtherSource=!(u.hostname==='linkedin.com'||u.hostname.endsWith('.linkedin.com'));}catch{}if(key!=='reviews'&&!knownOtherSource)unidentified++;continue;}
  const group=grouped.get(id);if(!group)continue;
  if(key==='reviews')group.reviews.push(row);else group[key].push({...row,application:{...form,jobAdvertLink:isWebAdvertId(id)?form.jobAdvertLink:'https://www.linkedin.com/jobs/view/'+id+'/'}});
 }
 const statuses=new Map();for(const [id,group]of grouped){group.coverageComplete=unidentified===0;statuses.set(id,deriveAdvertStatus({jobId:id,...group}));}
 return {statuses,coverage:{historyAvailable:snapshot.historyAvailable,unidentifiedHistoricalRecords:unidentified,scope:'Local saved reviews and recorded mail operations only; no full Gmail or portal audit.'}};
}
// Owner's choice wins: an advert marked complete shows as Complete even without a recorded send or export.
export function markedComplete(workflow,completedByYou){if(!completedByYou)return workflow;if(workflow.status==='complete')return {...workflow,completedByYou:true};return {...workflow,status:'complete',label:'Complete — marked by you',colour:'green',needsAttention:false,idle:false,completedByYou:true,reason:'You marked this advert complete: its purpose is served.'};}
export function listAdvertsWithStatus({service,reviews,outreach,exports=null,page=1,pageSize=50,status='all'}){
 const opts=jobImportListOptions({page,pageSize});if(status!=='all'&&status!=='removed'&&!ADVERT_STATUSES.includes(status))throw jobError('Choose a valid advert status.');
 const all=[];for(let p=1;p<=100;p++){const data=service.list({page:p,pageSize:100});if(!Array.isArray(data.items)||!Number.isInteger(data.pages)||data.pages>100)throw jobError('Advert status listing exceeds bounded coverage.',503);all.push(...data.items);if(p>=data.pages)break;}
 const hiddenIds=typeof service.hiddenIds==='function'?service.hiddenIds():new Set(),completedIds=typeof service.completedIds==='function'?service.completedIds():new Set(),removed=all.filter(r=>hiddenIds.has(r.jobId)),visible=all.filter(r=>!hiddenIds.has(r.jobId));
 const snapshot=readSnapshot(reviews,outreach,exports),index=advertStatusIndex(all.map(r=>r.jobId),snapshot),counts=Object.fromEntries(ADVERT_STATUSES.map(s=>[s,0]));
 const items=all.map(r=>{const completedByYou=completedIds.has(r.jobId),workflow=markedComplete(index.statuses.get(r.jobId),completedByYou),isRemoved=hiddenIds.has(r.jobId);if(!isRemoved)counts[workflow.status]++;return {...r,workflow,removed:isRemoved,completedByYou};}).filter(r=>status==='removed'?r.removed:!r.removed&&(status==='all'||r.workflow.status===status));
 const total=items.length,pages=Math.max(1,Math.ceil(total/opts.pageSize)),p=Math.min(opts.page,pages);
 return {items:items.slice((p-1)*opts.pageSize,p*opts.pageSize),page:p,pageSize:opts.pageSize,pages,total,unfilteredTotal:visible.length,removedCount:removed.length,statusCounts:counts,statusFilter:status,coverage:index.coverage};
}
