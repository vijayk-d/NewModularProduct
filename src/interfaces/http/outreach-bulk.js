// outreach-bulk-controls-v1. No automatic retry or implicit repeat sending.
export function partitionQueueSelection(items,ids,kind){
 if(!['draft','send'].includes(kind))throw new Error('Unsupported bulk action.');
 const byId=new Map(items.map(i=>[i.id,i])),eligible=[],skipped=[],scopes=new Set();
 for(const id of new Set(ids)){
  const item=byId.get(id);let reason='';
  if(!item)reason='Row no longer exists.';
  else if(kind==='draft'&&!(item.status==='new'||(item.status==='draft_failed'&&item.safeToRetry===true)))reason='Not a new/safe failed draft.';
  else if(kind==='send'&&(item.status==='sent'||item.sendAction?.mode==='repeat'))reason='Already sent; use explicit row-level Send again.';
  else if(kind==='send'&&!(item.sendAction?.eligible===true&&['new','draft'].includes(item.sendAction.mode)))reason=item.sendAction?.reason||'Not eligible for sending.';
  const scope=item?.applicationKey?JSON.stringify([item.applicationKey,String(item.email||'').toLowerCase()]):id;
  if(!reason&&scopes.has(scope))reason='Same application/address already selected.';
  if(reason)skipped.push({id,email:item?.email||id,kind:'skipped',message:reason});else{scopes.add(scope);eligible.push(item);}
 }
 return {eligible,skipped};
}
export function shortSendLabel(label){return ({'Send email':'Send','Send draft':'Send draft','Send again':'Send again','Retry send':'Retry'})[label]||'Send';}
async function executeSendBatch({items,ids,api,save,confirm,onProgress=()=>{},isStopped=()=>false,now=()=>Date.now(),max=25,beforeCommit=async()=>{}}){
 const selected=partitionQueueSelection(items,ids,'send'),results=[...selected.skipped],prepared=[];let halted=false;
 if(selected.eligible.length>max)throw new Error(`Select at most ${max} eligible messages per send batch.`);
 try{
  for(const [index,item] of selected.eligible.entries()){
   if(isStopped()){results.push(...selected.eligible.slice(index).map(i=>({id:i.id,email:i.email,kind:'stopped',message:'Not prepared; batch stopped.'})));break;}
   onProgress({stage:'preparing',index:index+1,total:selected.eligible.length,email:item.email});
   try{
    await save(item.id);const p=await api('/api/outreach-queue/send-prepare',{queueId:item.id});
    if(typeof p.ticket!=='string'||typeof p.expiresAt!=='number')throw new Error('Invalid preparation receipt.');
    if(!['new','draft'].includes(p.mode)){
     try{await api('/api/outreach-queue/send-cancel',{ticket:p.ticket});}catch{}
     results.push({id:item.id,email:item.email,kind:'skipped',message:'Action changed to repeat sending; use row-level Send again.'});continue;
    }
    prepared.push({item,prepared:p});
   }catch(e){results.push({id:item.id,email:item.email,kind:'not_prepared',message:e.message});
    if(/rate.?limit|quota|too many pending|confirmation capacity/i.test(String(e.message||''))){halted=true;results.push(...selected.eligible.slice(index+1).map(i=>({id:i.id,email:i.email,kind:'stopped',message:'Preparation capacity or provider limit reached; run paused.'})));break;}
    if(/too many pending|confirmation capacity/i.test(String(e.message||''))){results.push(...selected.eligible.slice(index+1).map(i=>({id:i.id,email:i.email,kind:'not_prepared',message:'Confirmation capacity reached; use a smaller batch.'})));break;}
   }
  }
  if(halted){results.push(...prepared.map(p=>({id:p.item.id,email:p.item.email,kind:'stopped',message:'Run paused before confirmation; nothing sent.'})));return {results,confirmed:false,halted:true};}
  const fresh=[];
  for(const p of prepared){
   if(p.prepared.expiresAt<=now()+10000){results.push({id:p.item.id,email:p.item.email,kind:'not_prepared',message:'Confirmation expired or too near expiry; use a smaller fresh batch.'});try{await api('/api/outreach-queue/send-cancel',{ticket:p.prepared.ticket});}catch{}}
   else fresh.push(p);
  }
  if(!fresh.length)return {results,confirmed:false};
  if(isStopped()||!await confirm({prepared:fresh,results,items,selectedCount:new Set(ids).size})){
   results.push(...fresh.map(p=>({id:p.item.id,email:p.item.email,kind:'cancelled',message:'Nothing sent; confirmation cancelled.'})));return {results,confirmed:false};
  }
  for(const [index,p] of fresh.entries()){
   if(!halted&&!isStopped())await beforeCommit();
   if(isStopped()||halted){results.push(...fresh.slice(index).map(x=>({id:x.item.id,email:x.item.email,kind:'stopped',message:'Not sent; stopped after the preceding operation.'})));break;}
   if(p.prepared.expiresAt<=now()+10000){results.push({id:p.item.id,email:p.item.email,kind:'not_prepared',message:'Approval expired or too near expiry before sending. Review a fresh batch explicitly.'});halted=true;continue;}
   onProgress({stage:'sending',index:index+1,total:fresh.length,email:p.item.email});
   try{
    const r=await api('/api/outreach-queue/send-commit',{ticket:p.prepared.ticket,confirmed:true,repeatApproved:false});
    if(r.sent!==true||!r.messageId)throw new Error('No confirmed send receipt. Check Gmail before retrying.');
    results.push({id:p.item.id,email:p.item.email,kind:'sent',message:`Sent messageId: ${r.messageId}`,messageId:r.messageId});
   }catch(e){
    halted=true;
    if(e.data?.sent===true&&e.data.messageId)results.push({id:p.item.id,email:p.item.email,kind:'sent_attention',message:`Gmail confirmed ${e.data.messageId}; persistence needs attention. Do not retry.`,messageId:e.data.messageId});
    else results.push({id:p.item.id,email:p.item.email,kind:e.data?.code==='SEND_NOT_ATTEMPTED'?'failed_before_send':'uncertain',message:e.message});
   }
  }
  return {results,confirmed:true,halted};
 }finally{
  // Cancelling an already consumed ticket only frees cache; it never resets a ledger or retries a send.
  await Promise.allSettled(prepared.map(p=>api('/api/outreach-queue/send-cancel',{ticket:p.prepared.ticket})));
 }
}

