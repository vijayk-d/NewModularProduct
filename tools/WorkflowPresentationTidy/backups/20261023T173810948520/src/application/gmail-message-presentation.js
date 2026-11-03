import {extname} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const separator='\n\n-- \n';
const marker='<!-- application-gmail-signature:v1 -->';
function fail(message){throw Object.assign(new Error(message),{code:'GMAIL_PRESENTATION_BLOCKED',statusCode:400});}
export function cvDisplayName(candidate,role,source='.pdf'){const ext=['.pdf','.docx'].includes(String(source).toLowerCase())?String(source).toLowerCase():extname(String(source)).toLowerCase();if(!['.pdf','.docx'].includes(ext))fail('CV must use PDF or DOCX.');
 const part=(value,fallback)=>String(value||fallback).normalize('NFKC').replace(/[^\p{L}\p{N} _-]/gu,' ').trim().replace(/[\s_-]+/gu,'_').slice(0,70).replace(/_+$/,'')||fallback;
 return `${part(candidate,'Candidate')}_${part(role,'Application')}_CV${ext}`;
}
export function letterWithoutSignature(plain,html=''){
 const value=String(plain||'').replace(/\r\n/g,'\n').trim();
 const occurrences=value.split(separator).length-1;
 const hasMarker=String(html||'').includes(marker);
 if(!occurrences){if(hasMarker)fail('Signature plain-text and HTML boundary disagree.');return value;}
 if(occurrences!==1||!hasMarker)fail('Signature boundary is missing, duplicated or inconsistent.');
 const [letter,signature]=value.split(separator);
 if(!letter.trim()||!signature.trim())fail('Signature or letter is empty.');
 return letter.trim();
}
export function readGmailSignature({expectedAddress,env=process.env,spawnImpl=spawn}={}){
 return new Promise((resolve,reject)=>{
  let child,out='',done=false,timer;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
  try{child=spawnImpl(env.PYTHON||(process.platform==='win32'?'python':'python3'),['-B',fileURLToPath(new URL('../../python-worker/gmail_signature_reader.py',import.meta.url))],{stdio:['pipe','pipe','pipe'],env:{...env,PYTHONIOENCODING:'utf-8:strict'}});}
  catch{finish(new Error('Signature reader could not start. Check Python configuration.'));return;}
  timer=setTimeout(()=>{child.kill();finish(new Error('Signature read timed out; no message creation was requested.'));},60000);
  child.on('error',()=>finish(new Error('Signature reader could not start.')));
  child.stdin.on('error',()=>finish(new Error('Signature reader input failed.')));
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{out+=chunk;if(Buffer.byteLength(out)>200000){child.kill();finish(new Error('Signature reader response is too large.'));}});
  child.stderr.on('data',()=>{});
  child.on('close',code=>{
   if(done)return;
   try{const value=JSON.parse(out);if(code!==0||value.ok!==true||value.mailbox?.toLowerCase()!==String(expectedAddress).toLowerCase()||typeof value.html!=='string'||typeof value.plainText!=='string')throw new Error();finish(null,value);}
   catch{finish(new Error('Gmail signature could not be verified/read. No unsigned fallback was used.'));}
  });
  child.stdin.end(JSON.stringify({expectedAddress}),'utf8');
 });
}
export async function applyGmailSignature(draft,{account,env=process.env,signatureReader=readGmailSignature}={}){
 if(draft.bodyPlainText.includes(separator)||draft.bodyHtml.includes(marker))fail('This queued letter already contains an application signature. Review and requeue without a duplicate.');
 if(String(env.ENABLE_GMAIL_SIGNATURE||'').trim().toLowerCase()!=='true')return draft;
 const sig=await signatureReader({expectedAddress:account,env});
 if(sig.ok!==true||String(sig.mailbox).toLowerCase()!==String(account).toLowerCase()||!sig.html?.trim()||!sig.plainText?.trim())fail('A non-empty signature from the verified sending mailbox is required.');
 if(sig.html.length>100000||sig.plainText.length>20000||/\{\{|\}\}/.test(sig.html+sig.plainText)||sig.plainText.includes(separator)||sig.html.includes(marker))fail('Signature size or placeholders are invalid.');
 const bodyPlainText=draft.bodyPlainText.trimEnd()+separator+sig.plainText.trim();
 const bodyHtml=draft.bodyHtml+`<br><br>${marker}`+sig.html;
 if(bodyPlainText.length>100000||bodyHtml.length>300000)fail('Signed message exceeds body limits.');
 return {...draft,bodyPlainText,bodyHtml,signature:{source:'gmail-send-as',mailbox:sig.mailbox,sha256:createHash('sha256').update(sig.html+'\n'+sig.plainText).digest('hex'),containsImages:sig.containsImages===true}};
}
