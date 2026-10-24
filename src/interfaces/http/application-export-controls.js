export async function exportFromEditor({save,getVersions,isDirty,getCvRoleCode,includeCv,reviewId,fetchImpl,download}){
 await save();if(isDirty())throw new Error('Edits are still pending. Save the current letter before exporting.');
 const v={...getVersions()},code=getCvRoleCode();
 const response=await fetchImpl('/api/application-reviews/export',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reviewId,expectedBodyVersion:v.bodyVersion,expectedSubjectVersion:v.subjectVersion,expectedRevision:v.revision,expectedCvRoleCode:code,includeCv})});
 if(!response.ok){const data=await response.json();throw new Error(data.error||'Application export failed. Nothing downloaded.');}
 const blob=await response.blob(),current=getVersions();
 if(isDirty()||current.bodyVersion!==v.bodyVersion||current.subjectVersion!==v.subjectVersion||current.revision!==v.revision||(includeCv&&getCvRoleCode()!==code))throw new Error('Edits or CV selection changed during export. Save/review, then export again. Nothing downloaded.');
 const name=/filename="([-A-Za-z0-9_]+-application\.zip)"/.exec(response.headers.get('content-disposition')||'')?.[1];
 if(!name)throw new Error('Invalid download receipt. Nothing downloaded.');await download(blob,name);
}
export function attachApplicationExportControls({doc,bar,save,getVersions,isDirty,reviewId,fetchImpl}){
 const button=doc.createElement('button');button.type='button';button.textContent='Export pack';button.title='Save current edits and download letter TXT/HTML/DOCX; no paid or Gmail action.';
 const label=doc.createElement('label'),check=doc.createElement('input');check.type='checkbox';check.checked=false;check.setAttribute('aria-label','Include selected existing PDF/DOCX CV in export');
 const caption=doc.createElement('span');caption.textContent=' Include selected PDF/DOCX CV';label.append(check,caption);
 const message=doc.createElement('span');message.setAttribute('role','status');message.setAttribute('aria-live','polite');bar.append(button,label,message);
 button.addEventListener('click',async()=>{
  if(button.disabled)return;button.disabled=true;check.disabled=true;message.textContent='Saving and preparing local download…';
  try{await exportFromEditor({save,getVersions,isDirty,reviewId,fetchImpl,includeCv:check.checked,getCvRoleCode:()=>doc.querySelector('input[name="selectedCvRoleCode"]:checked')?.value||'',download:async(blob,name)=>{
   const urls=doc.defaultView?.URL||globalThis.URL,url=urls.createObjectURL(blob),a=doc.createElement('a');a.href=url;a.download=name;doc.body.appendChild(a);try{a.click();}finally{a.remove();setTimeout(()=>urls.revokeObjectURL(url),60000);}
  }});message.textContent='Download requested. Pack contains private application files; inspect it before use. Not an ATS submission.';}
  catch(e){message.textContent=e.message+' Queue/Gmail unchanged.';}
  finally{button.disabled=false;check.disabled=false;}
 });
}
