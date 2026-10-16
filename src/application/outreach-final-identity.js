import {renderLinkedRoleOpening,restoreLinkedOpeningPlain,canonicalLinkedOpeningPlain} from '../domain/shared/linked-role-opening.js';
import { recipientFirstName, assertResolvedMessage } from './outreach-recipient-identity.js';
import { escapeHtml, sanitizeSnapshotHtml } from './outreach-message-snapshot.js';
const bad=message=>{const e=new Error(message);e.statusCode=400;throw e;};
const decode=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|mdash|ndash);/gi,(_,v)=>v[0]==='#'?String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',mdash:'—',ndash:'–'})[v.toLowerCase()]);
function name(value,label){const s=String(value||'').trim();if(!s||s.length>160||/[\r\n<>@{}\[\]\/\\:]|https?/i.test(s))bad(`${label} must be a name, not a URL or placeholder.`);return s;}
function ranges(text,first,candidate){
 const a=/Dear[^\r\n]*/i.exec(text),b=/(?:Warm regards|Kind regards|Best regards|Regards|Sincerely),?[ \t]*\r?\n+([ \t]*[^\r\n]+)[\s\r\n]*$/i.exec(text);
 if(!a||text.slice(0,a.index).trim())bad('Start the final letter with a Dear greeting.');
 if(!b)bad('End the final letter with a regards line followed by the candidate name.');
 const start=b.index+b[0].indexOf(b[1]);
 return [{start:a.index,end:a.index+a[0].length,value:`Dear ${first},`},{start,end:start+b[1].length,value:candidate}];
}
export function finalizeOutreachIdentity(snapshot,{firstName,candidateName,advertUrl=''}={}){
 const first=recipientFirstName({firstName}),candidate=name(candidateName,'Candidate name');
 let plain=canonicalLinkedOpeningPlain(String(snapshot.bodyPlainText)).replace(/\r\n/g,'\n').trim();
 for(const r of ranges(plain,first,candidate).reverse())plain=plain.slice(0,r.start)+r.value+plain.slice(r.end);
 assertResolvedMessage(plain);
 if(!snapshot.bodyHtml)return {bodyPlainText:plain,bodyHtml:renderLinkedRoleOpening(plain) ?? plain.split('\n').map(escapeHtml).join('<br>')};
 const clean=sanitizeSnapshotHtml(snapshot.bodyHtml);let offset=0;
 const spans=(clean.html.match(/<[^>]+>|[^<]+/g)||[]).map(raw=>{
  const tag=raw.startsWith('<'),text=tag?(/^<br\b|^<\/?(?:p|div|li|ul|ol)\b/i.test(raw)?'\n':''):decode(raw);
  const span={raw,tag,text,start:offset,end:offset+text.length};offset+=text.length;return span;
 });
 const changes=ranges(spans.map(s=>s.text).join(''),first,candidate),inserted=new Set();
 const html=spans.map(s=>{
  if(s.tag)return s.raw;let result='',pos=s.start;
  for(const r of changes){if(r.end<=s.start||r.start>=s.end)continue;
   const left=Math.max(r.start,s.start),right=Math.min(r.end,s.end);
   result+=escapeHtml(s.text.slice(pos-s.start,left-s.start));
   if(!inserted.has(r)){result+=escapeHtml(r.value);inserted.add(r);}pos=right;
  }
  return result+escapeHtml(s.text.slice(pos-s.start));
 }).join('');
 const rendered=sanitizeSnapshotHtml(html);assertResolvedMessage(rendered.html,rendered.text);let comparable=restoreLinkedOpeningPlain(rendered.text,rendered.links,advertUrl);
 if(advertUrl&&rendered.links.some(l=>l.href===new URL(advertUrl).href))comparable=comparable.replace(/^Job advert:[ \t]*Job advert[ \t]*$/mi,()=>`Job advert: ${advertUrl}`);
 const norm=s=>s.replace(/\s+/gu,' ').trim();
 if(norm(comparable)!==norm(plain))bad('Plain-text and formatted message disagree after identity resolution. Refresh the editor.');
 return {bodyPlainText:plain,bodyHtml:rendered.html};
}

