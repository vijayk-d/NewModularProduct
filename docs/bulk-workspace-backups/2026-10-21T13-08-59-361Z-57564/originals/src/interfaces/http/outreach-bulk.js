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
export async function executeBulkSend({items,ids,api,save,confirm,onProgress=()=>{},isStopped=()=>false,now=()=>Date.now(),max=25}){
 const selected=partitionQueueSelection(items,ids,'send'),results=[...selected.skipped],prepared=[];
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
    if(/too many pending|confirmation capacity/i.test(String(e.message||''))){results.push(...selected.eligible.slice(index+1).map(i=>({id:i.id,email:i.email,kind:'not_prepared',message:'Confirmation capacity reached; use a smaller batch.'})));break;}
   }
  }
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
   if(isStopped()){results.push(...fresh.slice(index).map(x=>({id:x.item.id,email:x.item.email,kind:'stopped',message:'Not sent; stopped after the preceding operation.'})));break;}
   onProgress({stage:'sending',index:index+1,total:fresh.length,email:p.item.email});
   try{
    const r=await api('/api/outreach-queue/send-commit',{ticket:p.prepared.ticket,confirmed:true,repeatApproved:false});
    if(r.sent!==true||!r.messageId)throw new Error('No confirmed send receipt. Check Gmail before retrying.');
    results.push({id:p.item.id,email:p.item.email,kind:'sent',message:`Sent messageId: ${r.messageId}`,messageId:r.messageId});
   }catch(e){
    if(e.data?.sent===true&&e.data.messageId)results.push({id:p.item.id,email:p.item.email,kind:'sent_attention',message:`Gmail confirmed ${e.data.messageId}; persistence needs attention. Do not retry.`,messageId:e.data.messageId});
    else results.push({id:p.item.id,email:p.item.email,kind:e.data?.code==='SEND_NOT_ATTEMPTED'?'failed_before_send':'uncertain',message:e.message});
   }
  }
  return {results,confirmed:true};
 }finally{
  // Cancelling an already consumed ticket only frees cache; it never resets a ledger or retries a send.
  await Promise.allSettled(prepared.map(p=>api('/api/outreach-queue/send-cancel',{ticket:p.prepared.ticket})));
 }
}
export function showBulkConfirmation({prepared,results,items,selectedCount},doc=document){
 if(typeof doc.createElement('dialog').showModal!=='function')throw new Error('Bulk confirmation is unavailable in this browser. Use individual Send actions.');
 const dialog=doc.createElement('dialog');dialog.className='outreach-bulk-confirm';dialog.setAttribute('aria-labelledby','outreach-bulk-confirm-title');
 const title=doc.createElement('h2');title.id='outreach-bulk-confirm-title';title.textContent=`Send ${prepared.length} emails now?`;dialog.appendChild(title);
 const intro=doc.createElement('p');intro.textContent=`${selectedCount} selected; ${prepared.length} prepared. ${results.length} skipped/not prepared. No automatic retries. Already-sent rows are excluded.`;dialog.appendChild(intro);
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
