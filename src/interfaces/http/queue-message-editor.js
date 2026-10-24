// queue-single-editor-v1: one formatted message control, no duplicate plain-text view.
const edits=new Map();
async function save(state){
 if(state.saving)return state.saving;
 if(!state.dirty)return;
 if(!state.latest.canEditMessage)throw new Error(state.latest.messageReadOnlyReason||'This message is not editable.');
 const draft={html:state.html,plain:state.plain,version:state.version};
 state.status.textContent='Saving…';state.editor.contentEditable='false';
 state.saving=(async()=>{
  const response=await fetch('/api/outreach-queue/message-save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({queueId:state.latest.id,expectedVersion:draft.version,bodyPlainText:draft.plain,bodyHtml:draft.html})});
  const result=await response.json();if(!response.ok||!result.saved||!result.ok)throw new Error(result.error||'Message save failed. No draft was created.');
  state.latest=result.item;state.version=result.item.editVersion;state.html=result.item.editorHtml;state.plain=result.item.bodyPlainText;state.dirty=false;
  state.editor.innerHTML=state.html;state.status.textContent='Saved. No Gmail operation performed.';
 })();
 try{await state.saving;}catch(error){state.status.textContent=error.message;throw error;}
 finally{state.saving=null;state.editor.contentEditable=state.latest.canEditMessage?'true':'false';state.updateButtons();}
}
export async function saveQueuedMessageBeforeDraft(queueId){const state=edits.get(queueId);if(state?.dirty||state?.saving)await save(state);}
export function createQueueMessageControl(item){
 const existing=edits.get(item.id),state=existing||{dirty:false,saving:null};state.latest=item;
 if(!state.dirty&&!state.saving){state.html=item.editorHtml;state.plain=item.bodyPlainText;state.version=item.editVersion;}
 edits.set(item.id,state);
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=/* outreach-bulk-controls-v1 */ item.canEditMessage?'Edit':'View';summary.title=item.canEditMessage?'View or edit the queued message':'View the saved message';summary.setAttribute('aria-label',summary.textContent+' message for '+(item.fullName||item.email));details.appendChild(summary);
 const subject=document.createElement('p');subject.textContent=`Subject: ${item.subject}`;details.appendChild(subject);
 const editor=document.createElement('div');editor.className='queue-rich-message-editor';editor.setAttribute('role','textbox');editor.setAttribute('aria-multiline','true');editor.setAttribute('aria-label',`Message for ${item.fullName||item.email}`);
 // Only server-sanitized presentation HTML is inserted; legacy responses fall back to text.
 if(typeof state.html==='string')editor.innerHTML=state.html;else editor.textContent=state.plain||'';
 editor.contentEditable=item.canEditMessage&&!state.saving?'true':'false';editor.spellcheck=true;details.appendChild(editor);state.editor=editor;
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 status.textContent=item.canEditMessage?(state.dirty?'Unsaved changes. Draft will save these first.':'Saved. Drag the editor corner to resize.'):item.messageReadOnlyReason||'Read-only saved message.';
 details.appendChild(status);state.status=status;
 const saveButton=document.createElement('button');saveButton.type='button';saveButton.textContent='Save changes';
 const discard=document.createElement('button');discard.type='button';discard.textContent='Discard changes';details.append(saveButton,discard);
 state.updateButtons=()=>{saveButton.disabled=!state.dirty||!state.latest.canEditMessage||Boolean(state.saving);discard.disabled=!state.dirty||Boolean(state.saving);};
 editor.addEventListener('paste',event=>{
  if(editor.contentEditable!=='true')return;event.preventDefault();
  const text=event.clipboardData?.getData('text/plain')||'',selection=window.getSelection();
  if(selection?.rangeCount&&editor.contains(selection.getRangeAt(0).commonAncestorContainer)){
   const range=selection.getRangeAt(0);range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
  }else editor.appendChild(document.createTextNode(text));
  editor.dispatchEvent(new Event('input',{bubbles:true}));
 });
 editor.addEventListener('drop',event=>{event.preventDefault();status.textContent='Paste text instead of dropping external content.';});
 editor.addEventListener('input',()=>{state.html=editor.innerHTML;state.plain=editor.innerText;state.dirty=true;status.textContent='Unsaved changes. Draft will save these first.';state.updateButtons();});
 saveButton.addEventListener('click',()=>save(state).catch(()=>{}));
 discard.addEventListener('click',()=>{state.dirty=false;state.version=state.latest.editVersion;state.html=state.latest.editorHtml;state.plain=state.latest.bodyPlainText;editor.innerHTML=state.html;status.textContent=state.latest.canEditMessage?'Saved version restored.':state.latest.messageReadOnlyReason;state.updateButtons();});
 state.updateButtons();return details;
}

export function hasPendingQueueMessageEdits(reviewId){return [...edits.values()].some(s=>(!reviewId||s.latest?.reviewId===reviewId)&&(s.dirty||s.saving));}
