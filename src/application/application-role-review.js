import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),normal=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\u2010-\u2015-]+/g,' ').replace(/\s+/g,' ').trim();
const fail=(m,statusCode=409)=>{throw Object.assign(new Error(m),{statusCode,code:'APPLICATION_ROLE_CONFIRMATION_REQUIRED'});};
function title(v){if(typeof v!=='string'||!v.trim()||v.trim().length>300||/[\r\n<>{}]|https?:\/\//i.test(v))fail('Use a plain single-line application title.',400);return v.trim();}
function plausible(v=''){return v.length<=140&&!/[.!?]$/.test(v)&&/\b(?:specialist|lead|manager|director|head|engineer|consultant|analyst|trainer|officer|architect|developer|coordinator)\b/i.test(v)&&!/^\p{Extended_Pictographic}/u.test(v);}
export function explicitDescriptionRole(description=''){
 const lines=String(description).replace(/\r\n/g,'\n').split('\n').map(s=>s.trim().replace(/^#+\s*/, '')).filter(Boolean);
 for(const line of lines.slice(0,6)){const m=/^(?:job|role|position)\s*title\s*[:\u2013\u2014-]\s*(.+)$/i.exec(line);if(m&&plausible(m[1]))return {title:title(m[1]),basis:'explicit_title_label'};}
 if(/^about the job\s*:?$/i.test(lines[0]||'')&&plausible(lines[1]||''))return {title:title(lines[1]),basis:'heading_after_about_the_job'};
 if(plausible(lines[0]||'')&&lines.length>1&&/^[\p{Extended_Pictographic}]|\b(?:hybrid|remote|onsite|salary|hours|bristol|london)\b/iu.test(lines[1]||''))return {title:title(lines[0]),basis:'opening_title_followed_by_metadata'};
 return {title:null,basis:'no_explicit_title'};
}
export function inspectApplicationRole(form={}){
 const applicationTitle=title(form.jobTitle),sourceTitle=title(form.sourceAdvertJobTitle||applicationTitle),description=String(form.jobDescriptionText||''),detected=explicitDescriptionRole(description),conflict=Boolean(detected.title&&normal(detected.title)!==normal(sourceTitle)),choices=[{key:'stored',title:sourceTitle},...(conflict?[{key:'description',title:detected.title}]:[])],binding=hash([form.jobAdvertLink||'',sourceTitle,description]),saved=form.applicationRoleConfirmation;
 const chosen=saved?.binding===binding?choices.find(c=>c.key===saved.choice):null,confirmationValid=Boolean(chosen&&normal(applicationTitle)===normal(chosen.title)),stale=Boolean(saved&&!confirmationValid),needsConfirmation=(conflict&&!confirmationValid)||stale;
 return {sourceTitle,descriptionTitle:detected.title,descriptionTitleBasis:detected.basis,conflict,confirmationValid,staleConfirmation:stale,needsConfirmation,applicationTitle:needsConfirmation?null:confirmationValid?chosen.title:applicationTitle,choices,binding,version:hash([binding,applicationTitle,saved||null])};
}
export function requireConfirmedApplicationRole(form){const r=inspectApplicationRole(form);if(r.needsConfirmation)throw Object.assign(new Error('Stored title and explicit JD title differ or the previous choice is stale. Confirm the application role before polishing.'),{statusCode:409,code:'APPLICATION_ROLE_CONFIRMATION_REQUIRED',roleReview:r});return r;}
export function confirmApplicationRole(form,{binding,expectedRoleVersion,choice}={}){const r=inspectApplicationRole(form);if(binding!==r.binding||expectedRoleVersion!==r.version)fail('Role source or previous choice changed. Review the title panel again.');const selected=r.choices.find(c=>c.key===choice);if(!selected)fail('Choose one displayed role title.',400);return {...form,sourceAdvertJobTitle:r.sourceTitle,jobTitle:selected.title,applicationRoleConfirmation:{binding:r.binding,choice:selected.key,title:selected.title,confirmedAt:new Date().toISOString()}};}