// Selection is independent of the internal preparation/confirmation batch size.
export async function executeBulkSend({items,ids,api,save,confirm,onProgress=()=>{},isStopped=()=>false,now=()=>Date.now(),max=25,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(!Number.isInteger(max)||max<1||max>25)throw new Error('Internal batch size must be between 1 and 25.');
 const selected=partitionQueueSelection(items,ids,'send'),results=[...selected.skipped];
 const batchCount=Math.ceil(selected.eligible.length/max);let confirmed=false,previousOperation=false;
 for(let offset=0;offset<selected.eligible.length;offset+=max){
  const batchIndex=Math.floor(offset/max)+1,rows=selected.eligible.slice(offset,offset+max);
  if(isStopped()){results.push(...selected.eligible.slice(offset).map(i=>({id:i.id,email:i.email,kind:'stopped',message:'Not sent; run stopped.'})));break;}
  const result=await executeSendBatch({items,ids:rows.map(i=>i.id),api,save,now,max,isStopped,
   beforeCommit:async()=>{if(previousOperation)await sleep(1000);previousOperation=true;},
   confirm:data=>confirm({...data,selectedCount:new Set(ids).size,batchIndex,batchCount}),
   onProgress:p=>onProgress({...p,index:offset+p.index,total:selected.eligible.length,batchIndex,batchCount})});
  results.push(...result.results);confirmed=confirmed||result.confirmed;
  if(!result.confirmed||result.halted||isStopped()){
   const cancelled=!result.confirmed&&result.results.some(r=>r.kind==='cancelled');
   results.push(...selected.eligible.slice(offset+max).map(i=>({id:i.id,email:i.email,kind:cancelled?'cancelled':'stopped',message:cancelled?'Run cancelled; later batch was not prepared.':'Run paused/stopped; later batch was not prepared. Review results before continuing.'})));
   break;
  }
 }
 return {results,confirmed};
}
export function showBulkConfirmation({prepared,results,items,selectedCount,batchIndex=1,batchCount=1},doc=document){
 if(typeof doc.createElement('dialog').showModal!=='function')throw new Error('Bulk confirmation is unavailable in this browser. Use individual Send actions.');
 const dialog=doc.createElement('dialog');dialog.className='outreach-bulk-confirm';dialog.setAttribute('aria-labelledby','outreach-bulk-confirm-title');
 const title=doc.createElement('h2');title.id='outreach-bulk-confirm-title';title.textContent=`Send ${prepared.length} emails now?`;dialog.appendChild(title);
 const intro=doc.createElement('p');intro.textContent=`${selectedCount} selected; batch ${batchIndex} of ${batchCount}; ${prepared.length} prepared. ${results.length} skipped/not prepared. No automatic retries. Already-sent rows are excluded.`;dialog.appendChild(intro);
 const warning=doc.createElement('p');warning.className='outreach-bulk-warning';
 const unverified=prepared.filter(p=>!p.prepared.emailVerified).length;
 const contactKeys=prepared.map(p=>p.item.contactId||p.item.fullName||p.item.id),duplicates=contactKeys.length-new Set(contactKeys).size;
 const previousContacts=new Set(items.filter(i=>i.status==='sent').map(i=>i.contactId).filter(Boolean));
 const previouslySent=prepared.filter(p=>p.item.contactId&&previousContacts.has(p.item.contactId)).length;
 warning.textContent=[unverified?`${unverified} address(es) are unverified/inferred. Check every address.`:'',duplicates?'Multiple addresses for the same contact are selected.':'',previouslySent?'Some selected contacts already have a sent row at another address. This may repeat outreach.':''].filter(Boolean).join(' ');dialog.appendChild(warning);
 const wrap=doc.createElement('div');wrap.className='outreach-bulk-confirm-scroll';const table=doc.createElement('table');const head=table.createTHead().insertRow();
 for(const text of ['Action','From','To','Subject','CV']){const th=doc.createElement('th');th.textContent=text;head.appendChild(th);}
 const body=table.createTBody();for(const p of prepared){const row=body.insertRow();const value=p.prepared;for(const text of [value.mode==='draft'?'Existing draft':'New email',value.sendingAccount,value.recipient,value.subject,(value.attachments||[]).map(a=>`${a.name} (${a.sizeBytes} bytes; ${String(a.sha256||'').slice(0,8)})`).join(', ')]){const td=row.insertCell();td.textContent=text||'';}}wrap.appendChild(table);dialog.appendChild(wrap);
 const note=doc.createElement('p');note.textContent='This sends real email. Existing-draft rows use the verified current Gmail content, which may differ from the saved queue view.';dialog.appendChild(note);
 const footer=doc.createElement('div');footer.className='outreach-bulk-confirm-actions';const cancel=doc.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.autofocus=true;const send=doc.createElement('button');send.type='button';send.textContent=`Send ${prepared.length} emails`;footer.append(cancel,send);dialog.appendChild(footer);
 return new Promise(resolve=>{dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='send';dialog.remove();resolve(accepted);},{once:true});cancel.addEventListener('click',()=>dialog.close('cancel'));send.addEventListener('click',()=>dialog.close('send'));doc.body.appendChild(dialog);dialog.showModal();});
}

