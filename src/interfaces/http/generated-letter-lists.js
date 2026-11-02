import {sanitizeSnapshotHtml} from '../../application/outreach-message-snapshot.js';
// View-only normalisation. Callers still save/accept through versioned snapshot validation.
const inline=new Set(['b','strong','i','em','u','s','span','mark','a']);
function tokens(s){return s.match(/<[^>]*>|[^<]+/g)||[];}
function balanced(s){const stack=[];for(const t of tokens(s)){if(!t.startsWith('<'))continue;const m=/^<(\/?)([a-z]+)\b[^>]*>$/i.exec(t);if(!m||!inline.has(m[2].toLowerCase()))return false;if(m[1]){if(stack.pop()!==m[2].toLowerCase())return false;}else stack.push(m[2].toLowerCase());}return !stack.length;}
function visible(s){return s.replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|#39);/g,'x').trim();}
function item(s){
 if(!balanced(s)||/data-highlight-quote="[^\"]*•/i.test(s))return null;
 let offset=0;for(const t of tokens(s)){if(t.startsWith('<')){offset+=t.length;continue;}if(!t.trim()){offset+=t.length;continue;}const m=/^[ \t]*•[ \t]+/.exec(t);if(!m)return null;const result=s.slice(0,offset)+t.slice(m[0].length)+s.slice(offset+t.length);return visible(result)?result:null;}return null;
}
function group(units,separator){let out='',i=0;while(i<units.length){const first=units[i].item;if(first===null){out+=units[i].raw;if(i<units.length-1)out+=separator;i++;continue;}const items=[first];let last=i;
 while(true){let next=last+1;while(next<units.length&&units[next].blank)next++;if(next>=units.length||units[next].item===null)break;items.push(units[next].item);last=next;}
 out+='<ul>'+items.map(s=>'<li>'+s+'</li>').join('')+'</ul>';i=last+1;if(i<units.length)out+=separator;
 }return out;}
function compactNewListBoundaries(html){
 // Native block lists already supply a block boundary; generated br/blank-p padding is redundant.
 const blankParagraph='<p(?:\\s[^>]*)?>(?:\\s|<br\\s*\\/?\\s*>)*<\\/p>';
 return html.replace(/(?:<br>){2,}(?=<ul>)/gi,'').replace(/<\/ul>(?:<br>){2,}/gi,'</ul>')
  .replace(new RegExp('(?:'+blankParagraph+')+(?=<ul>)','gi'),'')
  .replace(new RegExp('<\\/ul>(?:'+blankParagraph+')+','gi'),'</ul>');
}
export function normaliseGeneratedListHtml(value){
 if(typeof value!=='string')throw new TypeError('Formatted letter must be a string.');
 if(!value.trim())return value;
 const html=sanitizeSnapshotHtml(value).html;
 // Existing lists are user-authored/previously normalised: never nest or rewrite them.
 if(/<\/?(?:ul|ol|li)\b/i.test(html)||!html.includes('•'))return html;
 if(!/<\/?p\b/i.test(html)){
  const lines=html.split(/<br\s*\/?\s*>/i);
  // Cross-line tags cannot safely be split. Preserve them for manual formatting.
  if(lines.some(s=>!balanced(s)))return html;
  return compactNewListBoundaries(group(lines.map(raw=>({raw,item:item(raw),blank:!visible(raw)})),'<br>'));
 }
 // Support a clean sequence of one paragraph per item, preserving paragraph styling.
 const units=[];const pattern=/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi;let at=0,m;
 while((m=pattern.exec(html))){if(html.slice(at,m.index).trim()||/<\/?p\b/i.test(m[1]))return html;const raw=m[0],inside=m[1],content=item(inside),open=raw.slice(0,raw.indexOf('>')+1);units.push({raw,item:content===null?null:open+content+'</p>',blank:!visible(inside)});at=pattern.lastIndex;}
 if(!units.length||html.slice(at).trim())return html;
 return compactNewListBoundaries(group(units,''));
}
