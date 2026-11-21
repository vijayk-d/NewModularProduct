import {partitionQueueSelection,skipSummary} from './outreach-bulk.js';
export const SCHEDULE_MAX=20;
export function resolveScheduleTimer(choice,localValue,now=Date.now()){
 let due;
 if(choice==='15m')due=new Date(now+15*60000);
 else if(choice==='1h')due=new Date(now+60*60000);
 else if(choice==='tomorrow9'){due=new Date(now);due.setDate(due.getDate()+1);due.setHours(9,0,0,0);}
 else if(choice==='custom'){
  if(typeof localValue!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(localValue))throw Error('Choose a complete local date and time.');
  due=new Date(localValue);const parts=localValue.match(/\d+/g).map(Number);
  if(!Number.isFinite(due.getTime())||[due.getFullYear(),due.getMonth()+1,due.getDate(),due.getHours(),due.getMinutes()].some((v,i)=>v!==parts[i]))throw Error('This local date/time is invalid or does not exist because of a clock change.');
 }else throw Error('Choose a supported timer option.');
 if(!Number.isFinite(due.getTime())||due.getTime()<now+120000||due.getTime()>now+30*86400000)throw Error('Choose a shared time at least two minutes and at most 30 days ahead.');
 return due.toISOString();
}
export const SCHEDULE_SPACING_MS=60000;
// One time per message: the first at dueAt, then spacingMs apart (0 = all at the same time).
export function staggeredTimes(dueAt,count,spacingMs=0){const base=Date.parse(dueAt);return Array.from({length:count},(_,i)=>new Date(base+i*spacingMs).toISOString());}
export async function executeBulkSchedule({items,ids,dueAt,timeZone,api,save,confirm,onProgress=()=>{},isStopped=()=>false,now=Date.now,spacingMs=0}){
 const selection=partitionQueueSelection(items,ids,'send'),results=[...selection.skipped],prepared=[];let approved=false,stop=false;
 if(!selection.eligible.length)return {results,confirmed:false,deferred:[]};
 // At most SCHEDULE_MAX per review: the first ones form this batch, the rest stay selected for the next batch.
 const batch=selection.eligible.slice(0,SCHEDULE_MAX),deferred=selection.eligible.slice(SCHEDULE_MAX).map(i=>i.id),times=staggeredTimes(dueAt,batch.length,spacingMs);
 if(!Number.isFinite(Date.parse(dueAt))||Date.parse(dueAt)<now()+120000)throw Error('Choose a future shared sending time.');
 try{
  for(const item of batch){
   if(isStopped())throw Error('Schedule preparation stopped. Nothing scheduled by this review.');
   onProgress({stage:'preparing',index:prepared.length+1,total:batch.length,email:item.email});
   const due=times[prepared.length];await save(item.id);const p=await api('/api/outreach-scheduling/prepare',{queueId:item.id,dueAt:due,timeZone});
   if(typeof p.approval!=='string')throw Error('Invalid scheduling approval. Nothing submitted by preparation.');
   prepared.push({item,prepared:p});
   if(!['new','draft'].includes(p.mode)||Date.parse(p.dueAt)!==Date.parse(due)||p.timeZone!==timeZone||!Number.isFinite(p.expiresAt))throw Error('Message action, shared time or approval changed. Prepare the selection again.');
  }
  if(prepared.some(p=>p.prepared.expiresAt<=now()+30000))throw Error('Reviews are too near expiry. Choose a smaller fresh selection.');
  if(isStopped()||!await confirm({prepared,results,selectedCount:new Set(ids).size,dueAt,timeZone,items,deferred:deferred.length,spacingMs}))return {results:[...results,...prepared.map(p=>({id:p.item.id,email:p.item.email,kind:'cancelled',message:'Schedule approval cancelled. No schedule submitted.'}))],confirmed:false,deferred};
  approved=true;
  for(const [index,p] of prepared.entries()){
   if(stop||isStopped()||p.prepared.expiresAt<=now()||Date.parse(dueAt)<now()+120000){results.push(...prepared.slice(index).map(x=>({id:x.item.id,email:x.item.email,kind:'not_submitted',message:'Batch stopped or review/time expired before submission. No replacement was created.'})));break;}
   onProgress({stage:'scheduling',index:index+1,total:prepared.length,email:p.item.email});
   try{const r=await api('/api/outreach-scheduling/commit',{approval:p.prepared.approval,confirmed:true,repeatApproved:false});
    if(!r.job||typeof r.job.id!=='string')throw Error('No durable schedule receipt.');
    const accepted=r.job.status==='AWAITING_CLOUD';results.push({id:p.item.id,email:p.item.email,kind:accepted?'awaiting_cloud':'publication_unconfirmed',jobId:r.job.id,message:r.job.id+' | '+r.job.status+' | '+(r.job.note||'')});if(!accepted)stop=true;
   }catch{results.push({id:p.item.id,email:p.item.email,kind:'uncertain',message:'Schedule publication unconfirmed. Refresh schedules and inspect the existing reservation; do not schedule this item again.'});stop=true;}
  }
  return {results,confirmed:approved,deferred};
 }finally{
  if(prepared.length)try{await api('/api/outreach-scheduling/discard',{approvals:prepared.map(p=>p.prepared.approval)});}catch{/* Reviews expire; discarding must never reset durable reservations. */}
 }
}
function element(doc,tag,text){const n=doc.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;}
const localTime=(iso,timeZone)=>{try{return new Date(iso).toLocaleString('en-GB',{timeZone});}catch{return iso;}};
export function showScheduleApproval({prepared,results,dueAt,timeZone,items=[],deferred=0,spacingMs=0},doc=document){
 const first=prepared[0]?.prepared.dueAt||dueAt,last=prepared.at(-1)?.prepared.dueAt||dueAt;
 const timeLine=spacingMs&&prepared.length>1?'First email: '+localTime(first,timeZone)+', last: '+localTime(last,timeZone)+' '+timeZone+' (one minute apart, so none can miss the 15-minute late window) | UTC: '+first+' to '+last:'Shared time: '+localTime(dueAt,timeZone)+' '+timeZone+' | UTC: '+dueAt;
 const dialog=element(doc,'dialog');if(typeof dialog.showModal!=='function')throw Error('Scheduling review dialog is unavailable in this browser.');dialog.className='outreach-bulk-confirm';dialog.setAttribute('aria-label','Approve selected scheduled emails');
 dialog.append(element(doc,'h2','Schedule '+prepared.length+' emails?'),element(doc,'p',timeLine),element(doc,'p',results.length+' selected rows skipped. The reviewed message and attachment bytes will be uploaded to your private scheduler Sheet. Existing Gmail drafts are retained: do not send them separately. Approval authorises future sending without another prompt, including while this PC is off.'));
 if(deferred)dialog.append(element(doc,'p',deferred+' more selected '+(deferred===1?'row stays':'rows stay')+' ticked for the next batch (at most '+SCHEDULE_MAX+' per approval).'));
 const identities=prepared.map(p=>p.item.contactId||p.item.fullName||p.item.id);if(new Set(identities).size<identities.length)dialog.append(element(doc,'p','Multiple selected addresses may belong to the same contact. Check for duplicate outreach.'));const earlier=new Set(items.filter(i=>i.status==='sent').map(i=>i.contactId).filter(Boolean));if(prepared.some(p=>p.item.contactId&&earlier.has(p.item.contactId)))dialog.append(element(doc,'p','A selected contact has a sent row at another address. Check whether this repeats outreach.'));
 const warnings=prepared.filter(p=>!p.prepared.emailVerified).length;if(warnings)dialog.append(element(doc,'p',warnings+' recipient addresses are unverified/inferred. Check them carefully.'));
 for(const p of prepared){const detail=element(doc,'details'),r=p.prepared;detail.append(element(doc,'summary',localTime(r.dueAt||dueAt,timeZone)+' · '+r.recipient+' — '+r.subject),element(doc,'p','From: '+r.sendingAccount+' | '+(r.mode==='draft'?'Frozen current Gmail draft':'Frozen new email')),element(doc,'pre',r.bodyPlainText),element(doc,'p','Attachments: '+JSON.stringify(r.attachments||[])));dialog.append(detail);}
 dialog.append(element(doc,'p','Messages are dispatched individually. Uploaded is not cloud-confirmed. The existing 15-minute late window applies, and uncertain outcomes are never automatically retried.'));
 const cancel=element(doc,'button','Cancel'),approve=element(doc,'button','Approve and schedule '+prepared.length+' emails');cancel.type=approve.type='button';cancel.autofocus=true;dialog.append(cancel,approve);
 return new Promise(resolve=>{dialog.addEventListener('close',()=>{const ok=dialog.returnValue==='approve';dialog.remove();resolve(ok);},{once:true});cancel.addEventListener('click',()=>dialog.close('cancel'));approve.addEventListener('click',()=>dialog.close('approve'));doc.body.appendChild(dialog);dialog.showModal();});
}
export function attachOutreachSchedule({section,getItems,getIds,api,save,refresh,getBusy,setBusy,getSendingReady=()=>true,renderResults,isLeaving=()=>false,doc=document}){
 const toolbar=section.querySelector('.outreach-bulk-toolbar'),status=section.querySelector('.outreach-queue-status');
 const button=element(doc,'button','Schedule (0)');button.type='button';button.dataset.queueAction='schedule-selected';
 const send=section.querySelector('[data-queue-action="send-selected"]');send.after(button);
 const pick=element(doc,'button','Select next '+SCHEDULE_MAX+' schedulable');pick.type='button';pick.dataset.queueAction='select-schedulable';pick.title='Ticks up to '+SCHEDULE_MAX+' rows that can be scheduled now, skipping sent and blocked rows. Other rows are unticked.';button.after(pick);
 const filterLabel=element(doc,'label'),filter=element(doc,'input');filter.type='checkbox';filter.dataset.queueFilter='schedulable';filterLabel.className='outreach-schedulable-filter';filterLabel.append(filter,element(doc,'span',' Show only schedulable rows'));toolbar.append(filterLabel);
 const panel=element(doc,'section');panel.hidden=true;panel.className='outreach-schedule-panel';panel.append(element(doc,'h3','Schedule the selected outreach emails'));
 const timerLabel=element(doc,'label','Timer '),timer=element(doc,'select');timer.setAttribute('aria-label','Shared schedule timer');for(const [value,label]of [['15m','In 15 minutes'],['1h','In 1 hour'],['tomorrow9','Tomorrow at 09:00'],['custom','Choose date and time']]){const o=element(doc,'option',label);o.value=value;timer.append(o);}timer.value='15m';timerLabel.append(timer);
 const dateLabel=element(doc,'label',' Shared date and time '),date=element(doc,'input');date.type='datetime-local';date.setAttribute('aria-label','Shared scheduled date and time');dateLabel.append(date);dateLabel.hidden=true;
 const manage=element(doc,'a','Scheduled emails');manage.href='/outreach-scheduling';button.after(manage);
 const spacingLabel=element(doc,'label'),spacing=element(doc,'input');spacing.type='checkbox';spacing.checked=true;spacing.setAttribute('aria-label','Space emails one minute apart');spacingLabel.append(spacing,element(doc,'span',' Space emails one minute apart (recommended)'));
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;const note=element(doc,'p','Timezone: '+zone+'. Presets resolve once for the whole selection at review. The final approval shows UTC too.');
 const preview=element(doc,'button','Review selected schedules'),close=element(doc,'button','Close timer'),check=element(doc,'button','Refresh scheduled statuses');preview.type=close.type=check.type='button';panel.append(timerLabel,dateLabel,spacingLabel,note,preview,close,check);status.after(panel);
 let ready=false,jobs=[],ownBusy=false;
 function decorate(){for(const cell of section.querySelectorAll('[data-queue-status]')){cell.querySelector('[data-scheduler-badge]')?.remove();const matching=jobs.filter(j=>j.queueId===cell.dataset.queueStatus);if(!matching.length)continue;const job=matching.at(-1);let when=job.dueAt;try{when=new Date(job.dueAt).toLocaleString('en-GB',{timeZone:job.timeZone});}catch{}const badge=element(doc,'span',' | '+job.status+' — '+when+' '+(job.timeZone||''));badge.dataset.schedulerBadge='true';badge.title=job.note||'';cell.append(badge);}}
 const boxes=()=>[...section.querySelectorAll('.outreach-queue-checkbox')];
 const schedulable=()=>{const items=getItems();return new Set(items.filter(i=>partitionQueueSelection(items,[i.id],'send').eligible.length===1).map(i=>i.id));};
 const rowOf=box=>box.closest?.('tr')||box.closest?.('label')||box;
 function applyFilter(){const ok=schedulable();for(const box of boxes()){const hide=filter.checked&&!ok.has(box.value);rowOf(box).hidden=hide;if(hide&&box.checked)box.checked=false;}}
 function sync(){applyFilter();for(const box of boxes())box.disabled=ownBusy||getBusy();const selection=partitionQueueSelection(getItems(),getIds(),'send'),total=selection.eligible.length,count=Math.min(total,SCHEDULE_MAX);button.textContent='Schedule ('+count+(total>SCHEDULE_MAX?' of '+total:'')+')';button.disabled=ownBusy||getBusy()||!ready||!getSendingReady()||!count;button.title=!ready?'Scheduling is disabled or unavailable.':!count&&selection.skipped.length?'Cannot schedule: '+skipSummary(selection):total>SCHEDULE_MAX?'The first '+SCHEDULE_MAX+' eligible rows go in this batch; the other '+(total-SCHEDULE_MAX)+' stay ticked for the next.':'Choose one sending time for the checked eligible rows.';button.setAttribute('aria-label','Schedule '+count+' selected eligible recipients');preview.disabled=ownBusy||getBusy()||!ready||!getSendingReady()||!count;pick.disabled=ownBusy||getBusy()||!schedulable().size;filter.disabled=ownBusy||getBusy();decorate();}
 pick.addEventListener('click',()=>{if(ownBusy||getBusy())return;const ok=schedulable(),items=getItems();let n=0;const scopes=new Set();for(const box of boxes()){const item=items.find(i=>i.id===box.value),scope=item?.applicationKey?item.applicationKey+'|'+String(item.email||'').toLowerCase():box.value;const take=n<SCHEDULE_MAX&&ok.has(box.value)&&!rowOf(box).hidden&&!scopes.has(scope);if(take){n++;scopes.add(scope);}box.checked=take;}status.textContent=n?n+' schedulable '+(n===1?'row':'rows')+' selected. Choose Schedule to pick a time.':'No rows can be scheduled now.';boxes()[0]?.dispatchEvent?.(new Event('change',{bubbles:true}));sync();});
 filter.addEventListener('change',()=>{sync();boxes()[0]?.dispatchEvent?.(new Event('change',{bubbles:true}));});
 async function withLock(fn){if(ownBusy||getBusy())return;ownBusy=true;setBusy(true);const controls=[...section.querySelectorAll('button,input,select,textarea')],states=controls.map(x=>x.disabled);controls.forEach(x=>x.disabled=true);try{await fn();}catch(e){status.textContent=e.message;}finally{controls.forEach((x,i)=>{x.disabled=states[i];});ownBusy=false;setBusy(false);sync();}}
 async function loadJobs(remote=false){const r=await api('/api/outreach-scheduling/list',{refresh:remote});if(!Array.isArray(r.jobs))throw Error('Invalid schedule status response.');jobs=r.jobs;decorate();}
 button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(getBusy()||ownBusy)return;panel.hidden=!panel.hidden;if(!panel.hidden){timer.focus();note.textContent=getIds().length+' selected; up to '+SCHEDULE_MAX+' eligible rows go in one batch. Timezone: '+zone+'.';}});
 timer.addEventListener('change',()=>{dateLabel.hidden=timer.value!=='custom';});close.addEventListener('click',()=>{panel.hidden=true;});
 preview.addEventListener('click',()=>withLock(async()=>{
  const ids=[...getIds()],items=getItems().map(i=>({...i})),dueAt=resolveScheduleTimer(timer.value,date.value);status.textContent='Preparing the selected scheduled messages; no schedule submitted yet.';
  const result=await executeBulkSchedule({items,ids,dueAt,timeZone:zone,api,save,isStopped:isLeaving,spacingMs:spacing.checked?SCHEDULE_SPACING_MS:0,confirm:data=>showScheduleApproval(data,doc),onProgress:p=>{status.textContent=(p.stage==='preparing'?'Preparing ':'Scheduling ')+p.index+'/'+p.total+': '+p.email;}});
  renderResults(result.results);
  const pending=new Set(result.results.filter(r=>['awaiting_cloud','publication_unconfirmed','uncertain'].includes(r.kind)).map(r=>r.id));for(const box of section.querySelectorAll('.outreach-queue-checkbox'))if(pending.has(box.value))box.checked=false;
  try{await refresh();await loadJobs(false);}catch{status.textContent='Batch result retained above. Refresh failed; do not repeat accepted or uncertain items.';return;}
  const uploaded=result.results.filter(r=>r.kind==='awaiting_cloud').length;const left=(result.deferred||[]).length;status.textContent=(result.confirmed?'Batch finished: '+uploaded+' uploaded, awaiting cloud acknowledgement. Check every Batch result; no automatic retry was performed.':'Schedule review cancelled; no new schedule submitted.')+(left?' '+left+' more selected '+(left===1?'row stays':'rows stay')+' ticked for the next batch.':'');
 }));
 check.addEventListener('click',()=>withLock(async()=>{await loadJobs(true);await refresh();status.textContent='Scheduled statuses refreshed. Cancellation remains available on the scheduling management page.';}));
 api('/api/outreach-scheduling/status').then(r=>{ready=r.enabled===true;sync();if(ready)return loadJobs(false);}).catch(e=>{ready=false;button.title=e.message;sync();});
 sync();return {sync};
}
