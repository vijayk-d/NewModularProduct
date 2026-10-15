import { refreshImportedContacts } from './review-page.js';
export function emailCandidateRows(contacts=[]) {
 return contacts.flatMap(c=>{
  const seen=new Set(),names=String(c.fullName||'').trim().split(/\s+/);
  const emails=[c.selectedEmail,...(Array.isArray(c.emailCandidates)?c.emailCandidates:[])].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()).filter(v=>{const k=v.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});
  return (emails.length?emails:['']).map(email=>({key:`${c.id}:${email.toLowerCase()}`,contactId:c.id,firstName:c.firstName||names[0]||'',lastName:c.lastName||names.slice(1).join(' '),role:c.role||'',email,linkedinUrl:c.linkedinUrl||'',source:c.emailSources?.[email.toLowerCase()]||(email.toLowerCase()===String(c.selectedEmail||'').toLowerCase()?c.emailSource:'inferred')||'unknown'}));
 });
}
export function attachSimpleContacts(){
 const form=document.querySelector('form[action="/recruiter-contacts/link"]');if(!form||form.dataset.simpleAttached)return;
 form.dataset.simpleAttached='true';form.noValidate=true;
 const reviewId=form.querySelector('[name="reviewId"]')?.value,available=document.querySelector('.available-imported-contacts-body'),linked=document.querySelector('.linked-imported-contacts-body');
 const submit=form.querySelector('[type="submit"]'),edits=new Map(),manual=[];let busy=false;
 const hint=document.createElement('p');hint.textContent='Queueing applies each selected contact’s name and the configured candidate signoff, keeping the experience text and formatting. Existing attempts are not overwritten.';form.prepend(hint);
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.className='simple-contact-status';form.appendChild(status);
 const makeButton=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',fn);return b;};
 function values(row){return {contactId:row.dataset.contactId||undefined,clientKey:row.dataset.clientKey||undefined,
  firstName:row.querySelector('.candidate-first').value,lastName:row.querySelector('.candidate-last').value,email:row.querySelector('.candidate-email').value,emailSource:row.querySelector('small')?.textContent,role:row.querySelector('.candidate-role').value};}
 function remember(row){edits.set(row.dataset.candidateKey,{...values(row),checked:row.querySelector('[type="checkbox"]').checked});}
 function count(){if(submit)submit.textContent=`Link and add selected to queue (${available?.querySelectorAll('[type="checkbox"]:checked').length||0})`;}
 function row(body,data,isLinked){
  const tr=body.insertRow(),value={...data,...edits.get(data.key)};tr.dataset.candidateKey=data.key;tr.dataset.contactId=data.contactId||'';tr.dataset.clientKey=data.clientKey||'';
  const box=document.createElement('input');box.type='checkbox';box.name='contactIds';box.value=data.contactId||data.clientKey;box.checked=Boolean(value.checked);
  box.className=isLinked?'linked-contact-checkbox':'contact-link-checkbox';box.setAttribute('aria-label',`Select ${value.firstName||'custom contact'} ${value.email||''}`);tr.insertCell().appendChild(box);
  box.addEventListener('change',()=>{remember(tr);count();});
  for(const [key,cls,label] of [['firstName','candidate-first','First name'],['lastName','candidate-last','Last name'],['email','candidate-email','Email'],['role','candidate-role','Role']]){
   const td=tr.insertCell(),input=document.createElement('input');input.type=key==='email'?'email':'text';input.className=cls;input.value=value[key]||'';input.setAttribute('aria-label',label);td.appendChild(input);
   if(key==='role')td.className='contact-role-cell';
   if(key==='email'){td.className='contact-email-cell';const hint=document.createElement('small');hint.textContent=value.source||'manual';td.appendChild(hint);}
   input.addEventListener('input',()=>{
    box.checked=true;remember(tr);
    if(data.contactId&&key!=='email')for(const other of document.querySelectorAll('[data-candidate-key]'))if(other!==tr&&other.dataset.contactId===data.contactId){other.querySelector('.'+cls).value=input.value;remember(other);}
    count();
   });
  }
  const actions=tr.insertCell();
  if(data.linkedinUrl){try{const u=new URL(data.linkedinUrl);if(['http:','https:'].includes(u.protocol)){const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Profile';actions.appendChild(a);}}catch{}}
  actions.appendChild(makeButton('Generate email',()=>{
   const domain=String(document.getElementById('email-domain-input')?.value||'').trim().replace(/^@/,'');
   const part=v=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
   const v=values(tr),first=part(v.firstName),last=part(v.lastName);
   if(!first||!last||!/^([a-z0-9-]+\.)+[a-z]{2,63}$/i.test(domain)){status.textContent='Enter first/last names and a valid domain first.';return;}
   const input=tr.querySelector('.candidate-email');input.value=`${first}.${last}@${domain}`;input.dispatchEvent(new Event('input',{bubbles:true}));
   tr.querySelector('small').textContent='inferred';status.textContent='Address inferred from names and domain. Check it before selecting.';
  }));
  if(!data.contactId)actions.appendChild(makeButton('Remove row',()=>{const i=manual.findIndex(v=>v.key===data.key);if(i>=0)manual.splice(i,1);edits.delete(data.key);tr.remove();count();}));
 }
 function render(body,contacts,isLinked){
  if(!body)return;const table=body.closest('table');let head=table.querySelector('thead');if(!head)head=table.createTHead();
  head.innerHTML='<tr><th>Select</th><th>First name</th><th>Last name</th><th>Email candidate</th><th>Role</th><th>Actions</th></tr>';
  const master=document.createElement('input');master.type='checkbox';master.id=isLinked?'select-all-linked-contacts':'select-all-contact-links';master.setAttribute('aria-label','Select all contact candidates');head.querySelector('th').appendChild(master);
  master.addEventListener('change',()=>{for(const tr of body.rows){tr.querySelector('[type="checkbox"]').checked=master.checked;remember(tr);}count();});
  body.replaceChildren();for(const data of emailCandidateRows(contacts))row(body,data,isLinked);if(!isLinked)for(const data of manual)row(body,data,false);count();
 }
 document.addEventListener('outreach-contacts-refreshed',event=>{render(available,event.detail.unlinkedContacts,false);render(linked,event.detail.linkedContacts,true);});
 async function add(body){
  if(busy)return;const selected=[...body.rows].filter(tr=>tr.querySelector('[type="checkbox"]')?.checked),rows=selected.map(values);
  if(!rows.length){status.textContent='Select at least one email candidate.';return;}
  const editor=document.getElementById('cover-letter-draft'),subject=document.getElementById('current-cover-letter-subject')?.value;
  busy=true;if(submit)submit.disabled=true;status.textContent='Saving selected contacts and queueing the final letter…';
  try{
   const response=await fetch('/api/outreach-queue/link-and-add',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reviewId,rows,bodyPlainText:editor?.innerText,bodyHtml:editor?.innerHTML,...(subject!==undefined?{subject}:{})})});
   const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Unable to save the queue.');
   for(const tr of selected)edits.delete(tr.dataset.candidateKey);
   const keys=new Set(rows.filter(v=>!v.contactId).map(v=>v.clientKey));for(let i=manual.length-1;i>=0;i--)if(keys.has(manual[i].clientKey))manual.splice(i,1);
   status.textContent=`${result.added} added; ${result.updated||0} pending row(s) updated; ${result.duplicates} already attempted/queued. Nothing sent.`;
   document.dispatchEvent(new CustomEvent('outreach-queue-changed'));
   try{await refreshImportedContacts(reviewId);}catch{status.textContent+=' Saved, but contacts could not refresh.';}
  }catch(error){status.textContent=error.message;}finally{busy=false;if(submit)submit.disabled=false;count();}
 }
 form.addEventListener('submit',event=>{event.preventDefault();add(available);});
 form.insertBefore(makeButton('Add contact row',()=>{const clientKey=crypto.randomUUID(),data={key:`manual:${clientKey}`,clientKey,source:'manual',checked:true};manual.push(data);row(available,data,false);available.lastElementChild.querySelector('.candidate-first').focus();count();}),form.firstChild);
 const actions=document.querySelector('.linked-contact-actions');if(actions)actions.appendChild(makeButton('Add selected to queue',()=>add(linked)));
 refreshImportedContacts(reviewId).catch(error=>status.textContent=error.message);count();
}
