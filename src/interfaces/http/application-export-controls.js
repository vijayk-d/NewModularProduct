export async function exportFromEditor({save,getVersions,isDirty,getCvRoleCode,includeCv,cvFormat='saved',reviewId,fetchImpl,download}){
 await save();if(isDirty())throw new Error('Edits are still pending. Save the current letter before exporting.');
 const v={...getVersions()},code=getCvRoleCode();
 const response=await fetchImpl('/api/application-reviews/export',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reviewId,expectedBodyVersion:v.bodyVersion,expectedSubjectVersion:v.subjectVersion,expectedRevision:v.revision,expectedCvRoleCode:code,includeCv,cvFormat})});
 if(!response.ok){const data=await response.json();throw new Error(data.error||'Application export failed. Nothing downloaded.');}
 const blob=await response.blob(),current=getVersions();
 if(isDirty()||current.bodyVersion!==v.bodyVersion||current.subjectVersion!==v.subjectVersion||current.revision!==v.revision||(includeCv&&getCvRoleCode()!==code))throw new Error('Edits or CV selection changed during export. Save/review, then export again. Nothing downloaded.');
 const name=/filename="([-A-Za-z0-9_]+-application\.zip)"/.exec(response.headers.get('content-disposition')||'')?.[1];
 if(!name)throw new Error('Invalid download receipt. Nothing downloaded.');await download(blob,name);
}
export const CV_CHOICES=[['none','No CV'],['saved','CV as saved'],['pdf','CV as PDF'],['docx','CV as DOCX'],['both','CV as PDF and DOCX'],['tailored','Tailored CV (DOCX)']];
export function packSummary(choice,cvCode){
 const cv=choice==='none'?'no CV':!cvCode?'no CV selected yet':`CV ${cvCode} ${{saved:'in its saved format',pdf:'as PDF',docx:'as DOCX',both:'as PDF and DOCX',tailored:'tailored for this job (DOCX)'}[choice]}`;
 return `Pack: career-portal cover letter (Word, plus PDF when the letter template is set up) and ${cv}.`;
}
export function attachApplicationExportControls({doc,bar,save,getVersions,isDirty,reviewId,fetchImpl}){
 const button=doc.createElement('button');button.type='button';button.textContent='Export pack';button.title='Save current edits and download the career-portal letter and chosen CV; no paid or Gmail action.';
 const label=doc.createElement('label'),select=doc.createElement('select');select.setAttribute('aria-label','CV to include in export');select.dataset.exportCvChoice='';
 for(const [value,text] of CV_CHOICES){const o=doc.createElement('option');o.value=value;o.textContent=text;select.append(o);}
 // Remembered per browser only; private windows or blocked storage simply start at No CV.
 const KEY='jobapp.exportCvChoice';let remembered=null;try{remembered=doc.defaultView?.localStorage?.getItem(KEY);}catch{}
 select.value=CV_CHOICES.some(([v])=>v===remembered)?remembered:'none';label.append(select);
 select.addEventListener('change',()=>{try{doc.defaultView?.localStorage?.setItem(KEY,select.value);}catch{}});
 const summary=doc.createElement('span');summary.dataset.exportSummary='';
 const message=doc.createElement('span');message.setAttribute('role','status');message.setAttribute('aria-live','polite');const group=doc.createElement('div');group.className='save-bar-group save-bar-group-export';group.setAttribute('role','group');group.setAttribute('aria-label','Export pack');summary.className='save-bar-note';message.className='save-bar-status';group.append(button,label,summary,message);bar.append(group);
 const cvCode=()=>doc.querySelector('input[name="selectedCvRoleCode"]:checked')?.value||'';
 const refresh=()=>{summary.textContent=' '+packSummary(select.value,cvCode());};
 select.addEventListener('change',refresh);doc.addEventListener('change',e=>{if(e.target?.name==='selectedCvRoleCode')refresh();});refresh();
 button.addEventListener('click',async()=>{
  if(button.disabled)return;button.disabled=true;select.disabled=true;message.textContent='Saving and preparing local download…';
  const includeCv=select.value!=='none';
  try{await exportFromEditor({save,getVersions,isDirty,reviewId,fetchImpl,includeCv,cvFormat:includeCv?select.value:'saved',getCvRoleCode:cvCode,download:async(blob,name)=>{
   const urls=doc.defaultView?.URL||globalThis.URL,url=urls.createObjectURL(blob),a=doc.createElement('a');a.href=url;a.download=name;doc.body.appendChild(a);try{a.click();}finally{a.remove();setTimeout(()=>urls.revokeObjectURL(url),60000);}
  }});message.textContent='Download requested. Pack contains private application files; inspect it before use. Not an ATS submission.';}
  catch(e){message.textContent=e.message+' Queue/Gmail unchanged.';}
  finally{button.disabled=false;select.disabled=false;}
 });
}
