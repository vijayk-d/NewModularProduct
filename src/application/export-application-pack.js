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
export async function exportApplicationPack({store,request,readCv,pack,word=null,documents=null}){
 if(!request||typeof request!=='object'||Array.isArray(request))fail('An explicit export request is required.');
 const {reviewId,expectedBodyVersion,expectedSubjectVersion,expectedRevision,includeCv,expectedCvRoleCode}=request;
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(String(reviewId||''))||typeof includeCv!=='boolean')fail('Choose an application and explicit CV inclusion.');
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
 const files=[{name:'cover-letter.txt',bytes:Buffer.from(portal.plain+'\n','utf8')},{name:'cover-letter.html',bytes:Buffer.from(html,'utf8')}];
 const documentsResult=documents?await documents({plain:portal.plain,html:portal.html,bodyVersion:state.bodyVersion,subjectVersion:state.subjectVersion,revision:state.revision}):null;
 if(documentsResult){
  const names=['cover-letter.docx','cover-letter.pdf','cover-letter-export.json'];
  if(!Array.isArray(documentsResult)||documentsResult.length!==names.length||documentsResult.some((f,i)=>f.name!==names[i]||!Buffer.isBuffer(f.bytes)||!f.bytes.length))fail('Incomplete or invalid template export.');
  files.push(...documentsResult);
 }else if(word)files.push({name:'cover-letter.docx',bytes:await word(portal.plain)});
 const letterNote=`${documentsResult?'Word template with header, plus PDF':word?'Plain Word (no letter template configured; bullets, highlights and header not included)':'Text and HTML only'}\nGreeting: ${portal.greetingReplaced?PORTAL_GREETING:'unchanged (no greeting line found)'}\nATS closing paragraph: ${portal.closingRemoved?'removed':'not present'}`;
 let cvNote='Not included (explicit user choice).';
 if(includeCv){if(!cv.path||typeof readCv!=='function')fail('Selected CV metadata/reader is unavailable.');const bytes=await readCv(cv.path);const ext=extname(cv.path).toLowerCase();if(!['.pdf','.docx'].includes(ext))fail('Unsupported CV format.');const name='cv-'+safeExportStem(cv.code)+ext;files.push({name,bytes});cvNote=`${name}\nCV code: ${cv.code}\nCV SHA-256: ${hash(bytes)}`;}
 const current=store.get(reviewId);if(!current||fingerprint(current)!==before)fail('Application or CV selection changed during export. Nothing downloaded; retry after review.',409);
 files.push({name:'application.txt',bytes:Buffer.from(`Subject: ${subject}\nEmployer: ${review.formData?.organisationName||''}\nRole: ${review.formData?.jobTitle||''}\nAdvert: ${advert}\nLetter: ${letterNote}\nCV: ${cvNote}\n\nPrepared application files only; not proof of ATS submission.\nNo research/polishing/Gmail operation was triggered by export.\n`,'utf8')});
 return {filename:stem+'-application.zip',bytes:await pack(files)};
}
