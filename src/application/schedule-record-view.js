const FINAL=new Set(['SENT','CANCELLED','MISSED','BLOCKED']);
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
export function finalReconciled(job){return FINAL.has(job.status)&&job.reconciled===true&&(job.status!=='SENT'||typeof job.messageId==='string'&&job.messageId.length>0);}
export function isClearedRecord(job){return finalReconciled(job)&&Number.isFinite(job.recordViewClearedAt)&&job.recordViewClearedAt>=0;}
export function canClearRecord(job){return finalReconciled(job)&&!isClearedRecord(job);}
export function recordedViewResult(state,includeCleared=false,map=j=>j){const jobs=state.jobs.filter(j=>includeCleared===true||!isClearedRecord(j)),clearedCount=state.jobs.filter(isClearedRecord).length;return {jobs:jobs.map(map),clearedCount,note:clearedCount?'Completed records have been cleared from the active view. Show cleared records to inspect or restore them. History and replay protection are retained.':undefined};}
function selected(state,jobIds){if(!Array.isArray(jobIds)||!jobIds.length||jobIds.length>200||jobIds.some(id=>typeof id!=='string'||!id||id.length>100))fail('Choose 1–200 recorded schedule IDs.',400);const ids=new Set(jobIds),jobs=state.jobs.filter(j=>ids.has(j.id));if(jobs.length!==ids.size)fail('A selected schedule is missing. Reload the recorded list.',404);return jobs;}
export function clearRecordView(state,{jobIds,allCompleted=false,confirmed=false}={},now=Date.now()){
 if(confirmed!==true)fail('Confirm clearing completed records from this view.',400);
 if(typeof allCompleted!=='boolean'||allCompleted&&jobIds!==undefined)fail('Choose explicit IDs or all completed, not both.',400);
 if(!Number.isFinite(now)||now<0)fail('Invalid cleanup timestamp.',400);
 const jobs=allCompleted?state.jobs.filter(canClearRecord):selected(state,jobIds);
 if(jobs.some(j=>!finalReconciled(j)))fail('Pending, uncertain or unreconciled records cannot be cleared. Refresh cloud status first.');
 let cleared=0;for(const job of jobs)if(!isClearedRecord(job)){job.recordViewClearedAt=now;cleared++;}
 return {sent:false,cleared,remaining:recordedViewResult(state).jobs.length,historyRetained:true};
}
export function restoreRecordView(state,{jobIds,confirmed=false}={}){if(confirmed!==true)fail('Confirm restoring the selected records.',400);const jobs=selected(state,jobIds);let restored=0;for(const job of jobs)if(Object.hasOwn(job,'recordViewClearedAt')){delete job.recordViewClearedAt;restored++;}return {sent:false,restored,historyRetained:true};}
