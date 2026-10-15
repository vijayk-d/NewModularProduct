import { createHash } from 'node:crypto';
import { snapshotMessage,prepareDraftSnapshot,sanitizeSnapshotHtml,escapeHtml } from './outreach-message-snapshot.js';
const fail=(message,statusCode=409)=>{const e=new Error(message);e.statusCode=statusCode;throw e;};
export function messageEditVersion(item){return createHash('sha256').update(JSON.stringify({subject:item.subject,bodyPlainText:item.bodyPlainText,bodyHtml:item.bodyHtml||'',attachment:item.attachment||null,firstname:item.firstname||'',lastname:item.lastname||'',email:item.email,status:item.status,updatedAt:item.updatedAt||''})).digest('hex');}
export function messagePresentation(item,{attempted=false}={}){
 let editorHtml,invalid=false;
 try{editorHtml=item.bodyHtml?sanitizeSnapshotHtml(item.bodyHtml).html:String(item.bodyPlainText||'').split('\n').map(escapeHtml).join('<br>');}
 catch{editorHtml=String(item.bodyPlainText||'').split('\n').map(escapeHtml).join('<br>');invalid=true;}
 return {editVersion:messageEditVersion(item),editorHtml,canEditMessage:item.status==='new'&&!attempted&&!invalid,
  messageReadOnlyReason:invalid?'Stored HTML is invalid. Correct the reviewed letter and queue it again.':
   item.status!=='new'||attempted?'Recorded message snapshot. Local edits cannot update an existing Gmail draft or sent email; use Gmail and recorded history.':''};
}
export function createQueueMessageEditor({repository,env=process.env}){
 return {save({queueId,expectedVersion,bodyPlainText,bodyHtml}={}){
  if(typeof queueId!=='string'||!queueId||typeof expectedVersion!=='string'||!/^[a-f0-9]{64}$/.test(expectedVersion))fail('A queue ID and current message version are required.',400);
  const item=repository.getById(queueId);if(!item)fail('Queue item no longer exists.',404);
  if(item.status!=='new')fail('This message is no longer editable. Refresh the queue; do not retry its Gmail operation.');
  if(messageEditVersion(item)!==expectedVersion)fail('The saved message changed elsewhere. Refresh the queue and discard/review your local edit before saving.');
  if(typeof bodyHtml!=='string'||!bodyHtml.trim())fail('A formatted message is required.',400);
  const snapshot=snapshotMessage(bodyPlainText,bodyHtml,item.application?.jobAdvertLink||'');
  const draft=prepareDraftSnapshot({...item,...snapshot});
  const candidate=String(env.CANDIDATE_DISPLAY_NAME||'Vijay DAFAL').trim();
  if(!draft.recipient.firstname||!draft.bodyPlainText.startsWith(`Dear ${draft.recipient.firstname},`)||!draft.bodyPlainText.endsWith(candidate))fail('Keep the selected recipient greeting and configured candidate signoff.',400);
  if(typeof repository.updatePendingMessage!=='function')fail('Queue message editing is unavailable.',503);
  const saved=repository.updatePendingMessage({queueId,expectedVersion,...snapshot});
  return {saved:true,item:{...saved,...messagePresentation(saved)}};
 }};
}