// ONE_CLICK_SEND_V1: explicit labelled click; never a page-load, refresh or automatic retry.
const intentError=m=>Object.assign(new Error(m),{code:'SEND_INTENT_CHANGED'});
const address=s=>String(s||'').trim().toLowerCase();
function clickedRows(items,ids,account,userInitiated){if(userInitiated!==true)throw intentError('An explicit Send click is required.');if(!address(account)||!Array.isArray(items)||!Array.isArray(ids))throw intentError('Sender/selection unavailable. Refresh first.');const map=new Map(items.map(i=>[i.id,structuredClone(i)]));return [...new Set(ids)].map(id=>{const r=map.get(id);if(!r||!/^[a-f0-9]{64}$/.test(r.editVersion||''))throw intentError('Reviewed message version is unavailable. Refresh first.');return r;});}
async function freeze(rows,save,loadItems){const frozen=[];for(const r of rows){const p=await save(r.id);if(!p||p.beforeVersion!==r.editVersion||!/^[a-f0-9]{64}$/.test(p.editVersion||''))throw intentError('The reviewed message changed around the Send click. Refresh/review.');frozen.push({...r,editVersion:p.editVersion});}const fresh=await loadItems(),map=new Map(fresh.map(r=>[r.id,r]));for(const r of frozen){const c=map.get(r.id);if(!c||c.editVersion!==r.editVersion||address(c.email)!==address(r.email)||c.subject!==r.subject||c.status!==r.status||c.sendAction?.mode!==r.sendAction?.mode||!c.sendAction?.eligible||String(c.draftId||'')!==String(r.draftId||''))throw intentError('Selected recipients/messages/actions changed. Nothing new prepared; refresh/review.');}return {frozen,fresh};}
function expected(r,account){return {expectedVersion:r.editVersion,expectedAccount:account,expectedRecipient:r.email,expectedMode:r.sendAction.mode,expectedDraftId:r.draftId||''};}
function valid(p,r,account,now){if(typeof p?.ticket!=='string'||!p.ticket||!Number.isFinite(p.expiresAt)||p.expiresAt<=now()+10000||p.mode!==r.sendAction.mode||address(p.recipient)!==address(r.email)||address(p.sendingAccount)!==address(account))throw intentError('Prepared sender/recipient/action no longer matches the Send click.');}
export async function executeOneClickBulkSend({clickedItems,ids,account,userInitiated=false,api,save,loadItems,onProgress=()=>{},isStopped=()=>false,now=()=>Date.now(),sleep,max=25}){
 const rows=clickedRows(clickedItems,ids,account,userInitiated),picked=partitionQueueSelection(rows,ids,'send');if(!picked.eligible.length)return {results:picked.skipped,confirmed:false};
 const {frozen,fresh}=await freeze(picked.eligible,async id=>{const index=picked.eligible.findIndex(r=>r.id===id);onProgress({stage:'saving',index:index+1,total:picked.eligible.length,email:picked.eligible[index].email});return save(id);},loadItems),map=new Map(frozen.map(r=>[r.id,r]));let blocked='';
 const guarded=async(url,v)=>{if(!url.endsWith('send-prepare'))return api(url,v);const r=map.get(v.queueId);if(!r)throw intentError('Unselected row blocked.');let p;try{p=await api(url,{...v,...expected(r,account)});valid(p,r,account,now);return p;}catch(e){if(p?.ticket)try{await api('/api/outreach-queue/send-cancel',{ticket:p.ticket});}catch{}if(e.code==='SEND_INTENT_CHANGED'||e.data?.code==='SEND_INTENT_CHANGED')blocked=e.message;throw e;}};
 const result=await executeBulkSend({items:fresh,ids:frozen.map(r=>r.id),api:guarded,save:async()=>{},confirm:async data=>{if(blocked||isStopped())return false;try{for(const p of data.prepared)valid(p.prepared,map.get(p.item.id),account,now);return true;}catch(e){blocked=e.message;return false;}},onProgress,isStopped:()=>Boolean(blocked)||isStopped(),now,sleep,max});
 if(blocked)result.results=result.results.map(r=>['cancelled','stopped'].includes(r.kind)?{...r,kind:'stopped',message:blocked}:r);return {...result,results:[...picked.skipped,...result.results]};
}
export async function executeOneClickSend({item,account,userInitiated=false,api,save,loadItems,onStage=()=>{},now=()=>Date.now()}){const r=clickedRows([item],[item.id],account,userInitiated)[0];if(!r.sendAction?.eligible||!['new','draft','repeat'].includes(r.sendAction.mode))throw intentError('This row is not eligible for the labelled send action.');const {frozen}=await freeze([r],save,loadItems);let p;try{onStage('preparing');p=await api('/api/outreach-queue/send-prepare',{queueId:r.id,...expected(frozen[0],account)});valid(p,r,account,now);onStage('sending');const result=await api('/api/outreach-queue/send-commit',{ticket:p.ticket,confirmed:true,repeatApproved:r.sendAction.mode==='repeat'});if(result.sent!==true||!result.messageId)throw intentError('No confirmed send receipt. Check Gmail before retrying.');return result;}finally{if(p?.ticket)try{await api('/api/outreach-queue/send-cancel',{ticket:p.ticket});}catch{}}}
