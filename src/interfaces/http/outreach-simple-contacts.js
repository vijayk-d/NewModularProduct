import {createLinkedInIcon} from './contact-history-display.js';
import {businessDomain,isSuggestedContactRole,resolveEmailRow,resolveEmailRows,queueReceipt,receiptRows,receiptText,renderQueueReceipt} from './contact-workflow-policy.js';
import { refreshImportedContacts } from './review-page.js';
export function emailCandidateRows(contacts=[]) {
 return contacts.flatMap(c=>{
  const seen=new Set(),names=String(c.fullName||'').trim().split(/\s+/);
  const emails=[c.selectedEmail,...(Array.isArray(c.emailCandidates)?c.emailCandidates:[])].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()).filter(v=>{const k=v.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});
  return (emails.length?emails:['']).map(email=>({key:`${c.id}:${email.toLowerCase()}`,contactId:c.id,firstName:c.firstName||names[0]||'',lastName:c.lastName||names.slice(1).join(' '),role:c.role||'',email,linkedinUrl:c.linkedinUrl||'',verified:c.verified===true&&email.toLowerCase()===String(c.selectedEmail||'').toLowerCase(),source:c.emailSources?.[email.toLowerCase()]||(email.toLowerCase()===String(c.selectedEmail||'').toLowerCase()?c.emailSource:'inferred')||'unknown'}));
 });
}
let emailSourceSequence=0;
export function applyEmailSourcePresentation(row){
 const input=row.querySelector('.candidate-email'),hint=row.querySelector('small');if(!input||!hint)return;
 const source=String(hint.textContent||'').trim().toLowerCase(),styled=source==='inferred'||source==='manual';
 input.dataset.emailSource=source;
 hint.className=styled?'email-source-metadata':'';
 if(styled){if(!hint.id)hint.id='candidate-email-source-'+(++emailSourceSequence);input.dataset.emailSourceDescription=hint.id;input.setAttribute('aria-describedby',hint.id);input.title=input.value+'\nEmail source: '+(source==='manual'?'manually entered':'inferred')+'. Source is not a verification status.';}
 else{if(input.dataset.emailSourceDescription){input.removeAttribute?.('aria-describedby');delete input.dataset.emailSourceDescription;}input.title=input.value;}
}
export function attachSimpleContacts(){
 const form=document.querySelector('form[action="/recruiter-contacts/link"]');if(!form||form.dataset.simpleAttached)return;
 form.dataset.simpleAttached='true';form.noValidate=true;
 const reviewId=form.querySelector('[name="reviewId"]')?.value,available=document.querySelector('.available-imported-contacts-body'),linked=document.querySelector('.linked-imported-contacts-body'),organisation=document.querySelector('.organisation-contact-summary-body');
 const submit=form.querySelector('[type="submit"]'),edits=new Map(),manual=[];let busy=false;
 const suggestion=document.createElement('p');suggestion.className='contact-suggestion-note';suggestion.setAttribute('role','status');let suggestedNow=null;
 const hint=document.createElement('p');hint.textContent='Queueing applies each selected contact’s name and the configured candidate signoff, keeping the experience text and formatting. Existing attempts are not overwritten.';form.prepend(hint);hint.after(suggestion);
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.className='simple-contact-status';if(submit?.parentNode)submit.after(status);else form.appendChild(status);// beside the button, so a refusal (for example an unpolished letter) is seen where you clicked
 const makeButton=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;
  if(label==='Suggest email'){
   b.className='suggest-email-icon';b.setAttribute('aria-label','Suggest email (inferred)');b.title='Suggest email from names and domain; not verified';b.dataset.uiLabel='Suggest email (inferred)';
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [k,v] of Object.entries({viewBox:'0 0 24 24',width:'20',height:'20',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(k,v);
   const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','M14 5H3v14h18v-7 M3 6l9 7 5-4 M19 2v6 M16 5h6');svg.appendChild(p);b.replaceChildren(svg);
  }
  b.addEventListener('click',fn);return b;};
 function values(row){return {contactId:row.dataset.contactId||undefined,clientKey:row.dataset.clientKey||undefined,
  firstName:row.querySelector('.candidate-first').value,lastName:row.querySelector('.candidate-last').value,email:row.querySelector('.candidate-email').value,emailSource:row.querySelector('small')?.textContent,role:row.querySelector('.candidate-role').value};}
 function rowKey(body,key){return (body===organisation?'organisation':body===linked?'linked':'available')+':'+key;}
 function remember(row){edits.set(row.dataset.candidateKey,{...values(row),checked:row.querySelector('[type="checkbox"]').checked});}
 function count(){if(submit)submit.textContent=`Link and add selected to queue (${available?.querySelectorAll('[type="checkbox"]:checked').length||0})`;const q=document.querySelector('[data-org-queue]');if(q)q.textContent=`Queue organisation contacts (${organisation?.querySelectorAll('[type="checkbox"]:checked').length||0})`;}
 function row(body,data,isLinked){
  const tr=body.insertRow(),value=resolveEmailRow(data,edits.get(rowKey(body,data.key)),document.getElementById('email-domain-input')?.value||'');tr.dataset.candidateKey=rowKey(body,data.key);tr.dataset.contactId=data.contactId||'';tr.dataset.clientKey=data.clientKey||'';tr.dataset.emailVerified=value.verified?'true':'false';
  const box=document.createElement('input');box.type='checkbox';box.name='contactIds';box.value=data.contactId||data.clientKey;box.checked=Boolean(value.checked);
  box.className=body===organisation?'organisation-contact-checkbox':isLinked?'linked-contact-checkbox':'contact-link-checkbox';box.setAttribute('aria-label',`Select ${value.firstName||'custom contact'} ${value.email||''}`);tr.insertCell().appendChild(box);
  // A new decision-maker or recruiter row (first address per person, with an address) is ticked for you; your own ticks and unticks are kept.
  if(suggestedNow&&body===available&&data.contactId&&!edits.has(rowKey(body,data.key))&&!suggestedNow.has(data.contactId)&&value.email&&isSuggestedContactRole(value.role)){suggestedNow.add(data.contactId);box.checked=true;tr.dataset.suggestedContact='true';box.title='Ticked for you: decision-maker or recruiter role';}
  box.addEventListener('change',()=>{remember(tr);count();});
  for(const [key,cls,label] of [['firstName','candidate-first','First name'],['lastName','candidate-last','Last name'],['email','candidate-email','Email'],['role','candidate-role','Role']]){
   const td=tr.insertCell(),input=document.createElement('input');input.type=key==='email'?'email':'text';input.className=cls;input.value=value[key]||'';if(key==='email')input.title=input.value;input.setAttribute('aria-label',label);td.appendChild(input);
   if(key==='role')td.className='contact-role-cell';
   if(key==='email'){td.className='contact-email-cell';const hint=document.createElement('small');hint.textContent=value.emailSource||value.source||'manual';td.appendChild(hint);}
   input.addEventListener('input',()=>{
    if(key==='email')input.title=input.value;
    if(key==='email'){tr.querySelector('small').textContent=tr.dataset.suggestingEmail==='true'?'inferred':'manual';applyEmailSourcePresentation(tr);}
    box.checked=true;remember(tr);
    if(data.contactId&&key!=='email')for(const other of document.querySelectorAll('[data-candidate-key]'))if(other!==tr&&other.dataset.contactId===data.contactId){other.querySelector('.'+cls).value=input.value;remember(other);}
    count();
   });
  }
  applyEmailSourcePresentation(tr);
  if(tr.dataset.suggestedContact==='true')remember(tr);
  const cells=[...tr.cells];cells[1].className='candidate-person';const names=document.createElement('div');names.className='candidate-name-fields';names.append(cells[1].firstElementChild,cells[2].firstElementChild);cells[1].replaceChildren(names);cells[2].remove();
  for(const [i,label] of ['Select','Person','Email candidate','Role'].entries())tr.cells[i].dataset.label=label;
  const actionCell=tr.insertCell();actionCell.dataset.label='Actions';const actions=document.createElement('div');actions.className='contact-row-actions';actionCell.appendChild(actions);
  const profile=createLinkedInIcon(data.linkedinUrl,[value.firstName,value.lastName].filter(Boolean).join(' ')||'contact');if(profile)actions.appendChild(profile);
  actions.appendChild(makeButton('Suggest email',()=>{
   const domain=String(document.getElementById('email-domain-input')?.value||'').trim().replace(/^@/,'');
   const part=v=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
   const v=values(tr),first=part(v.firstName),last=part(v.lastName);
   if(!first||!last||!/^([a-z0-9-]+\.)+[a-z]{2,63}$/i.test(domain)){status.textContent='Enter first/last names and a valid domain first.';return;}
   const input=tr.querySelector('.candidate-email');input.value=`${first}.${last}@${domain}`;tr.dataset.suggestingEmail='true';tr.querySelector('small').textContent='inferred';try{input.dispatchEvent(new Event('input',{bubbles:true}));}finally{delete tr.dataset.suggestingEmail;}
   tr.querySelector('small').textContent='inferred';applyEmailSourcePresentation(tr);status.textContent='Address inferred from names and domain. Check it before selecting.';
  }));
  if(!data.contactId)actions.appendChild(makeButton('Remove row',()=>{const i=manual.findIndex(v=>v.key===data.key);if(i>=0)manual.splice(i,1);edits.delete(data.key);tr.remove();count();}));
 }
 function render(body,contacts,isLinked){
  if(!body)return;if(body===organisation){const section=body.closest('section');section.hidden=false;const note=section.querySelector('.organisation-contact-status');if(note&&!contacts.length&&!note.textContent)note.textContent='No contacts linked to this application yet. Import/link contacts above, then refresh.';}const table=body.closest('table');table.classList.add('contact-editor-table');if(!table.parentElement?.classList.contains('contact-edit-scroll')){const scroll=document.createElement('div');scroll.className='contact-edit-scroll';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Editable contacts; scroll horizontally to view all fields');table.before(scroll);scroll.appendChild(table);}let head=table.querySelector('thead');if(!head)head=table.createTHead();
  head.innerHTML='<tr><th>Select</th><th>Person</th><th>Email candidate</th><th>Role</th><th>Actions</th></tr>';
  const master=document.createElement('input');master.type='checkbox';master.id=body===organisation?'select-all-organisation-contacts':isLinked?'select-all-linked-contacts':'select-all-contact-links';master.setAttribute('aria-label','Select all contact candidates');head.querySelector('th').appendChild(master);
  master.addEventListener('change',()=>{for(const tr of body.rows){tr.querySelector('[type="checkbox"]').checked=master.checked;remember(tr);}count();});
  if(body===available)suggestedNow=new Set();
  body.replaceChildren();for(const data of resolveEmailRows(emailCandidateRows(contacts),document.getElementById('email-domain-input')?.value||'',edits,v=>rowKey(body,v.key)))row(body,data,isLinked);if(!isLinked)for(const data of manual)row(body,data,false);
  if(body===available){const n=suggestedNow.size;suggestedNow=null;if(n)suggestion.textContent=`${n} contact${n===1?'':'s'} with a director, head, talent or recruiter role ${n===1?'is':'are'} ticked for you. Untick anyone you do not want, then link and add.`;else if(!available.querySelector('[data-suggested-contact]'))suggestion.textContent='';}
  count();
 }
 document.addEventListener('outreach-contacts-refreshed',event=>{render(available,event.detail.unlinkedContacts,false);render(linked,event.detail.linkedContacts,true);render(organisation,event.detail.linkedContacts,true);});
 const baseQueueStatus=status;
 async function add(body){
  const status=body===organisation?(organisation.closest('section')?.querySelector('.organisation-contact-status')||baseQueueStatus):baseQueueStatus;
  if(busy)return;const selected=[...body.rows].filter(tr=>tr.querySelector('[type="checkbox"]')?.checked),rows=selected.map(values);
  const activeDomain=businessDomain(document.getElementById('email-domain-input')?.value||'');if(activeDomain&&rows.some(r=>r.emailSource==='inferred'&&!String(r.email||'').toLowerCase().endsWith('@'+activeDomain))){status.textContent='Inferred addresses still use an older domain. Refresh/review candidates before queueing; no queue request was made.';return;}
  if(!rows.length){status.textContent='Select at least one email candidate.';return;}
  const editor=document.getElementById('cover-letter-draft'),subject=document.getElementById('current-cover-letter-subject')?.value;
  busy=true;if(submit)submit.disabled=true;document.querySelectorAll('.organisation-contact-actions button').forEach(b=>b.disabled=true);status.textContent='Saving selected contacts and queueing the final letter…';
  try{
   const response=await fetch('/api/outreach-queue/link-and-add',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reviewId,rows,bodyPlainText:editor?.innerText,bodyHtml:editor?.innerHTML,...(subject!==undefined?{subject}:{})})});
   const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Unable to save the queue.');
   for(const tr of selected)edits.delete(tr.dataset.candidateKey);
   const keys=new Set(rows.filter(v=>!v.contactId).map(v=>v.clientKey));for(let i=manual.length-1;i>=0;i--)if(keys.has(manual[i].clientKey))manual.splice(i,1);
   const accounting=queueReceipt(rows,result);status.textContent=receiptText(accounting);status.dataset.queueAccounting=JSON.stringify(accounting);renderQueueReceipt(status,rows,result,document);
   const focusOwner=document.activeElement;const canMoveQueueFocus=focusOwner===document.body||Boolean(focusOwner?.closest?.('.organisation-contact-actions'));
   document.dispatchEvent(new CustomEvent('outreach-queue-changed',{detail:{reviewId,queuedIds:receiptRows(rows,result).map(r=>r.queueId).filter(Boolean),focusQueue:body===organisation&&canMoveQueueFocus&&accounting.unaccounted===0&&(accounting.added+accounting.updated+accounting.duplicates)>0}}));
   try{await refreshImportedContacts(reviewId);}catch{status.textContent+=' Saved, but contacts could not refresh.';}
  }catch(error){status.textContent=error.message;}finally{busy=false;if(submit)submit.disabled=false;document.querySelectorAll('.organisation-contact-actions button').forEach(b=>b.disabled=false);count();}
 }
 if(organisation){
  const section=organisation.closest('section'),toolbar=document.createElement('div');section.hidden=false;toolbar.className='linked-contact-actions organisation-contact-actions';
  const queue=makeButton('Queue organisation contacts',async()=>{orgStatus.textContent='Saving selection and creating queue snapshots…';await add(organisation);}),unlink=makeButton('Remove from this application',()=>removeOrganisation('unlink')),del=makeButton('Permanently delete selected',()=>removeOrganisation('delete')),refresh=makeButton('Refresh organisation contacts',()=>refreshImportedContacts(reviewId).catch(e=>{orgStatus.textContent=e.message;}));
  queue.dataset.orgQueue='true';toolbar.append(queue,unlink,del,refresh);const orgStatus=document.createElement('p');orgStatus.className='organisation-contact-status';orgStatus.setAttribute('role','status');orgStatus.setAttribute('aria-live','polite');section.querySelector('table').before(toolbar);toolbar.after(orgStatus);
  async function removeOrganisation(action){
   if(busy)return;const rows=[...organisation.rows].filter(row=>row.querySelector('[type="checkbox"]')?.checked),ids=[...new Set(rows.map(row=>row.dataset.contactId).filter(Boolean))];
   if(!ids.length){orgStatus.textContent='Select at least one organisation contact.';return;}
   const summary=rows.map(row=>[row.querySelector('.candidate-first')?.value,row.querySelector('.candidate-last')?.value,row.querySelector('.candidate-email')?.value,'ID '+row.dataset.contactId].filter(Boolean).join(' ')).join('\n');
   const message=action==='delete'?'Permanently delete these stored contacts and their email candidates? Contacts used by another application are protected. A local backup is retained.':'Remove these contact links from this application? Contact records remain in storage and other applications.';
   if(!window.confirm(message+'\n'+summary+'\nExisting queued messages, sent history and Gmail are NOT removed. Remove queued rows separately if you no longer want to contact them.'))return;
   busy=true;[queue,unlink,del,refresh].forEach(b=>b.disabled=true);let receipt='';
   try{const response=await fetch('/api/organisation-contacts/remove',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reviewId,contactIds:ids,action,confirmed:true})}),data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Contact removal not confirmed.');for(const row of rows)edits.delete(row.dataset.candidateKey);receipt=data.removed+' contact(s) '+(action==='delete'?'deleted from active contact storage.':'unlinked from this application.')+' Queue/history unchanged.';orgStatus.textContent=receipt;try{await refreshImportedContacts(reviewId);}catch{orgStatus.textContent=receipt+' Refresh failed; use Refresh contacts, not another deletion.';}}
   catch(e){orgStatus.textContent=receipt?receipt+' '+e.message:e.message;}
   finally{busy=false;[queue,unlink,del,refresh].forEach(b=>b.disabled=false);}
  }
 }
 form.addEventListener('submit',event=>{event.preventDefault();add(available);});
 form.insertBefore(makeButton('Add contact row',()=>{const clientKey=crypto.randomUUID(),data={key:`manual:${clientKey}`,clientKey,source:'manual',checked:true};manual.push(data);row(available,data,false);available.lastElementChild.querySelector('.candidate-first').focus();count();}),form.firstChild);
 const actions=form.querySelector('.linked-contact-actions');if(actions)actions.appendChild(makeButton('Queue selected linked contacts',()=>add(linked)));
 const domainField=document.getElementById('email-domain-input');let domainTimer;
 function refreshInferredDomain(){const domain=businessDomain(domainField?.value);if(!domain)return;let changes=0;for(const tr of document.querySelectorAll('[data-candidate-key]')){const hint=tr.querySelector('small'),email=tr.querySelector('.candidate-email');if(!email||hint?.textContent!=='inferred')continue;const next=resolveEmailRow({email:email.value,source:'inferred',verified:tr.dataset.emailVerified==='true'},null,domain);if(next.email!==email.value){email.value=next.email;email.title=email.value;applyEmailSourcePresentation(tr);remember(tr);changes++;}}for(const body of [available,linked,organisation]){if(!body)continue;const seen=new Map();for(const row of [...body.rows]){const email=row.querySelector('.candidate-email');if(!email)continue;const key=JSON.stringify([row.dataset.contactId||row.dataset.clientKey,email.value.toLowerCase()]);const prior=seen.get(key);if(!prior){seen.set(key,row);continue;}prior.querySelector('[type="checkbox"]').checked=prior.querySelector('[type="checkbox"]').checked||row.querySelector('[type="checkbox"]').checked;if(row.querySelector('small')?.textContent!=='inferred')prior.querySelector('small').textContent=row.querySelector('small')?.textContent||'manual';if(row.dataset.emailVerified==='true')prior.dataset.emailVerified='true';applyEmailSourcePresentation(prior);remember(prior);edits.delete(row.dataset.candidateKey);row.remove();}}count();if(changes)status.textContent=changes+' inferred address row(s) updated to '+domain+'. Review them before queueing; existing queue/Gmail snapshots were not changed.';}
 domainField?.addEventListener('change',refreshInferredDomain);domainField?.addEventListener('input',()=>{clearTimeout(domainTimer);domainTimer=setTimeout(refreshInferredDomain,350);});
 refreshImportedContacts(reviewId).catch(error=>status.textContent=error.message);count();
}
