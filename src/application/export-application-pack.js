import {restoreLinkedOpeningPlain} from '../domain/shared/linked-role-opening.js';
import {extname} from 'node:path';
import {createHash} from 'node:crypto';
import {reviewEditorState} from './save-application-review.js';
import {sanitizeSnapshotHtml,escapeHtml} from './outreach-message-snapshot.js';
import {extractOutreachExperienceBody} from './compose-outreach-letter.js';
import {toPortalLetter,PORTAL_GREETING} from '../domain/cover-letter/portal-letter.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{code:'APPLICATION_EXPORT_BLOCKED',statusCode});};
export function safeExportStem(value){let s=String(value||'application').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);if(!s||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(s))s='application';return s;}
function selected(review){const code=String(review.selectedCvRoleCode||review.prepared?.recommendation?.bestCv?.role_code||'');const cv=(review.prepared?.rankedCvs||[]).map(v=>v.cv).find(v=>v?.role_code===code)||(review.prepared?.recommendation?.bestCv?.role_code===code?review.prepared.recommendation.bestCv:null);return {code,path:cv?.local_path||''};}
function fingerprint(r){return hash(JSON.stringify([reviewEditorState(r),selected(r),r.formData?.jobTitle||'',r.formData?.organisationName||'',r.formData?.jobAdvertLink||'']));}
export const CV_FORMATS=['saved','pdf','docx','both','tailored'];
// Upload-friendly names, ASCII only so every portal and ZIP tool accepts them: Vijay_DAFAL_Delivery_Manager_CV.pdf
export function uploadFileName(candidate,role,kind,ext){const part=(v,f)=>String(v||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9 _-]/g,' ').trim().replace(/[\s_-]+/g,'_').slice(0,60).replace(/_+$/,'')||f;return `${part(candidate,'Candidate')}_${part(role,'Application')}_${kind}${ext}`;}
const otherFormat=path=>path.replace(/\.(pdf|docx)$/i,m=>m.toLowerCase()==='.pdf'?'.docx':'.pdf');
export async function exportApplicationPack({store,request,readCv,pack,word=null,documents=null,cvLibrary=null,candidateName='Candidate',tailoredCv=null,wordPathFor=null}){
 if(!request||typeof request!=='object'||Array.isArray(request))fail('An explicit export request is required.');
 const {reviewId,expectedBodyVersion,expectedSubjectVersion,expectedRevision,includeCv,expectedCvRoleCode,cvFormat='saved'}=request;
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(String(reviewId||''))||typeof includeCv!=='boolean')fail('Choose an application and explicit CV inclusion.');
 if(!CV_FORMATS.includes(cvFormat))fail('Choose a CV format: as saved, PDF, DOCX or both.');
 const review=store.get(reviewId);if(!review)fail('Saved application not found.',404);
 const state=reviewEditorState(review),cv=selected(review),before=fingerprint(review);
 if(expectedBodyVersion!==state.bodyVersion||expectedSubjectVersion!==state.subjectVersion||expectedRevision!==state.revision)fail('Application changed. Save/reload the current review before exporting.',409);
 if(includeCv&&(!cv.code||expectedCvRoleCode!==cv.code))fail('CV selection changed or is not saved. Apply the selected CV and retry export.',409);
 const plain=String(review.currentDraftPlainText||'').trim();
 if(!plain||plain.length>100000)fail('Save a non-empty reviewed letter before exporting.');
 // A recipient token is deliberate template data for export, not an unresolved send target.
 const validationPlain=plain.replace(/(?<!\{)\{\{\s*firstname\s*\}\}(?!\})/g,'ExportRecipientPlaceholder');
 if(/\{\{|\}\}/.test(validationPlain))fail('Replace unresolved placeholders other than the supported {{firstname}} token before exporting.');
 if(/<\/?[a-z][^>]*>/i.test(plain))fail('Current letter contains literal HTML. Save rendered text rather than pasted HTML source.');
 extractOutreachExperienceBody(validationPlain,['micro1']);
 const fallback=plain.split('\n').map(line=>{const m=/^Job advert:[ \t]*(https?:\/\/\S+)[ \t]*$/i.exec(line);if(m&&m[1]===String(review.formData?.jobAdvertLink||''))return `Job advert: <a href="${escapeHtml(m[1])}">${escapeHtml(m[1])}</a>`;return escapeHtml(line);}).join('<br>');
 const clean=sanitizeSnapshotHtml(review.currentDraftHtml||fallback);let comparable=clean.text;
 const advert=String(review.formData?.jobAdvertLink||'');let url='';try{url=new URL(advert).href;}catch{}
 if(url&&clean.links.some(l=>l.href===url))comparable=comparable.replace(/^Job advert:[ \t]*Job advert[ \t]*$/mi,()=>`Job advert: ${advert}`);
 let linkedComparable=restoreLinkedOpeningPlain(clean.text,clean.links,advert);
 if(url&&clean.links.some(l=>l.href===url))linkedComparable=linkedComparable.replace(/^Job advert:[ \t]*Job advert[ \t]*$/mi,()=>`Job advert: ${advert}`);
 const norm=s=>s.replace(/\s+/gu,' ').trim();if(norm(comparable)!==norm(plain)&&norm(linkedComparable)!==norm(plain))fail('Saved plain and formatted letter disagree. Save/review the letter again.',409);
 const portal=toPortalLetter({plain,html:clean.html});
 if(!portal.ok)fail(portal.reason==='greeting'?'Could not set the career-portal greeting consistently. Check the saved greeting line, save, then export again.':'Could not remove the ATS closing paragraph consistently. Save/review the letter, then export again.',409);
 const subject=state.subject,stem=safeExportStem([review.formData?.organisationName,review.formData?.jobTitle].filter(Boolean).join('-'));
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:1rem;color:#18202b}mark{background:#fff2a8}a{overflow-wrap:anywhere}</style></head><body>${portal.html}</body></html>`;
 // The current CV library is the source of truth for the file; the review's ranking snapshot is only a fallback.
 let cvPath=cv.path,cvSource='saved selection',libraryEntry=null;
 if(includeCv&&typeof cvLibrary==='function'){libraryEntry=(await cvLibrary()).find(v=>v?.role_code===cv.code)||null;if(!libraryEntry?.local_path)fail('The selected CV is no longer in the CV library. Choose another CV, apply it, then export again.',409);cvPath=String(libraryEntry.local_path);cvSource='current CV library';}
 const role=review.formData?.jobTitle||libraryEntry?.role_name||'';
 const letterName=ext=>uploadFileName(candidateName,role,'Cover_Letter',ext);
 const files=[{name:'cover-letter.txt',bytes:Buffer.from(portal.plain+'\n','utf8')},{name:'cover-letter.html',bytes:Buffer.from(html,'utf8')}];
 const documentsResult=documents?await documents({plain:portal.plain,html:portal.html,bodyVersion:state.bodyVersion,subjectVersion:state.subjectVersion,revision:state.revision}):null;
 if(documentsResult){
  const names=['cover-letter.docx','cover-letter.pdf','cover-letter-export.json'];
  if(!Array.isArray(documentsResult)||documentsResult.length!==names.length||documentsResult.some((f,i)=>f.name!==names[i]||!Buffer.isBuffer(f.bytes)||!f.bytes.length))fail('Incomplete or invalid template export.');
  files.push({name:letterName('.docx'),bytes:documentsResult[0].bytes},{name:letterName('.pdf'),bytes:documentsResult[1].bytes},documentsResult[2]);
 }else if(word)files.push({name:letterName('.docx'),bytes:await word(portal.plain)});
 const letterNote=`${documentsResult?'Word template, plus PDF':word?'Plain Word (no letter template configured; bullets, highlights and letterhead not included)':'Text and HTML only'}\nGreeting: ${portal.greetingReplaced?PORTAL_GREETING:'unchanged (no greeting line found)'}\nATS closing paragraph: ${portal.closingRemoved?'removed':'not present'}`;
 let cvNote='Not included (explicit user choice).';
 if(includeCv&&cvFormat==='tailored'){
  // The latest tailored CV built for this application, only when it was built from the CV selected now.
  const t=typeof tailoredCv==='function'?await tailoredCv(reviewId):null;
  if(!t||!Buffer.isBuffer(t.bytes))fail('No tailored CV has been built for this application yet. Use Tailored CV on this page, or choose another CV option.',409);
  if(t.roleCode!==cv.code)fail(`The tailored CV was built from CV ${t.roleCode}, but CV ${cv.code} is selected now. Build it again or choose another CV option.`,409);
  const name=uploadFileName(candidateName,role,'CV','.docx');files.push({name,bytes:t.bytes});
  cvNote=`${name} (SHA-256 ${hash(t.bytes)})\nCV code: ${cv.code}\nCV source: tailored CV version ${t.version}, built from ${t.baseName}`;
 }else if(includeCv){
  if(!cvPath||typeof readCv!=='function')fail('Selected CV metadata/reader is unavailable.');
  const savedExt=extname(cvPath).toLowerCase();if(!['.pdf','.docx'].includes(savedExt))fail('Unsupported CV format.');
  const wanted=cvFormat==='saved'?[savedExt]:cvFormat==='both'?['.pdf','.docx']:['.'+cvFormat];
  const lines=[];
  for(const ext of wanted){
   // The Word version is found the same way as for Tailored CV (same name, saved choice, or the only Word file in the folder).
   let path=ext===savedExt?cvPath:otherFormat(cvPath);if(ext==='.docx'&&ext!==savedExt&&typeof wordPathFor==='function'){try{path=(await wordPathFor(cv.code,cvPath))||path;}catch{}}let bytes;
   try{bytes=await readCv(path);}catch(e){if(ext===savedExt)throw e;fail(`No ${ext.slice(1).toUpperCase()} version of this CV was found. Save it as "${path.split(/[\\/]/).pop()}" in the same CV folder as the ${savedExt.slice(1).toUpperCase()}, or choose another format.`,409);}
   const name=uploadFileName(candidateName,role,'CV',ext);files.push({name,bytes});lines.push(`${name} (SHA-256 ${hash(bytes)})`);
  }
  cvNote=`${lines.join('\n')}\nCV code: ${cv.code}\nCV source: ${cvSource}`;
 }
 const current=store.get(reviewId);if(!current||fingerprint(current)!==before)fail('Application or CV selection changed during export. Nothing downloaded; retry after review.',409);
 files.push({name:'application.txt',bytes:Buffer.from(`Subject: ${subject}\nEmployer: ${review.formData?.organisationName||''}\nRole: ${review.formData?.jobTitle||''}\nAdvert: ${advert}\nLetter: ${letterNote}\nCV: ${cvNote}\n\nPrepared application files only; not proof of ATS submission.\nNo research/polishing/Gmail operation was triggered by export.\n`,'utf8')});
 return {filename:stem+'-application.zip',stem,bytes:await pack(files)};
}
