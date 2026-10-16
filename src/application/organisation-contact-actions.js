export async function removeOrganisationSelection({contactStore,outreachRepository,getReview,reviewId,contactIds,action,confirmed}){
 const fail=(m,s=409)=>{throw Object.assign(new Error(m),{statusCode:s,code:'ORGANISATION_CONTACT_REMOVE'});};
 if(confirmed!==true||!['unlink','delete'].includes(action)||typeof reviewId!=='string'||!Array.isArray(contactIds)||!contactIds.length||contactIds.length>100||contactIds.some(id=>typeof id!=='string'||!id.trim()))fail('Confirm one explicit selection and removal action.',400);
 if(!getReview(reviewId))fail('Application review no longer exists.',404);
 if(typeof contactStore?.removeOrganisationContacts!=='function')fail('Organisation-contact removal unavailable.',503);
 if(action==='delete'){
  const ids=new Set(contactIds);for(const row of outreachRepository?.list?.()||[])if(ids.has(row.contactId)&&['send_pending','send_unknown','draft_creating','draft_unknown'].includes(row.status))fail('Related mail operation active or uncertain. Inspect it before deleting the contact.');
  for(const row of [...(outreachRepository?.listSendAttempts?.()||[]),...(outreachRepository?.listDraftOperations?.()||[])])if((ids.has(row.contactId)||ids.has(row.snapshot?.contactId))&&['reserved','unknown'].includes(row.status))fail('Related mail reservation/unknown outcome must be resolved first.');
 }
 return contactStore.removeOrganisationContacts({reviewId,contactIds:[...new Set(contactIds)],permanent:action==='delete'});
}
