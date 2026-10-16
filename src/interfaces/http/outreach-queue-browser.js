import {renderHistoryRows} from './review-workspace.js';
import {createQueueRole} from './review-flow-view.js';
import {partitionQueueSelection,executeBulkSend,showBulkConfirmation,shortSendLabel} from './outreach-bulk.js';
import { createQueueMessageControl, saveQueuedMessageBeforeDraft } from './queue-message-editor.js';
import { attachSimpleContacts } from './outreach-simple-contacts.js';
function startOutreachQueue() {
  if (document.__outreachQueueAttached) return;
  document.__outreachQueueAttached = true;
  const main = document.querySelector('main');
  if (!main) return;
  const section = document.createElement('section');
  section.className = 'review-section outreach-queue-section';
  section.innerHTML = `<h2>Outreach queue</h2>
    <p>Queued messages are snapshots. Later cover-letter edits do not change them.
    Draft and Send use separate controls. Sending starts disabled until explicitly configured. <a href="/outreach-queue">Open standalone queue</a></p>
    <div class="outreach-bulk-toolbar" role="group" aria-label="Queue actions"><button type="button" data-queue-action="refresh">Refresh</button>
    <button type="button" data-queue-action="draft-direct">Draft (0)</button><button type="button" data-queue-action="send-selected">Send (0)</button>
    <pre class="prepared-draft-payloads" hidden></pre>
    <button type="button" data-queue-action="delete">Remove (0)</button>
    <button type="button" data-queue-action="clear">Clear</button></div>
    <p class="outreach-queue-status" role="status" aria-live="polite"></p>
    <table><thead><tr><th><input type="checkbox" aria-label="Select all queue items" class="queue-select-all"></th>
    <th>Name</th><th>Role</th><th>Email</th><th>Status</th><th>Last outcome</th><th>Message</th><th>Actions</th></tr></thead>
    <tbody class="outreach-queue-body"></tbody></table>
    <section class="confirmed-gmail-draft-panel">
      <h3>Create one reviewed Gmail draft</h3>
      <p>Explicit preview and confirmation only. Sending is disabled. Uncertain outcomes are not retried.</p>
      <button type="button" data-confirmed-draft-action="refresh">Refresh draft feature status</button>
      <button type="button" data-confirmed-draft-action="preview">Review one selected Gmail draft</button>
      <p data-confirmed-draft-status role="status" aria-live="polite"></p>
      <div data-confirmed-draft-preview hidden></div>
      <button type="button" data-confirmed-draft-action="create" disabled>Create this draft in Gmail</button>
    </section>

    <section class="gmail-mailbox-check-panel">
      <h3>Gmail mailbox check</h3>
      <p>Optional authentication/profile check only. This check never creates drafts or sends messages.</p>
      <button type="button" data-mailbox-action="refresh">Refresh Gmail status</button>
      <button type="button" data-mailbox-action="check" disabled>Check configured Gmail mailbox</button>
      <p class="gmail-mailbox-status" role="status" aria-live="polite"></p>
    </section>
`;
  main.appendChild(section);
  const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='/outreach-workflow.css';document.head.appendChild(stylesheet);
  const status = section.querySelector('.outreach-queue-status');
  const tbody = section.querySelector('tbody');
  let bulkQueueItems=[];
  const textCell = (row, value) => { const td = row.insertCell(); td.textContent = value || ''; return td; };
  async function request(url, payload) {
    const response = await fetch(url, payload === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {const error=new Error(result.error || 'Queue request failed.');error.data=result;throw error;}
    return result;
  }
  async function refresh() {
    const { items } = await request('/api/outreach-queue');
    const previousSelection=new Set([...tbody.querySelectorAll('.outreach-queue-checkbox:checked')].map(b=>b.value));
    bulkQueueItems=items;
    tbody.replaceChildren();
    for (const item of items) {
      const row = tbody.insertRow();
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
      checkbox.className = 'outreach-queue-checkbox'; checkbox.value = item.id;checkbox.checked=previousSelection.has(item.id);
      checkbox.setAttribute('aria-label', `Select queued recipient ${item.fullName || item.email}`);
      row.insertCell().appendChild(checkbox);
      textCell(row, item.fullName); const roleCell=row.insertCell();roleCell.appendChild(createQueueRole(item.role));roleCell.className='outreach-role';roleCell.title=item.role||'';
      textCell(row, `${item.email} (${item.verified ? 'verified' : item.emailSource || 'unknown'})`);
      textCell(row, item.status); textCell(row, item.lastOutcome);
      // queue-single-editor-v1
      row.insertCell().appendChild(createQueueMessageControl(item));
      // outreach-actions-hotfix-v1
      const actionCell=row.insertCell();
      const eligible=item.status==='new'||(item.status==='draft_failed'&&item.safeToRetry===true);
      const draftButton=document.createElement('button');
      draftButton.type='button';draftButton.textContent=item.status==='draft_failed'?'Retry draft':'Draft';draftButton.setAttribute('aria-label',draftButton.textContent+' for '+(item.fullName||item.email));
      if(eligible){
        draftButton.dataset.directQueueId=item.id;
        draftButton.disabled=directBusy||!liveDraftConfig?.draftCreationEnabled||!liveDraftConfig?.configurationReady;
        draftButton.addEventListener('click',()=>directDraft([{id:item.id,retryFailed:item.status==='draft_failed'}]));
        draftButton.title='Create a draft only. Nothing is sent.';
      }else{
        draftButton.disabled=true;
        draftButton.title=item.status==='drafted'?'A Gmail draft already exists. Repeat-draft creation is not included yet.':
          'This operation is not eligible for creation. Check its recorded outcome before retrying.';
      }
      actionCell.appendChild(draftButton);
      const sendButton=document.createElement('button');sendButton.type='button';sendButton.dataset.sendQueueId=item.id;
      sendButton.dataset.sendEligible=item.sendAction?.eligible?'true':'false';sendButton.textContent=shortSendLabel(item.sendAction?.label);sendButton.setAttribute('aria-label',sendButton.textContent+' for '+(item.fullName||item.email));
      sendButton.disabled=directBusy||!sendConfiguration?.sendingEnabled||!item.sendAction?.eligible;
      sendButton.title=item.sendAction?.reason||sendConfiguration?.reason||'Sending starts disabled.';
      sendButton.addEventListener('click',()=>sendOne(item));actionCell.appendChild(sendButton);

    }
    if (!items.length) { const td = tbody.insertRow().insertCell(); td.colSpan = 8; td.textContent = 'No recipients queued.'; }
    syncBulkControls();
    return items.length;
  }
  const mailboxPanel=section.querySelector('.gmail-mailbox-check-panel');
  const mailboxStatus=mailboxPanel.querySelector('.gmail-mailbox-status');
  const mailboxCheck=mailboxPanel.querySelector('[data-mailbox-action="check"]');
  let mailboxConfiguration=null;
  async function refreshMailboxStatus(){
    const result=await request('/api/outreach-queue/gmail-status');mailboxConfiguration=result;
    mailboxCheck.disabled=!(result.mailboxCheckEnabled&&result.configurationReady);
    mailboxStatus.textContent=!result.mailboxCheckEnabled?'Mailbox check disabled. Enable ENABLE_GMAIL_MAILBOX_CHECK=true and restart when ready.':
      !result.configurationReady?'Missing settings: '+result.missingSettings.join(', '):
      'Configured sender: '+result.configuredFromAddress+'. Not yet authenticated. Draft creation and sending disabled.';
  }
  mailboxPanel.addEventListener('click',async event=>{
    const button=event.target.closest('[data-mailbox-action]');if(!button)return;
    if(button.dataset.mailboxAction==='refresh'){try{await refreshMailboxStatus();}catch(error){mailboxStatus.textContent=error.message;}return;}
    if(!mailboxConfiguration||!mailboxConfiguration.configurationReady||!mailboxConfiguration.mailboxCheckEnabled)return;
    const expectedAddress=mailboxConfiguration.configuredFromAddress;
    if(!window.confirm(`Check the authenticated Gmail mailbox against ${expectedAddress}? This authenticates and reads the mailbox profile only. No draft is created or sent.`))return;
    mailboxCheck.disabled=true;mailboxStatus.textContent='Checking authenticated mailbox…';
    try {
      const response=await fetch('/api/outreach-queue/check-mailbox',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmed:true,expectedAddress})});
      const result=await response.json();
      if(!response.ok||!result.ok){mailboxStatus.textContent=(result.error||'Mailbox check failed.')+(result.mailbox?' Authenticated mailbox: '+result.mailbox:'');return;}
      mailboxStatus.textContent='Verified mailbox: '+result.mailbox+'. No drafts created or messages sent. Draft permissions have not been tested.';
    }catch{mailboxStatus.textContent='Mailbox check could not complete. No draft created or sent.';}
    finally{mailboxCheck.disabled=false;}
  });
  refreshMailboxStatus().catch(error=>{mailboxStatus.textContent=error.message;});
  const draftPanel=section.querySelector('.confirmed-gmail-draft-panel');
  draftPanel.hidden=true; // Kept for protocol compatibility; no second mandatory review UI.
  const directConfig=document.createElement('p');directConfig.className='direct-draft-configuration';section.querySelector('h2').after(directConfig);
  let directBusy=false,sendConfiguration=null;
  const draftStatus=draftPanel.querySelector('[data-confirmed-draft-status]');
  const previewBox=draftPanel.querySelector('[data-confirmed-draft-preview]');
  const reviewDraftButton=draftPanel.querySelector('[data-confirmed-draft-action="preview"]');
  const createDraftButton=draftPanel.querySelector('[data-confirmed-draft-action="create"]');
  let liveDraftConfig=null,approvedDraftPreview=null,draftBusy=false;
  async function refreshDraftFeature(){
    liveDraftConfig=await request('/api/outreach-queue/gmail-draft-status');
    directConfig.textContent=liveDraftConfig.configurationReady&&liveDraftConfig.draftCreationEnabled?
      `Drafting ready for ${liveDraftConfig.configuredMailbox}. Nothing will be sent.`:
      `Drafting blocked: ${(liveDraftConfig.blockedReasons||[]).join(' ')||'Check configuration.'}`;
    section.querySelectorAll('[data-direct-queue-id]').forEach(button=>button.disabled=directBusy||!liveDraftConfig.draftCreationEnabled||!liveDraftConfig.configurationReady);
    syncBulkControls();const buttonState=gmailDraftButtonState({busy:draftBusy,configuration:liveDraftConfig,preview:approvedDraftPreview});
    reviewDraftButton.disabled=buttonState.previewDisabled;
    createDraftButton.disabled=buttonState.createDisabled;
    const reasons=Array.isArray(liveDraftConfig.blockedReasons)?liveDraftConfig.blockedReasons:[];
    draftStatus.textContent=reasons.length?'Draft review blocked: '+reasons.join(' '):
      'Configured mailbox: '+liveDraftConfig.configuredMailbox+'. Review exactly one selected new queue item. No sending.';
    let environmentBox=draftPanel.querySelector('[data-gmail-loaded-environment]');
    if(!environmentBox){environmentBox=document.createElement('pre');environmentBox.setAttribute('data-gmail-loaded-environment','');environmentBox.setAttribute('aria-label','Gmail environment loaded by this server');draftPanel.appendChild(environmentBox);}
    environmentBox.textContent='Gmail environment loaded by the running server (credential values redacted):\n'+
      (liveDraftConfig.environment||[]).map(row=>row.name+' = '+row.value).join('\n');
  }
  draftPanel.addEventListener('click',async event=>{
    const button=event.target.closest('[data-confirmed-draft-action]');if(!button||draftBusy)return;
    if(button.dataset.confirmedDraftAction==='refresh'){try{await refreshDraftFeature();}catch(error){draftStatus.textContent=error.message;}return;}
    draftBusy=true;reviewDraftButton.disabled=true;createDraftButton.disabled=true;
    try{
      if(button.dataset.confirmedDraftAction==='preview'){
        await refreshDraftFeature();
        if(!liveDraftConfig.draftCreationEnabled||!liveDraftConfig.configurationReady)return;
        approvedDraftPreview=null;previewBox.hidden=true;previewBox.replaceChildren();
        const ids=[...tbody.querySelectorAll('.outreach-queue-checkbox:checked')].map(box=>box.value);
        if(ids.length!==1)throw new Error('Select exactly one new queue item.');
        if(!window.confirm('Review this draft? The app will verify the Gmail mailbox and read the selected CV locally. This step creates no draft and sends nothing.'))return;
        const preview=await request('/api/outreach-queue/gmail-draft-preview',{queueId:ids[0],confirmed:true});
        approvedDraftPreview=preview;
        const account=document.createElement('p');account.textContent='Verified sender: '+preview.sendingAccount;
        const recipient=document.createElement('p');recipient.textContent='Recipient: '+preview.draft.recipient.firstname+' '+preview.draft.recipient.lastname+' <'+preview.draft.recipient.email+'>';
        const subject=document.createElement('p');subject.textContent='Subject: '+preview.draft.subject;
        const attachment=document.createElement('p');attachment.textContent='CV: '+preview.draft.attachment.name+'; '+preview.draft.attachment.sizeBytes+' bytes; SHA-256 '+preview.draft.attachment.sha256;
        const plain=document.createElement('pre');plain.textContent=preview.draft.bodyPlainText;
        const frame=document.createElement('iframe');frame.setAttribute('sandbox','');frame.title='Approved Gmail draft preview';
        frame.srcdoc=`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><body>${preview.draft.bodyHtml}</body>`;
        previewBox.append(account,recipient,subject,attachment,plain,frame);previewBox.hidden=false;
        draftStatus.textContent='Preview ready for five minutes. Nothing created or sent.';
      }else if(button.dataset.confirmedDraftAction==='create'){
        if(!approvedDraftPreview)throw new Error('Review the item first.');
        const preview=approvedDraftPreview;
        if(!window.confirm(`Create exactly one Gmail draft in ${preview.sendingAccount}?\nTo: ${preview.draft.recipient.email}\nSubject: ${preview.draft.subject}\nCV: ${preview.draft.attachment.name}\nThe previewed body and CV bytes are bound to this approval. Nothing is sent.`))return;
        approvedDraftPreview=null;
        const response=await fetch('/api/outreach-queue/gmail-draft-create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticket:preview.ticket,confirmed:true})});
        const result=await response.json();
        draftStatus.textContent=result.error||`Created draft ${result.draftId} in ${result.sendingAccount}. Message ID: ${result.messageId||'unreported'}. Nothing sent.`;
        if(result.error&&result.draftId)draftStatus.textContent+=' Confirmed draft ID: '+result.draftId+'; keep this receipt and do not retry.';
        await refresh();
      }
    }catch(error){draftStatus.textContent=error.message||'Draft action failed. Check Gmail before any retry.';}
    finally{
      draftBusy=false;
      syncBulkControls();const buttonState=gmailDraftButtonState({busy:draftBusy,configuration:liveDraftConfig,preview:approvedDraftPreview});
      reviewDraftButton.disabled=buttonState.previewDisabled;
      createDraftButton.disabled=buttonState.createDisabled;
    }
  });
  refreshDraftFeature().catch(error=>{draftStatus.textContent=error.message;});
  try{attachSimpleContacts();}catch(error){console.error('Contact UI initialization failed; queue/history initialization continues.',error);}
  document.addEventListener('outreach-queue-changed',()=>refresh().catch(error=>status.textContent=error.message));
  const sendStatus=document.createElement('p');section.querySelector('h2').after(sendStatus);
  async function refreshSendFeature(){
    try{sendConfiguration=await request('/api/outreach-queue/send-status');sendStatus.textContent=sendConfiguration.reason;}catch(e){sendConfiguration=null;sendStatus.textContent=e.message;}
    section.querySelectorAll('[data-send-queue-id]').forEach(b=>b.disabled=directBusy||!sendConfiguration?.sendingEnabled||b.dataset.sendEligible!=='true');syncBulkControls();
  }
  async function sendOne(item){
    if(directBusy)return;directBusy=true;const controls=[...section.querySelectorAll('[data-queue-action],[data-direct-queue-id],[data-send-queue-id]')];controls.forEach(b=>b.disabled=true);
    let sent=false,receipt='';try{
      await refreshSendFeature();if(!sendConfiguration?.sendingEnabled)throw new Error(sendStatus.textContent);
      await saveQueuedMessageBeforeDraft(item.id);status.textContent='Preparing the exact email; nothing sent yet.';
      const p=await request('/api/outreach-queue/send-prepare',{queueId:item.id});
      const action=p.mode==='repeat'?'SEND AGAIN':p.mode==='draft'?'SEND EXISTING GMAIL DRAFT':'SEND EMAIL';
      const cv=(p.attachments||[]).map(a=>`${a.name} (${a.sizeBytes} bytes)`).join(', ');
      if(!window.confirm(`${action}?\nFrom: ${p.sendingAccount}\nTo: ${p.recipient}\nSubject: ${p.subject}\nCV: ${cv}\n${p.emailVerified?'':'Address is unverified/inferred. Check it carefully.'}\n${p.mode==='draft'?'This sends the verified current Gmail draft; it may differ from the saved queue view.':''}\nThis sends a real email now. No automatic sending retry.`)){
        try{await request('/api/outreach-queue/send-cancel',{ticket:p.ticket});}catch{}status.textContent='Send cancelled. Nothing sent.';return;
      }
      status.textContent='Sending the confirmed email. Do not repeat the action.';
      const r=await request('/api/outreach-queue/send-commit',{ticket:p.ticket,confirmed:true,repeatApproved:p.mode==='repeat'});
      if(r.sent!==true||!r.messageId)throw new Error('No confirmed send receipt. Check Gmail before retrying.');
      sent=true;receipt=`Sent messageId: ${r.messageId}`;await refresh();await refreshHistory();status.textContent=receipt;
    }catch(e){status.textContent=e.data?.sent&&e.data.messageId?`Gmail confirmed sending ${e.data.messageId}. History persistence uncertain; do not retry.`:sent?receipt+' Refresh failed; do not resend.':e.message;try{await refresh();}catch{}}
    finally{directBusy=false;controls.forEach(b=>b.disabled=false);await refreshSendFeature();section.querySelectorAll('[data-direct-queue-id]').forEach(b=>b.disabled=!liveDraftConfig?.draftCreationEnabled||!liveDraftConfig?.configurationReady);syncBulkControls();}
  }
  const history=document.createElement('section');history.className='review-section';history.innerHTML='<h2>Recorded sent history</h2><p>Application records only, not a full Gmail Sent-folder sync.</p><input type="search" aria-label="Search sent history" placeholder="Name, email or subject"><button type="button" data-history-search>Search</button><button type="button" data-history-refresh>Refresh history</button><p role="status" data-history-status></p><table class="sent-history-table"><thead><tr><th>Recipient</th><th>Subject</th><th>Action</th><th>Sent</th><th>Details</th></tr></thead><tbody></tbody></table><button type="button" data-history-prev>Previous</button><button type="button" data-history-next>Next</button>';main.appendChild(history);const historyTable=history.querySelector('table'),scroll=document.createElement('div');scroll.className='sent-history-scroll';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Recorded sent history; scroll horizontally to view all columns');historyTable.before(scroll);scroll.appendChild(historyTable);let historyPage=1;
  async function refreshHistory(){try{const data=await request(`/api/outreach-queue/send-history?page=${historyPage}&q=${encodeURIComponent(history.querySelector('input').value)}`);historyPage=data.page;const body=history.querySelector('tbody');renderHistoryRows(body,data.items,document);history.querySelector('[data-history-status]').textContent=`${data.total} recorded ${data.total===1?'send':'sends'}${data.pages>1?` · Page ${data.page} of ${data.pages}`:''}`;history.querySelector('[data-history-prev]').disabled=data.page<=1;history.querySelector('[data-history-next]').disabled=data.page>=data.pages;history.querySelector('[data-history-prev]').hidden=data.pages<=1;history.querySelector('[data-history-next]').hidden=data.pages<=1;}catch(e){history.querySelector('[data-history-status]').textContent=e.message;}}
  history.querySelector('[data-history-search]').addEventListener('click',()=>{historyPage=1;refreshHistory();});history.querySelector('[data-history-refresh]').addEventListener('click',refreshHistory);history.querySelector('[data-history-prev]').addEventListener('click',()=>{historyPage=Math.max(1,historyPage-1);refreshHistory();});history.querySelector('[data-history-next]').addEventListener('click',()=>{historyPage++;refreshHistory();});history.querySelector('input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();historyPage=1;refreshHistory();}});
  refreshSendFeature();refreshHistory();
  // outreach-bulk-controls-v1
  const selectionNote=document.createElement('span');selectionNote.className='outreach-selection-count';selectionNote.setAttribute('role','status');selectionNote.setAttribute('aria-live','polite');
  section.querySelector('.outreach-bulk-toolbar').appendChild(selectionNote);
  const stopBulkButton=document.createElement('button');stopBulkButton.type='button';stopBulkButton.textContent='Stop after current';stopBulkButton.hidden=true;
  stopBulkButton.setAttribute('aria-label','Stop bulk sending after the current operation');section.querySelector('.outreach-bulk-toolbar').appendChild(stopBulkButton);
  let stopBulk=false;stopBulkButton.addEventListener('click',()=>{stopBulk=true;stopBulkButton.disabled=true;status.textContent='Stopping after the current operation. An email already sending cannot be recalled here.';});
  function syncBulkControls(){
    const ids=[...tbody.querySelectorAll('.outreach-queue-checkbox:checked')].map(b=>b.value),draft=partitionQueueSelection(bulkQueueItems,ids,'draft'),send=partitionQueueSelection(bulkQueueItems,ids,'send');
    const draftButton=section.querySelector('[data-queue-action="draft-direct"]'),sendButton=section.querySelector('[data-queue-action="send-selected"]'),remove=section.querySelector('[data-queue-action="delete"]');
    draftButton.textContent=`Draft (${draft.eligible.length})`;draftButton.disabled=directBusy||!liveDraftConfig?.draftCreationEnabled||!liveDraftConfig?.configurationReady||!draft.eligible.length;
    sendButton.textContent=`Send (${send.eligible.length})`;sendButton.disabled=directBusy||!sendConfiguration?.sendingEnabled||!send.eligible.length;
    remove.textContent=`Remove (${ids.length})`;remove.disabled=directBusy||!ids.length;
    draftButton.setAttribute('aria-label',`Draft ${draft.eligible.length} selected eligible recipients`);sendButton.setAttribute('aria-label',`Send ${send.eligible.length} selected eligible recipients`);remove.setAttribute('aria-label',`Remove ${ids.length} selected queue rows`);
    section.querySelector('[data-queue-action="refresh"]').disabled=directBusy;section.querySelector('[data-queue-action="clear"]').disabled=directBusy||!bulkQueueItems.length;
    selectionNote.textContent=`${ids.length} selected · ${draft.eligible.length} draftable · ${send.eligible.length} sendable`;
    const master=section.querySelector('.queue-select-all'),total=tbody.querySelectorAll('.outreach-queue-checkbox').length;
    master.checked=total>0&&ids.length===total;master.indeterminate=ids.length>0&&ids.length<total;master.disabled=directBusy||!total;
  }
  section.addEventListener('change',e=>{if(e.target.matches('.outreach-queue-checkbox,.queue-select-all'))syncBulkControls();});
  for(const [action,label] of Object.entries({refresh:'Refresh queue','draft-direct':'Draft selected eligible recipients','send-selected':'Send selected eligible recipients','delete':'Remove selected queue rows','clear':'Clear queue; retain Gmail and history'})){
    const b=section.querySelector(`[data-queue-action="${action}"]`);if(b){b.title=label;b.setAttribute('aria-label',label);}
  }
  function renderBulkResults(results){
    let panel=section.querySelector('.outreach-bulk-results');if(!panel){panel=document.createElement('details');panel.className='outreach-bulk-results';status.after(panel);}
    panel.replaceChildren();const heading=document.createElement('summary');heading.textContent=`Batch results (${results.length})`;panel.appendChild(heading);
    const table=document.createElement('table'),head=table.createTHead().insertRow();for(const label of ['Recipient','Outcome','Details']){const th=document.createElement('th');th.textContent=label;head.appendChild(th);}
    const body=table.createTBody();for(const r of results){const row=body.insertRow();for(const value of [r.email,r.kind.replaceAll('_',' '),r.message])textCell(row,value);}
    panel.appendChild(table);panel.open=results.some(r=>!['sent','cancelled','skipped'].includes(r.kind));
  }
  async function bulkSendSelected(ids){
    if(directBusy)return;directBusy=true;stopBulk=false;stopBulkButton.hidden=false;stopBulkButton.disabled=false;
    const controls=[...section.querySelectorAll('[data-queue-action],[data-direct-queue-id],[data-send-queue-id]')];controls.forEach(b=>b.disabled=true);syncBulkControls();
    try{
      await refreshSendFeature();if(!sendConfiguration?.sendingEnabled)throw new Error(sendConfiguration?.reason||'Sending unavailable.');
      const items=(await request('/api/outreach-queue')).items;
      const batch=await executeBulkSend({items,ids,api:request,save:saveQueuedMessageBeforeDraft,confirm:data=>showBulkConfirmation(data),isStopped:()=>stopBulk,
        onProgress:p=>status.textContent=`${p.stage==='preparing'?'Preparing':'Sending'} ${p.index}/${p.total}: ${p.email}. No automatic retries.`});
      renderBulkResults(batch.results);
      const sent=batch.results.filter(r=>['sent','sent_attention'].includes(r.kind)),uncertain=batch.results.filter(r=>r.kind==='uncertain').length;
      const completed=new Set(sent.map(r=>r.id));tbody.querySelectorAll('.outreach-queue-checkbox').forEach(b=>{if(completed.has(b.value))b.checked=false;});
      const message=`Batch finished: ${sent.length} confirmed sent · ${uncertain} uncertain · ${batch.results.length-sent.length-uncertain} skipped/not sent. See Batch results.`;
      try{await refresh();await refreshHistory();}catch{status.textContent=message+' Refresh failed; do not resend completed rows.';return;}
      status.textContent=message;
    }catch(e){status.textContent=e.message;}
    finally{directBusy=false;stopBulkButton.hidden=true;controls.forEach(b=>b.disabled=false);await refreshSendFeature();section.querySelectorAll('[data-direct-queue-id]').forEach(b=>b.disabled=!liveDraftConfig?.draftCreationEnabled||!liveDraftConfig?.configurationReady);syncBulkControls();}
  }
  async function directDraft(rows){
    if(directBusy||!rows.length)return;
    if(rows.some(row=>row.retryFailed)&&!window.confirm('Retry the definite failed attempt? This creates a draft only; nothing is sent.'))return;
    directBusy=true;let created=0,errors=0;const receipts=[];
    const controls=[...section.querySelectorAll('[data-queue-action],[data-direct-queue-id],[data-send-queue-id]')];controls.forEach(b=>b.disabled=true);
    try{
      await refreshDraftFeature();
      if(!liveDraftConfig.draftCreationEnabled||!liveDraftConfig.configurationReady)throw new Error(directConfig.textContent);
      for(const [index,row] of rows.entries()){
        status.textContent=`Creating draft ${index+1} of ${rows.length}. Do not repeat the action.`;
        try{
          await saveQueuedMessageBeforeDraft(row.id);
          const result=await request('/api/outreach-queue/draft-one',{queueId:row.id,confirmed:true,retryFailed:row.retryFailed===true});
          if(result.created!==true||!result.draftId)throw new Error('No confirmed draft receipt. Check Gmail before retrying.');
          created++;receipts.push(`${row.id}: draft ${result.draftId}; message ${result.messageId||'unreported'}`);
        }catch(error){errors++;receipts.push(`${row.id}: ${error.message}${error.data?.draftId?' Confirmed draft '+error.data.draftId+'; do not retry.':''}`);}
      }
      await refresh();status.textContent=`${created} draft(s) created; ${errors} error(s). Nothing sent.\n${receipts.join('\n')}`;
    }catch(error){status.textContent=error.message+' '+receipts.join(' ');}
    finally{directBusy=false;controls.forEach(b=>b.disabled=false);section.querySelectorAll('[data-direct-queue-id]').forEach(b=>b.disabled=!liveDraftConfig?.draftCreationEnabled||!liveDraftConfig?.configurationReady);await refreshSendFeature();}
  }
  section.querySelector('.queue-select-all').addEventListener('change', event => {
    tbody.querySelectorAll('.outreach-queue-checkbox').forEach(box => { box.checked = event.target.checked; });
  });
  section.addEventListener('click', async event => {
    const button = event.target.closest('[data-queue-action]'); if (!button) return;
    const buttons = [...section.querySelectorAll('[data-queue-action]')];
    if(button.disabled||directBusy)return;
    let saved = false; let message = '';
    try {
      const action = button.dataset.queueAction;
      if (action === 'clear' && !window.confirm('Clear all queue items? Sent-email history will be kept.')) return;
      const ids = [...tbody.querySelectorAll('.outreach-queue-checkbox:checked')].map(box => box.value);
      if (['delete','prepare-drafts','draft-direct','send-selected'].includes(action) && !ids.length) throw new Error('Select at least one queue item.');
      if(action==='draft-direct'){
        const items=(await request('/api/outreach-queue')).items;
        const picked=partitionQueueSelection(items,ids,'draft');
        if(!picked.eligible.length)throw new Error('No selected rows are eligible for drafting.');
        await directDraft(picked.eligible.map(item=>({id:item.id,retryFailed:item.status==='draft_failed'})));
        if(picked.skipped.length){renderBulkResults(picked.skipped);status.textContent+=` ${picked.skipped.length} ineligible/duplicate row(s) skipped.`;}return;
      }
      if(action==='send-selected'){await bulkSendSelected(ids);return;}
      buttons.forEach(b => { b.disabled = true; });
      if(action==='prepare-drafts') {
        const result=await request('/api/outreach-queue/prepare-drafts',{ids});
        const preview=section.querySelector('.prepared-draft-payloads');preview.hidden=false;
        preview.textContent=JSON.stringify({action:'draft',drafts:result.drafts},null,2);
        status.textContent=`${result.prepared} draft payload(s) prepared locally. No Gmail drafts created; nothing sent.`;
        return;
      }
      section.querySelector('.prepared-draft-payloads').hidden=true;
      if (action !== 'refresh') {
        const result = await request(`/api/outreach-queue/${action}`, action === 'clear' ? { confirmed: true } : { ids });
        saved = true; message = `${result.deleted} queue item(s) removed. Sent history kept.`;
      }
      const count = await refresh(); status.textContent = message || `${count} queued recipient(s).`;
    } catch (error) { status.textContent = saved ? message + ' Refresh failed; click Refresh queue.' : error.message; }
    finally { buttons.forEach(b => { b.disabled = false; });syncBulkControls(); }
  });
  refresh().then(count => { status.textContent = `${count} queued recipient(s).`; }).catch(error => { status.textContent = error.message; });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startOutreachQueue, { once: true });
  else startOutreachQueue();
}

export function gmailDraftButtonState({busy=false,configuration=null,preview=null,now=Date.now()}={}) {
  return {previewDisabled:Boolean(busy),createDisabled:Boolean(busy || !configuration?.draftCreationEnabled ||
    !configuration?.configurationReady || !preview?.ticket || typeof preview.expiresAt!=='number' || preview.expiresAt<=now)};
}


