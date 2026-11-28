import {attachOutreachSchedule} from './outreach-schedule.js';
import {renderHistoryRows} from './review-workspace.js';
import {createQueueRole} from './review-flow-view.js';
import {runSendInBackground,partitionQueueSelection,skipSummary,executeBulkSend,showBulkConfirmation,executeOneClickBulkSend,executeOneClickSend,shortSendLabel} from './outreach-bulk.js';
import { createQueueMessageControl, saveQueuedMessageBeforeDraft, queueSendIntentItem } from './queue-message-editor.js';
import { attachSimpleContacts } from './outreach-simple-contacts.js';
function startOutreachQueue() {
  const scopeReviewId=document.querySelector('input[name="reviewId"]')?.value||'';
  const standalone=window.location.pathname==='/outreach-queue';
  if(!scopeReviewId&&!standalone)return;
  // Unpaged list: bulk Send, Draft and Clear re-read every row at the moment of the action, as before.
  const queueListUrl='/api/outreach-queue'+(scopeReviewId?'?reviewId='+encodeURIComponent(scopeReviewId):'');
  let refreshGeneration=0,leaving=false;
  // Server-side paging: the table shows one page; filters and sorting run on the server before paging.
  const pageSizes=[25,50,100,200],storedSize=Number(globalThis.localStorage?.getItem?.('outreachQueuePageSize'));
  const view={offset:0,limit:pageSizes.includes(storedSize)?storedSize:50,q:'',status:'',sort:'queued',total:0};
  // Ticked rows by id, kept across pages; values are the latest copy of the row (null until loaded).
  const selected=new Map();
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
    <div class="outreach-queue-pager" role="group" aria-label="Queue search and pages">
    <label>Search <input type="search" data-queue-search placeholder="Name, email, role, organisation or subject" aria-label="Search the queue"></label>
    <button type="button" data-queue-search-go aria-label="Run queue search">Search</button>
    <label>Status <select data-queue-status-filter aria-label="Filter by status"><option value="">All statuses</option></select></label>
    <label>Sort <select data-queue-sort aria-label="Sort queue"><option value="queued">Queue order (oldest first)</option><option value="newest">Newest first</option><option value="name">Name</option><option value="status">Status</option><option value="organisation">Organisation</option></select></label>
    <label>Rows per page <select data-queue-page-size aria-label="Rows per page"><option>25</option><option>50</option><option>100</option><option>200</option></select></label>
    <button type="button" data-queue-page="prev" aria-label="Previous page">Previous</button>
    <span data-queue-page-info aria-live="polite"></span>
    <button type="button" data-queue-page="next" aria-label="Next page">Next</button>
    <span class="outreach-queue-page-note" data-queue-select-note>The header tick box and “Select next 20 schedulable” work on this page only; ticks on other pages are kept.</span></div>
    <p class="outreach-queue-status" role="status" aria-live="polite"></p>
    <table><thead><tr><th><input type="checkbox" aria-label="Select all queue items on this page" title="Selects every row on this page only" class="queue-select-all"></th>
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
  // Busy look while an email is being sent or drafted: progress bar and spinner here only; the rest of the page stays usable.
  const progress=document.createElement('div');progress.className='busy-bar';progress.setAttribute('role','progressbar');progress.setAttribute('aria-label','Sending or drafting in progress. Please wait; do not click again.');progress.dataset.queueProgress='';progress.hidden=true;status.after(progress);
  function queueProgress(on){progress.hidden=!on;status.classList.toggle('is-busy',on);section.querySelector('.outreach-bulk-toolbar')?.setAttribute('aria-busy',String(on));}
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
  window.addEventListener('pagehide',()=>{leaving=true;refreshGeneration++;stopBulk=true;});
  // select: queue item ids to tick (the rows you have just queued), on top of what was already ticked.
  function pageUrl(){
    const params=new URLSearchParams();if(scopeReviewId)params.set('reviewId',scopeReviewId);
    params.set('limit',String(view.limit));params.set('offset',String(view.offset));
    if(view.q)params.set('q',view.q);if(view.status)params.set('status',view.status);if(view.sort!=='queued')params.set('sort',view.sort);
    if(section.querySelector('[data-queue-filter="schedulable"]')?.checked)params.set('filter','schedulable');
    return '/api/outreach-queue?'+params.toString();
  }
  // Copies the ticks on the current page into the cross-page selection. Every reader of the selection calls this first,
  // so ticks made by other controls (select all, Select next schedulable, filters) are never lost.
  function reconcileSelection(){
    for(const box of tbody.querySelectorAll('.outreach-queue-checkbox')){
      if(box.checked){if(!selected.get(box.value))selected.set(box.value,bulkQueueItems.find(i=>i.id===box.value)||null);}
      else selected.delete(box.value);
    }
  }
  function selectedIds(){reconcileSelection();return [...selected.keys()];}
  let pageItems=[];
  // Rows the bulk controls know about: this page plus rows ticked on other pages.
  function knownItems(){const onPage=new Set(pageItems.map(i=>i.id));return [...pageItems,...[...selected.values()].filter(i=>i&&!onPage.has(i.id))];}
  function renderPager(data){
    view.total=Number.isSafeInteger(data.total)?data.total:data.items.length;view.offset=Number.isSafeInteger(data.offset)?data.offset:view.offset;
    const pages=Math.max(1,Math.ceil(view.total/view.limit)),page=Math.floor(view.offset/view.limit)+1;
    const first=view.total?view.offset+1:0,last=Math.min(view.total,view.offset+data.items.length);
    const filtered=Number.isSafeInteger(data.scopeTotal)&&data.scopeTotal!==view.total?` (filtered from ${data.scopeTotal})`:'';
    const offPage=selected.size-pageItems.filter(i=>selected.has(i.id)).length;
    section.querySelector('[data-queue-page-info]').textContent=`Page ${page} of ${pages} · ${first}–${last} of ${view.total}${filtered}${offPage>0?` · ${offPage} ticked on other pages`:''}`;
    section.querySelector('[data-queue-page="prev"]').disabled=view.offset<=0;
    section.querySelector('[data-queue-page="next"]').disabled=view.offset+view.limit>=view.total;
    const statusSelect=section.querySelector('[data-queue-status-filter]');
    if(Array.isArray(data.statuses)){const keep=view.status;statusSelect.replaceChildren(new Option('All statuses',''),...[...new Set([...data.statuses,...(keep?[keep]:[])])].map(s=>new Option(s.replaceAll('_',' '),s)));statusSelect.value=keep;}
  }
  async function refresh(select = []) {
    const generation=++refreshGeneration;
    reconcileSelection();for(const id of select)if(!selected.has(String(id)))selected.set(String(id),null);
    const data = await request(pageUrl()),items=data.items;
    if(leaving||generation!==refreshGeneration||(!standalone&&document.querySelector('input[name="reviewId"]')?.value!==scopeReviewId))return 0;
    reconcileSelection();
    // Rows ticked on other pages are re-read, so their status is current and removed rows drop out of the selection.
    const onPage=new Set(items.map(i=>i.id)),offPage=[...selected.keys()].filter(id=>!onPage.has(id));
    if(offPage.length){
      const fresh=await request('/api/outreach-queue/items',{ids:offPage});
      if(leaving||generation!==refreshGeneration)return 0;
      const byId=new Map(fresh.items.map(i=>[i.id,i]));for(const id of offPage){if(byId.has(id))selected.set(id,byId.get(id));else selected.delete(id);}
    }
    for(const item of items)if(selected.has(item.id))selected.set(item.id,item);
    const previousSelection=new Set(selected.keys());
    pageItems=items;bulkQueueItems=knownItems();
    tbody.replaceChildren();
    for (const item of items) {
      const row = tbody.insertRow();
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
      checkbox.className = 'outreach-queue-checkbox'; checkbox.value = item.id;checkbox.checked=previousSelection.has(item.id);
      checkbox.setAttribute('aria-label', `Select queued recipient ${item.fullName || item.email}`);
      row.insertCell().appendChild(checkbox);
      textCell(row, item.fullName); const roleCell=row.insertCell();roleCell.appendChild(createQueueRole(item.role));roleCell.className='outreach-role';roleCell.title=item.role||'';
      textCell(row, `${item.email} (${item.verified ? 'verified' : item.emailSource || 'unknown'})`);
      const queueStatusCell=textCell(row, item.status);queueStatusCell.dataset.queueStatus=item.id; textCell(row, item.lastOutcome);
      // queue-single-editor-v1
      row.insertCell().appendChild(createQueueMessageControl(item));
      // outreach-actions-hotfix-v1
      const actionCell=row.insertCell();
      const blocked=item.letterGate&&item.letterGate.allowed===false;
      const eligible=!blocked&&(item.status==='new'||(item.status==='draft_failed'&&item.safeToRetry===true));
      const draftButton=document.createElement('button');
      draftButton.type='button';draftButton.textContent=item.status==='draft_failed'?'Retry draft':'Draft';draftButton.setAttribute('aria-label',draftButton.textContent+' for '+(item.fullName||item.email));
      if(eligible){
        draftButton.dataset.directQueueId=item.id;
        draftButton.disabled=directBusy||!liveDraftConfig?.draftCreationEnabled||!liveDraftConfig?.configurationReady;
        draftButton.addEventListener('click',()=>directDraft([{id:item.id,retryFailed:item.status==='draft_failed'}]));
        draftButton.title='Create a draft only. Nothing is sent.';
      }else{
        draftButton.disabled=true;
        draftButton.title=blocked?item.letterGate.message:item.status==='drafted'?'A Gmail draft already exists. Repeat-draft creation is not included yet.':
          'This operation is not eligible for creation. Check its recorded outcome before retrying.';
      }
      actionCell.appendChild(draftButton);
      const sendButton=document.createElement('button');sendButton.type='button';sendButton.dataset.sendQueueId=item.id;
      sendButton.dataset.sendEligible=item.sendAction?.eligible?'true':'false';sendButton.textContent=item.sendAction?.mode==='repeat'?'Send again':shortSendLabel(item.sendAction?.label);sendButton.setAttribute('aria-label',sendButton.textContent+' for '+(item.fullName||item.email));
      sendButton.disabled=directBusy||!sendConfiguration?.sendingEnabled||!item.sendAction?.eligible;
      sendButton.title=item.sendAction?.reason||sendConfiguration?.reason||'Sending starts disabled.';
      sendButton.addEventListener('click',()=>sendOne(item));actionCell.appendChild(sendButton);

    }
    if (!items.length) { const td = tbody.insertRow().insertCell(); td.colSpan = 8; td.textContent = view.total||view.q||view.status||section.querySelector('[data-queue-filter="schedulable"]')?.checked?'No queued recipients match these filters.':'No recipients queued.'; }
    renderPager(data);
    syncBulkControls();
    return view.total;
  }
  const pager=section.querySelector('.outreach-queue-pager');
  const reloadFromFirstPage=()=>{view.offset=0;refresh().then(count=>{status.textContent=`${count} queued recipient(s).`;}).catch(error=>{status.textContent=error.message;});};
  pager.querySelector('[data-queue-page-size]').value=String(view.limit);
  pager.querySelector('[data-queue-page-size]').addEventListener('change',event=>{view.limit=Number(event.target.value)||50;try{globalThis.localStorage?.setItem?.('outreachQueuePageSize',String(view.limit));}catch{}reloadFromFirstPage();});
  pager.querySelector('[data-queue-status-filter]').addEventListener('change',event=>{view.status=event.target.value;reloadFromFirstPage();});
  pager.querySelector('[data-queue-sort]').addEventListener('change',event=>{view.sort=event.target.value;reloadFromFirstPage();});
  const search=pager.querySelector('[data-queue-search]');let searchTimer=null;
  const runSearch=()=>{clearTimeout(searchTimer);const q=search.value.trim().toLowerCase();if(q===view.q)return;view.q=q;reloadFromFirstPage();};
  search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(runSearch,350);});
  search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();runSearch();}});
  pager.querySelector('[data-queue-search-go]').addEventListener('click',runSearch);
  pager.addEventListener('click',event=>{
    const button=event.target.closest('[data-queue-page]');if(!button||button.disabled||directBusy)return;
    view.offset=Math.max(0,view.offset+(button.dataset.queuePage==='next'?view.limit:-view.limit));
    refresh().catch(error=>{status.textContent=error.message;});
  });
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
        const ids=selectedIds();
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
  document.addEventListener('outreach-queue-changed',event=>{
   const wantsFocus=event.detail?.focusQueue===true&&event.detail.reviewId===scopeReviewId;
   const owner=document.activeElement;
   const queuedIds=Array.isArray(event.detail?.queuedIds)?event.detail.queuedIds:[];
   refresh(queuedIds).then(count=>{
    if(queuedIds.length)try{syncBulkControls();}catch{}
    if(!wantsFocus||!count||leaving||!section.isConnected||document.querySelector('input[name="reviewId"]')?.value!==scopeReviewId)return;
    const currentFocus=document.activeElement;
    if(currentFocus!==owner&&currentFocus!==document.body)return;
    if(currentFocus!==document.body&&!currentFocus?.closest?.('.organisation-contact-actions'))return;
    const heading=section.querySelector('h2')||section;heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});section.scrollIntoView({block:'start',behavior:'auto'});
   }).catch(error=>status.textContent=error.message);
  });
  const sendStatus=document.createElement('p');section.querySelector('h2').after(sendStatus);
  async function refreshSendFeature(){
    try{sendConfiguration=await request('/api/outreach-queue/send-status');sendStatus.textContent=`From: ${sendConfiguration.configuredMailbox||'unconfigured'}. ${sendConfiguration.reason} ${sendConfiguration.oneClickSendingEnabled?'One-click send ON: Send sends reviewed emails without another popup.':'One-click send OFF: review/confirmation flow remains active.'} Review addresses/drafts first. No automatic retries.`;}catch(e){sendConfiguration=null;sendStatus.textContent=e.message;}
    section.querySelectorAll('[data-send-queue-id]').forEach(b=>b.disabled=directBusy||!sendConfiguration?.sendingEnabled||b.dataset.sendEligible!=='true');syncBulkControls();
  }
  function setSendInteractionLocked(value){
    section.querySelectorAll('.outreach-queue-checkbox,.queue-select-all').forEach(b=>{if(value){if(b.dataset.sendPreviousDisabled===undefined)b.dataset.sendPreviousDisabled=String(b.disabled);b.disabled=true;}else if(b.dataset.sendPreviousDisabled!==undefined){b.disabled=b.dataset.sendPreviousDisabled==='true';delete b.dataset.sendPreviousDisabled;}});
    section.querySelectorAll('.queue-rich-message-editor').forEach(e=>{if(value){if(e.dataset.sendPreviousEditable===undefined)e.dataset.sendPreviousEditable=e.contentEditable;e.contentEditable='false';}else if(e.dataset.sendPreviousEditable!==undefined){e.contentEditable=e.dataset.sendPreviousEditable;delete e.dataset.sendPreviousEditable;}e.closest('details')?.querySelectorAll('button').forEach(b=>{if(value){if(b.dataset.sendPreviousDisabled===undefined)b.dataset.sendPreviousDisabled=String(b.disabled);b.disabled=true;}else if(b.dataset.sendPreviousDisabled!==undefined){b.disabled=b.dataset.sendPreviousDisabled==='true';delete b.dataset.sendPreviousDisabled;}});});
  }
  async function saveForSend(id){try{return await saveQueuedMessageBeforeDraft(id);}finally{setSendInteractionLocked(true);}}
  async function sendOne(item){
    if(!sendConfiguration?.oneClickSendingEnabled)return sendOneLegacy(item);
    if(directBusy)return;const clickedItem=queueSendIntentItem(item),clickedAccount=sendConfiguration?.configuredMailbox;
    directBusy=true;queueProgress(true);setSendInteractionLocked(true);const controls=[...section.querySelectorAll('[data-queue-action],[data-direct-queue-id],[data-send-queue-id]')];controls.forEach(b=>b.disabled=true);
    let sent=false,receipt='';try{
      await refreshSendFeature();if(!sendConfiguration?.sendingEnabled)throw new Error(sendStatus.textContent);
      if(!clickedAccount||String(clickedAccount).toLowerCase()!==String(sendConfiguration.configuredMailbox).toLowerCase())throw new Error('Sending account changed. Review it before another Send click.');
      const r=await executeOneClickSend({item:clickedItem,account:clickedAccount,userInitiated:true,api:request,save:saveForSend,loadItems:async()=>(await request(queueListUrl)).items,onStage:stage=>status.textContent=stage==='preparing'?'Preparing the reviewed email for sending.':'Sending the reviewed email. Do not repeat the action.'});
      sent=true;receipt=`Sent messageId: ${r.messageId}`;await refresh();await refreshHistory();status.textContent=receipt;
    }catch(e){status.textContent=e.data?.sent&&e.data.messageId?`Gmail confirmed sending ${e.data.messageId}. History persistence uncertain; do not retry.`:sent?receipt+' Refresh failed; do not resend.':e.message;try{await refresh();}catch{}}
    finally{directBusy=false;queueProgress(false);setSendInteractionLocked(false);controls.forEach(b=>b.disabled=false);await refreshSendFeature();section.querySelectorAll('[data-direct-queue-id]').forEach(b=>b.disabled=!liveDraftConfig?.draftCreationEnabled||!liveDraftConfig?.configurationReady);syncBulkControls();}
  }
  async function sendOneLegacy(item){
    if(directBusy)return;directBusy=true;queueProgress(true);const controls=[...section.querySelectorAll('[data-queue-action],[data-direct-queue-id],[data-send-queue-id]')];controls.forEach(b=>b.disabled=true);
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
    finally{directBusy=false;queueProgress(false);controls.forEach(b=>b.disabled=false);await refreshSendFeature();section.querySelectorAll('[data-direct-queue-id]').forEach(b=>b.disabled=!liveDraftConfig?.draftCreationEnabled||!liveDraftConfig?.configurationReady);syncBulkControls();}
  }
  const history=document.createElement('section');history.className='review-section';history.innerHTML='<h2>Recorded sent history</h2><p>Application records only, not a full Gmail Sent-folder sync.</p><input type="search" aria-label="Search sent history" placeholder="Name, email or subject"><button type="button" data-history-search>Search</button><button type="button" data-history-refresh>Refresh history</button><p role="status" data-history-status></p><table class="sent-history-table"><thead><tr><th>Recipient</th><th>Subject</th><th>Action</th><th>Sent</th><th>Details</th></tr></thead><tbody></tbody></table><button type="button" data-history-prev>Previous</button><button type="button" data-history-next>Next</button>';main.appendChild(history);const historyTable=history.querySelector('table'),scroll=document.createElement('div');scroll.className='sent-history-scroll';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Recorded sent history; scroll horizontally to view all columns');historyTable.before(scroll);scroll.appendChild(historyTable);let historyPage=1;
  async function refreshHistory(){try{const data=await request(`/api/outreach-queue/send-history?page=${historyPage}&q=${encodeURIComponent(history.querySelector('input').value)}`);historyPage=data.page;const body=history.querySelector('tbody');renderHistoryRows(body,data.items,document);history.querySelector('[data-history-status]').textContent=`${data.total} recorded ${data.total===1?'send':'sends'}${data.pages>1?` · Page ${data.page} of ${data.pages}`:''}`;history.querySelector('[data-history-prev]').disabled=data.page<=1;history.querySelector('[data-history-next]').disabled=data.page>=data.pages;history.querySelector('[data-history-prev]').hidden=data.pages<=1;history.querySelector('[data-history-next]').hidden=data.pages<=1;}catch(e){history.querySelector('[data-history-status]').textContent=e.message;}}
  history.querySelector('[data-history-search]').addEventListener('click',()=>{historyPage=1;refreshHistory();});history.querySelector('[data-history-refresh]').addEventListener('click',refreshHistory);history.querySelector('[data-history-prev]').addEventListener('click',()=>{historyPage=Math.max(1,historyPage-1);refreshHistory();});history.querySelector('[data-history-next]').addEventListener('click',()=>{historyPage++;refreshHistory();});history.querySelector('input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();historyPage=1;refreshHistory();}});
  refreshSendFeature();refreshHistory();
  // A batch approved earlier may still be sending in the background: show its progress and let Stop reach it.
  (async()=>{let watching=false;try{let {run}=await request('/api/outreach-queue/send-run');if(run?.state!=='running'||directBusy)return;watching=true;directBusy=true;queueProgress(true);stopBulk=false;stopBulkButton.hidden=false;stopBulkButton.disabled=false;let stopSent=false;
    while(run?.state==='running'&&!leaving){status.textContent=`Sending in the background: ${run.done} of ${run.total} done${run.currentEmail?', now '+run.currentEmail:''}. You can use other pages meanwhile.`;if(stopBulk&&!stopSent){stopSent=true;({run}=await request('/api/outreach-queue/send-run/stop',{}));}await new Promise(r=>setTimeout(r,1000));({run}=await request('/api/outreach-queue/send-run'));}
    if(run&&!leaving){renderBulkResults(run.results);status.textContent=`Background run ${run.state}: ${run.sent} sent of ${run.total}. See Batch results.`;}
  }catch{/* the queue stays usable */}finally{if(watching){directBusy=false;queueProgress(false);stopBulkButton.hidden=true;try{await refresh();await refreshHistory();}catch{}}}})();
  // outreach-bulk-controls-v1
  const selectionNote=document.createElement('span');selectionNote.className='outreach-selection-count';selectionNote.setAttribute('role','status');selectionNote.setAttribute('aria-live','polite');
  section.querySelector('.outreach-bulk-toolbar').appendChild(selectionNote);
  // Says why checked rows cannot be sent or scheduled, so a zero count is never a mystery.
  const skipNote=document.createElement('p');skipNote.className='outreach-skip-reasons';skipNote.dataset.queueSkipReasons='';skipNote.setAttribute('role','status');skipNote.hidden=true;
  section.querySelector('.outreach-bulk-toolbar').after(skipNote);
  const stopBulkButton=document.createElement('button');stopBulkButton.type='button';stopBulkButton.textContent='Stop after current';stopBulkButton.hidden=true;
  stopBulkButton.setAttribute('aria-label','Stop bulk sending after the current operation');section.querySelector('.outreach-bulk-toolbar').appendChild(stopBulkButton);
  let stopBulk=false;stopBulkButton.addEventListener('click',()=>{stopBulk=true;stopBulkButton.disabled=true;status.textContent='Stopping after the current operation. An email already sending cannot be recalled here.';});
  const scheduleControls=attachOutreachSchedule({section,getItems:()=>bulkQueueItems,getIds:selectedIds,api:request,save:saveQueuedMessageBeforeDraft,refresh:async()=>{await refresh();await refreshHistory();},getBusy:()=>directBusy,setBusy:value=>{directBusy=value;queueProgress(Boolean(value));section.querySelectorAll('[data-send-queue-id]').forEach(b=>b.disabled=value||!sendConfiguration?.sendingEnabled||b.dataset.sendEligible!=='true');section.querySelectorAll('[data-direct-queue-id]').forEach(b=>b.disabled=value||!liveDraftConfig?.draftCreationEnabled||!liveDraftConfig?.configurationReady);syncBulkControls();},getSendingReady:()=>sendConfiguration?.sendingEnabled===true,renderResults:renderBulkResults,onFilterChange:()=>reloadFromFirstPage(),isLeaving:()=>leaving||(!standalone&&document.querySelector('input[name="reviewId"]')?.value!==scopeReviewId)});
  function syncBulkControls(){
    scheduleControls.sync();
    const ids=selectedIds();bulkQueueItems=knownItems();const draft=partitionQueueSelection(bulkQueueItems,ids,'draft'),send=partitionQueueSelection(bulkQueueItems,ids,'send');
    const draftButton=section.querySelector('[data-queue-action="draft-direct"]'),sendButton=section.querySelector('[data-queue-action="send-selected"]'),remove=section.querySelector('[data-queue-action="delete"]');
    draftButton.textContent=`Draft (${draft.eligible.length})`;draftButton.disabled=directBusy||!liveDraftConfig?.draftCreationEnabled||!liveDraftConfig?.configurationReady||!draft.eligible.length;
    sendButton.textContent=`Send ${send.eligible.length} emails`;sendButton.disabled=directBusy||!sendConfiguration?.sendingEnabled||!send.eligible.length;
    const skipped=skipSummary(send);skipNote.hidden=!skipped;skipNote.textContent=skipped?`Not sendable or schedulable: ${skipped}`:'';
    remove.textContent=`Remove (${ids.length})`;remove.disabled=directBusy||!ids.length;
    draftButton.setAttribute('aria-label',`Draft ${draft.eligible.length} selected eligible recipients`);sendButton.setAttribute('aria-label',`Send ${send.eligible.length} selected eligible recipients`);remove.setAttribute('aria-label',`Remove ${ids.length} selected queue rows`);
    section.querySelector('[data-queue-action="refresh"]').disabled=directBusy;section.querySelector('[data-queue-action="clear"]').disabled=directBusy||!view.total;
    const sameContact=send.eligible.length-new Set(send.eligible.map(i=>i.contactId||i.fullName||i.id)).size;
    const sentContacts=new Set(bulkQueueItems.filter(i=>i.status==='sent'&&i.contactId).map(i=>i.contactId));
    const priorContact=send.eligible.filter(i=>i.contactId&&sentContacts.has(i.contactId)).length;
    selectionNote.textContent=`${ids.length} selected · ${draft.eligible.length} draftable · ${send.eligible.length} sendable · ${send.eligible.filter(i=>!i.verified).length} unverified address(es). ${sameContact?'Multiple addresses for the same contact are selected. ':''}${priorContact?'Some contacts already have outreach at another address. ':''}Review before clicking Send.`;
    const master=section.querySelector('.queue-select-all'),total=tbody.querySelectorAll('.outreach-queue-checkbox').length,onPage=tbody.querySelectorAll('.outreach-queue-checkbox:checked').length;
    master.checked=total>0&&onPage===total;master.indeterminate=onPage>0&&onPage<total;master.disabled=directBusy||!total;setSendInteractionLocked(directBusy);
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
    if(directBusy)return;const clickedItems=bulkQueueItems.filter(i=>ids.includes(i.id)).map(queueSendIntentItem),clickedIds=[...new Set(ids)],clickedAccount=sendConfiguration?.configuredMailbox;directBusy=true;queueProgress(true);setSendInteractionLocked(true);stopBulk=false;stopBulkButton.hidden=false;stopBulkButton.disabled=false;
    const controls=[...section.querySelectorAll('[data-queue-action],[data-direct-queue-id],[data-send-queue-id]')];controls.forEach(b=>b.disabled=true);syncBulkControls();
    try{
      await refreshSendFeature();if(!sendConfiguration?.sendingEnabled)throw new Error(sendConfiguration?.reason||'Sending unavailable.');
      if(!clickedAccount||String(clickedAccount).toLowerCase()!==String(sendConfiguration.configuredMailbox).toLowerCase())throw new Error('Sending account changed. Review it before another Send click.');
      const runBatch=sendConfiguration.oneClickSendingEnabled?
        options=>executeOneClickBulkSend({...options,clickedItems,ids:clickedIds,account:clickedAccount,userInitiated:true,loadItems:async()=>(await request(queueListUrl)).items}):
        async options=>executeBulkSend({...options,items:(await request(queueListUrl)).items,ids:clickedIds,save:saveQueuedMessageBeforeDraft,confirm:data=>showBulkConfirmation(data)});
      // After approval the server sends the batch; this page only watches, so other pages and tabs can be used meanwhile.
      const runInBackground=({fresh,onProgress})=>runSendInBackground({api:request,fresh,onProgress,shouldStop:()=>stopBulk&&!leaving});
      const batch=await runBatch({api:request,save:saveForSend,isStopped:()=>stopBulk,runInBackground,
        onProgress:p=>status.textContent=p.stage==='sending'?`Sending in the background ${p.index}/${p.total} · batch ${p.batchIndex}/${p.batchCount}${p.email?': '+p.email:''}. You can use other pages meanwhile; no automatic retries.`:`${({saving:'Saving',preparing:'Preparing'})[p.stage]||'Preparing'} ${p.index}/${p.total} · batch ${p.batchIndex}/${p.batchCount}: ${p.email}.`});
      renderBulkResults(batch.results);
      const sent=batch.results.filter(r=>['sent','sent_attention'].includes(r.kind)),uncertain=batch.results.filter(r=>r.kind==='uncertain').length;
      const completed=new Set(sent.map(r=>r.id));tbody.querySelectorAll('.outreach-queue-checkbox').forEach(b=>{if(completed.has(b.value))b.checked=false;});for(const id of completed)selected.delete(id);
      const message=`Batch finished: ${sent.length} confirmed sent · ${uncertain} uncertain · ${batch.results.length-sent.length-uncertain} skipped/not sent. See Batch results.`;
      try{await refresh();await refreshHistory();}catch{status.textContent=message+' Refresh failed; do not resend completed rows.';return;}
      status.textContent=message;
    }catch(e){status.textContent=e.message;}
    finally{directBusy=false;queueProgress(false);setSendInteractionLocked(false);stopBulkButton.hidden=true;controls.forEach(b=>b.disabled=false);await refreshSendFeature();section.querySelectorAll('[data-direct-queue-id]').forEach(b=>b.disabled=!liveDraftConfig?.draftCreationEnabled||!liveDraftConfig?.configurationReady);syncBulkControls();}
  }
  async function directDraft(rows){
    if(directBusy||!rows.length)return;
    if(rows.some(row=>row.retryFailed)&&!window.confirm('Retry the definite failed attempt? This creates a draft only; nothing is sent.'))return;
    directBusy=true;queueProgress(true);let created=0,errors=0;const receipts=[];
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
    finally{directBusy=false;queueProgress(false);controls.forEach(b=>b.disabled=false);section.querySelectorAll('[data-direct-queue-id]').forEach(b=>b.disabled=!liveDraftConfig?.draftCreationEnabled||!liveDraftConfig?.configurationReady);await refreshSendFeature();}
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
      if (action === 'clear' && !window.confirm(scopeReviewId?'Remove all of this application’s queue rows, on every page? Other applications and sent history will be kept.':'Clear all queue items? Sent-email history will be kept.')) return;
      const ids = selectedIds();
      if (['delete','prepare-drafts','draft-direct','send-selected'].includes(action) && !ids.length) throw new Error('Select at least one queue item.');
      if(action==='draft-direct'){
        const items=(await request(queueListUrl)).items;
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
        const result = await request(`/api/outreach-queue/${action==='clear'&&scopeReviewId?'delete':action}`, action==='clear'&&scopeReviewId?{ids:(await request(queueListUrl)).items.map(i=>i.id)}:action === 'clear' ? { confirmed: true } : { ids });
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


