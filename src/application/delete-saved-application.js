import {createHash} from 'node:crypto';
const fail=(m,s=409)=>{throw Object.assign(new Error(m),{statusCode:s,code:'APPLICATION_DELETE_BLOCKED'});};
export async function deleteSavedApplication({store,contactStore,outreachRepository,reviewId,expectedRevision,confirmed}){
 if(confirmed!==true||typeof reviewId!=='string'||!Number.isInteger(expectedRevision))fail('Confirm one exact application ID and revision.',400);
 const review=store.get(reviewId);if(!review)fail('Saved application missing/already deleted.',404);if(review._storageMeta?.revision!==expectedRevision)fail('Application changed. Review again before deletion.');
 const form=review.formData||{},identity=String(form.jobAdvertLink||'').trim()||JSON.stringify([form.organisationName||'',form.organisationUrl||'',form.jobTitle||'',form.jobReference||'',form.jobDescriptionText||'']),key=createHash('sha256').update(identity).digest('hex'),rows=outreachRepository?.list?.()||[],ids=new Set(rows.filter(r=>r.reviewId===reviewId||r.applicationKey===key).map(r=>r.id));
 if(rows.some(r=>ids.has(r.id)&&['send_pending','send_unknown','draft_creating','draft_unknown'].includes(r.status)))fail('Related email operation is active/uncertain. Inspect it before deleting application evidence.');
 for(const r of [...(outreachRepository?.listSendAttempts?.()||[]),...(outreachRepository?.listDraftOperations?.()||[])])if((ids.has(r.queueId)||r.applicationKey===key)&&['reserved','unknown'].includes(r.status))fail('Related mail reservation/unknown outcome must be resolved first.');
 if(store.deletionSupported!==true||typeof store.delete!=='function')fail('Revision-safe deletion unavailable.',503);const result=store.delete(reviewId,expectedRevision);let contactsUnlinked=true;
 try{if(contactStore){const contacts=await contactStore.listByReview(reviewId);if(contacts.length)await contactStore.unlinkFromReview({reviewId,contactIds:contacts.map(c=>c.id)});}}catch{contactsUnlinked=false;}
 return {...result,reviewId,contactsUnlinked,queueAndHistoryUnchanged:true,note:contactsUnlinked?'Saved application content removed; other stores and exports retained.':'Application deleted, but contact unlink cleanup failed. Contacts retained; do not delete contacts to compensate.'};
}
