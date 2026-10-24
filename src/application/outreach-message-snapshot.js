import {renderLinkedRoleOpening,restoreLinkedOpeningPlain,canonicalLinkedOpeningPlain} from '../domain/shared/linked-role-opening.js';
import { recipientFirstName } from './outreach-recipient-identity.js';
import {normalizeLegacyAdvertSnapshot} from '../domain/shared/legacy-advert-normalization.js';
function invalid(message) { const error = new Error(message); error.statusCode = 400; throw error; }
export function escapeHtml(value) {
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function decode(value) {
  const names={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',mdash:'—',ndash:'–'};
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|mdash|ndash);/gi,(all,entity)=>{
    if(entity[0]!=='#') return names[entity.toLowerCase()] || all;
    const number=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));
    return number>0 && number<=0x10ffff && !(number>=0xd800 && number<=0xdfff)?String.fromCodePoint(number):'';
  });
}
const normalize = text => String(text).replace(/\s+/gu,' ').trim();

function safeEditorStyle(value=''){
 if(/url\s*\(|expression\s*\(|@import|javascript:|[<>]/i.test(value))invalid('Unsafe editor formatting.');
 const output=[];for(const entry of String(value).split(';')){if(!entry.trim())continue;const i=entry.indexOf(':');if(i<1)invalid('Invalid editor style.');const key=entry.slice(0,i).trim().toLowerCase(),v=entry.slice(i+1).trim().toLowerCase();let ok=false;
 if(key==='font-weight')ok=/^(?:normal|bold|bolder|[1-9]00)$/.test(v);
 else if(key==='font-style')ok=/^(?:normal|italic|oblique)$/.test(v);
 else if(['text-decoration','text-decoration-line'].includes(key))ok=/^(?:none|underline|line-through|underline line-through|line-through underline)$/.test(v);
 else if(key==='text-align')ok=/^(?:left|right|center|justify|start|end)$/.test(v);
 else if(['background-color','color'].includes(key))ok=/^(?:#[0-9a-f]{3}(?:[0-9a-f]{3})?|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|black|white|yellow|red|blue|green|navy|gray|grey|maroon|purple)$/.test(v);
 else if(key==='white-space')ok=/^(?:normal|pre-wrap)$/.test(v);
 if(!ok)invalid('Unsupported editor style: '+key+'. Use supported formatting controls.');output.push(key+':'+v);
 }return output.join(';');
}

export function sanitizeSnapshotHtml(value) {
  if(typeof value!=='string' || !value.trim() || value.length>300000) invalid('Formatted message must contain between 1 and 300000 characters.');
  const allowed=new Set(['p','div','br','b','strong','i','em','u','s','ul','ol','li','span','mark','a']);
  const stack=[], plain=[], output=[], links=[];
  const tokens=value.match(/<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g) || [];
  for(const token of tokens) {
    if(!token.startsWith('<')) { const text=decode(token); plain.push(text); output.push(escapeHtml(text)); continue; }
    const match=token.match(/^<\s*(\/?)\s*([a-z][\w-]*)\b([\s\S]*?)\/?\s*>$/i);
    if(!match || !allowed.has(match[2].toLowerCase())) invalid('The message contains unsupported HTML. Use the editor formatting controls.');
    const tag=match[2].toLowerCase(), closing=Boolean(match[1]);
    if(closing) {
      const last=stack.pop(); if(!last || last.tag!==tag) invalid('Formatted message has mismatched HTML tags.');
      if(tag==='a'){const link=links.findLast(l=>l.textEnd===undefined);if(link){link.textEnd=plain.join('').length;link.text=plain.join('').slice(link.textStart,link.textEnd);}}
      output.push(`</${last.render}>`);
      if(['p','div','li','ul','ol'].includes(tag)) plain.push('\n');
      continue;
    }
    const attributes={}; const raw=match[3];
    const attr=/\s+([a-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;
    let position=0, item;
    while((item=attr.exec(raw))) {
      if(raw.slice(position,item.index).trim()) invalid('Formatted message has invalid attributes.');
      const key=item[1].toLowerCase();
      if(Object.hasOwn(attributes,key)) invalid('Formatted message has duplicate attributes.');
      attributes[key]=decode(item[2]??item[3]??item[4]??'');position=attr.lastIndex;
    }
    if(raw.slice(position).trim()) invalid('Formatted message has invalid attributes.');
    if(Object.values(attributes).some(text=>/\{\{|\}\}/.test(text))) invalid('Recipient placeholders are allowed in text only, not HTML attributes.');
    let render=tag==='div'?'p':tag;
    if(tag==='span' && (attributes['data-highlight']==='true' || /background(?:-color)?\s*:/i.test(attributes.style||''))) render='mark';
    let extra='';
    if(tag==='a') {
      let url; try {url=new URL(attributes.href || '');} catch {invalid('Message link must be a full HTTP or HTTPS URL.');}
      if(!['http:','https:'].includes(url.protocol) || url.username || url.password) invalid('Message link must use HTTP or HTTPS without embedded credentials.');
      links.push({href:url.href,textStart:plain.join('').length}); extra=` href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer"`;
    }
    const origin=attributes['data-highlight-origin']||(attributes['data-job-aligned']==='true'?'auto':attributes['data-highlight-manual']==='true'?'manual':'');
    if(render==='mark'&&['auto','manual','legacy'].includes(origin)){extra+=' data-highlight-origin="'+origin+'"';if(origin==='auto'){extra+=' data-job-aligned="true" data-highlight="true"';const id=attributes['data-highlight-id'];if(id&&/^[A-Za-z0-9_-]{1,80}$/.test(id))extra+=' data-highlight-id="'+id+'"';const quote=attributes['data-highlight-quote'];if(quote&&quote.length<=240&&!/[{}]/.test(quote))extra+=' data-highlight-quote="'+escapeHtml(quote)+'"';}}
    const styles=safeEditorStyle(attributes.style||'');
    if(render==='mark')extra+=' style="'+escapeHtml(styles||'background-color:#fff2a8')+'"';else if(styles)extra+=' style="'+escapeHtml(styles)+'"';
    if(['p','div','li'].includes(tag)) plain.push('\n');
    output.push(`<${render}${extra}>`);
    if(tag==='br') plain.push('\n'); else stack.push({tag,render});
  }
  if(stack.length) invalid('Formatted message has unclosed HTML tags.');
  return {html:output.join(''), text:plain.join(''),links};
}
export function snapshotMessage(bodyPlainText,bodyHtml,advertUrl='') {
  if(typeof bodyPlainText!=='string' || !bodyPlainText.trim() || bodyPlainText.length>100000) invalid('A non-empty message of at most 100000 characters is required.');
  bodyPlainText=canonicalLinkedOpeningPlain(bodyPlainText);
  const advertFix=normalizeLegacyAdvertSnapshot({bodyPlainText,bodyHtml},advertUrl);
  bodyPlainText=advertFix.bodyPlainText;bodyHtml=advertFix.bodyHtml;
  if(bodyHtml===undefined || bodyHtml==='') return {bodyPlainText:bodyPlainText.trim()};
  const clean=sanitizeSnapshotHtml(bodyHtml);
  const linkedPlain=restoreLinkedOpeningPlain(clean.text,clean.links,advertUrl);
  if(normalize(clean.text)!==normalize(bodyPlainText)&&normalize(linkedPlain)!==normalize(bodyPlainText)) invalid('Plain-text and formatted message disagree. Refresh the editor and queue again.');
  let text=(linkedPlain!==clean.text?linkedPlain:bodyPlainText).trim();
  let canonicalAdvert='';
  if(advertUrl){try{canonicalAdvert=new URL(advertUrl).href;}catch{invalid('The application advert URL is invalid.');}}
  if(canonicalAdvert && clean.links.some(link=>link.href===canonicalAdvert)) text=text.replace(/^Job advert:[ \t]*Job advert[ \t]*$/mi,()=>`Job advert: ${advertUrl}`);
  return {bodyPlainText:text,bodyHtml:clean.html};
}
function valuesFor(item) {
  const firstname = recipientFirstName(item);
  return {firstname,lastname:String(item.lastname||'').trim()};
}
function personalize(text,values,html=false) {
  const result=String(text).replace(/\{\{\s*(firstname|lastname)\s*\}\}/g,(all,key)=>html?escapeHtml(values[key]):values[key]);
  if(/\{\{|\}\}/.test(result)) invalid('Queued message contains an unsupported or unresolved placeholder.');
  return result;
}
export function stripEditorHighlightMetadata(html){return String(html).replace(/\sdata-(?:highlight-origin|highlight-id|highlight-quote|job-aligned|highlight|highlight-manual)="[^"]*"/g,'');}
export function prepareDraftSnapshot(item) {
  if(!item || typeof item.id!=='string' || !item.id || item.status!=='new') invalid('Choose new queue items with valid string IDs.');
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(item.email||'')) invalid('Queued recipient email is invalid.');
  if(typeof item.subject!=='string' || !item.subject.trim() || /[\r\n]/.test(item.subject)) invalid('Queued subject is invalid.');
  if(typeof item.bodyPlainText!=='string' || !item.bodyPlainText.trim()) invalid('Queued message body is empty.');
  const values=valuesFor(item);
  let html=item.bodyHtml?sanitizeSnapshotHtml(item.bodyHtml).html:(renderLinkedRoleOpening(item.bodyPlainText) ?? String(item.bodyPlainText||'').split('\n').map(escapeHtml).join('<br>'));
  html=personalize(html,values,true);
  const body=personalize(item.bodyPlainText,values);
  const attachment=item.attachment ? structuredClone(item.attachment) : null;
  if(item.application?.selectedCvRoleCode && !attachment) invalid('This queue item lacks selected-CV attachment metadata. Remove it and requeue the reviewed application.');
  return {queueId:item.id,recipient:{email:item.email,firstname:values.firstname,lastname:values.lastname},
    subject:personalize(item.subject,values),bodyPlainText:body,bodyHtml:stripEditorHighlightMetadata(html),attachment};
}


