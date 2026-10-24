import {attachUnsentLetterUpdateControls} from './unsent-letter-update-controls.js';
import {attachApplicationExportControls} from './application-export-controls.js';
export function attachApplicationSaveControls(doc=document,fetchImpl=fetch){
 const editor=doc.getElementById('cover-letter-draft'),subject=doc.getElementById('current-cover-letter-subject'),id=doc.querySelector('input[name="reviewId"]')?.value;
 if(!editor||!subject||!id||editor.dataset.applicationSaveAttached)return;editor.dataset.applicationSaveAttached='true';
 const bar=doc.createElement('div');bar.className='application-save-bar';const button=doc.createElement('button');button.type='button';button.textContent='Save application';
 const link=doc.createElement('a');link.href='/applications';link.textContent='Saved applications';const status=doc.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 bar.append(button,link,status);editor.closest('section')?.prepend(bar);
 const css=doc.createElement('link');css.rel='stylesheet';css.href='/application-review-controls.css';doc.head.appendChild(css);
 let loading=null,versions=null,bodyDirty=false,subjectDirty=false,bodyGeneration=0,subjectGeneration=0,timer=null,pending=null,blocked=false,replaying=false;
 async function request(url,payload){const response=await fetchImpl(url,payload===undefined?{cache:'no-store'}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok||!data.ok){const e=new Error(data.error||'Application save failed.');e.code=data.code;throw e;}return data;}
 async function load(){if(loading)return loading;loading=(async()=>{versions=await request('/api/application-reviews/'+encodeURIComponent(id));status.textContent=versions.durable?'Application stored locally. Text edits autosave after a pause.':'Review persistence unavailable in this server configuration.';})();try{await loading;}finally{loading=null;}}
 function schedule(){clearTimeout(timer);if(!blocked)timer=setTimeout(()=>save().catch(()=>{}),1200);}
 editor.addEventListener('input',()=>{bodyDirty=true;bodyGeneration++;blocked=false;status.textContent='Unsaved letter edits…';schedule();});
 subject.addEventListener('input',()=>{subjectDirty=true;subjectGeneration++;blocked=false;status.textContent='Unsaved subject edits…';schedule();});
 async function save(){
  clearTimeout(timer);if(pending){await pending;if(bodyDirty||subjectDirty)return save();return;}
  if(!versions)await load();const b=bodyGeneration,s=subjectGeneration;
  status.textContent='Saving application…';button.disabled=true;
  pending=(async()=>{
   const data=await request('/api/application-reviews/save',{reviewId:id,expectedBodyVersion:versions.bodyVersion,expectedSubjectVersion:versions.subjectVersion,bodyPlainText:editor.innerText,bodyHtml:editor.innerHTML,subject:subject.value,saveSubject:subjectDirty});
   versions=data;if(bodyGeneration===b)bodyDirty=false;if(subjectGeneration===s){subjectDirty=false;subject.value=data.subject;}
   blocked=false;status.textContent=bodyDirty||subjectDirty?'Saved previous edit; latest edits still pending.':data.durable?'Application saved locally. Queue/Gmail were not changed.':'Saved in this server session only; restart persistence is unavailable.';
  })();
  try{await pending;}catch(e){blocked=true;status.textContent=e.message+' Local edits remain here; save/copy them before leaving.';throw e;}
  finally{pending=null;button.disabled=false;if((bodyDirty||subjectDirty)&&!blocked)schedule();}
 }
 button.addEventListener('click',()=>save().catch(()=>{}));
 link.addEventListener('click',async event=>{if(!bodyDirty&&!subjectDirty&&!pending)return;event.preventDefault();try{await save();doc.defaultView?.location.assign('/applications');}catch{}});
 const Observer=doc.defaultView?.MutationObserver;if(Observer)new Observer(changes=>{if(!changes.some(c=>c.type!=='attributes'||c.target!==editor))return;bodyDirty=true;bodyGeneration++;blocked=false;status.textContent='Unsaved formatting/text edits…';schedule();}).observe(editor,{childList:true,characterData:true,subtree:true,attributes:true});
 const actions=new Set(['/review-role-title','/review-cv-selection','/organisation-research','/cover-letter-refinement','/cover-letter-refinement/apply','/recruiter-contacts/link']);
 doc.addEventListener('submit',async event=>{
  if(replaying||!actions.has(new URL(event.target.action,doc.baseURI).pathname)||(!bodyDirty&&!subjectDirty&&!pending))return;
  event.preventDefault();event.stopImmediatePropagation();const form=event.target,submitter=event.submitter;
  try{await save();replaying=true;try{submitter?form.requestSubmit(submitter):form.requestSubmit();}finally{replaying=false;}}
  catch{status.textContent+=' Action paused; no research/polishing/queue action was triggered.';}
 },true);
 doc.defaultView?.addEventListener('beforeunload',event=>{if(bodyDirty||subjectDirty||pending){event.preventDefault();event.returnValue='';}});
 attachApplicationExportControls({doc,bar,save,getVersions:()=>versions,isDirty:()=>bodyDirty||subjectDirty||Boolean(pending),reviewId:id,fetchImpl});
 attachUnsentLetterUpdateControls({doc,bar,save,readView:()=>JSON.stringify([editor.innerHTML,subject.value]),isDirty:()=>bodyDirty||subjectDirty||Boolean(pending),reviewId:id,fetchImpl});
 for(const b of (doc.querySelectorAll?.('[data-role-title-confirm]')||[]))b.disabled=false;
 load().catch(e=>{status.textContent=e.message;});
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>attachApplicationSaveControls(),{once:true});else attachApplicationSaveControls();
}

