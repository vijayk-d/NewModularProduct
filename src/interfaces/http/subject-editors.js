export function attachSubjectEditors(doc=document,fetchImpl=fetch) {
  const input=doc.getElementById('current-cover-letter-subject');
  const button=doc.getElementById('save-current-subject');
  const status=doc.getElementById('current-subject-status');
  if(!input||!button||!status||button.dataset.subjectSaveAttached==='true')return;
  button.dataset.subjectSaveAttached='true';
  input.addEventListener('input',()=>{status.textContent='Subject edited locally. Save it for this review, or add to the queue to snapshot the visible value.';});
  button.addEventListener('click',async()=>{
    if(button.disabled)return;button.disabled=true;
    try {
      const response=await fetchImpl('/review-subject-save',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({reviewId:button.dataset.reviewId||'',subject:input.value}).toString()});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'Subject could not be saved.');
      input.value=data.subject;
      const summary=doc.querySelector('[data-subject-summary]');
      if(summary){const label=doc.createElement('strong');label.textContent='Subject:';summary.replaceChildren(label,doc.createTextNode(' '+data.subject));}
      status.textContent='Subject saved to this active review. Queued snapshots and letter-body edits are unchanged.';
    }catch(error){status.textContent=error.message||'Subject could not be saved.';}
    finally{button.disabled=false;}
  });
}
