// legacy-advert-normalization-v1: only a recognized boilerplate line and its exact stored URL.
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const decode=s=>String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(all,v)=>v[0]==='#'?((n)=>n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):all)(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[v.toLowerCase()]);
function target(value){try{const u=new URL(String(value||''));return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function href(attributes){
 const re=/\s+([a-z][\w-]*)\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)')/gi,values={};let end=0,m;
 while((m=re.exec(attributes))){if(attributes.slice(end,m.index).trim())return null;const key=m[1].toLowerCase();if(!['href','target','rel'].includes(key)||Object.hasOwn(values,key))return null;values[key]=decode(m[2]??m[3]);end=re.lastIndex;}
 if(attributes.slice(end).trim()||!values.href)return null;
 if(values.target&&!['_blank','_self'].includes(values.target))return null;
 if(values.rel&&!values.rel.split(/\s+/).every(v=>['noreferrer','noopener','nofollow'].includes(v.toLowerCase())))return null;
 return target(values.href);
}
const prefix='(?:You can view the job advert here:|LinkedIn(?: job advert)?:|Job advert:)';
function rawRanges(text,url){const re=new RegExp('^[ \\t]*'+prefix+'[ \\t]*<a\\b([^\\r\\n>]*)>[ \\t]*Job advert[ \\t]*<\\/a>[ \\t]*$','gmi'),out=[];for(const m of text.matchAll(re))if(href(m[1])===url)out.push({start:m.index,end:m.index+m[0].length});return out;}
export function normalizeLegacyAdvertPlain(text,advertUrl){
 const value=String(text||'').replace(/\r\n/g,'\n'),url=target(advertUrl);if(!url)return {text:value,changed:0};
 const ranges=rawRanges(value,url);let result=value;for(const r of [...ranges].reverse()){const before=result.slice(0,r.start),after=result.slice(r.end);const left=!before||before.endsWith('\n\n')?'':before.endsWith('\n')?'\n':'\n\n',right=!after||after.startsWith('\n\n')?'':after.startsWith('\n')?'\n':'\n\n';result=before+left+'Job advert: '+url+right+after;}
 return {text:result.trim(),changed:ranges.length,url};
}
export function embedCanonicalAdvertHtml(text,advertUrl){const url=target(advertUrl);if(!url)return String(text||'');return String(text||'').split('\n').map(line=>line.trim()==='Job advert: '+url?`Job advert: <a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(url)}</a>`:line).join('\n');}
function repairHtml(html,url,count){
 let offset=0;const spans=(String(html).match(/<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g)||[]).map(raw=>{const tag=raw.startsWith('<'),text=tag?(/^<br\b|^<\/?(?:p|div|li|ul|ol)\b/i.test(raw)?'\n':''):decode(raw);const s={raw,tag,text,start:offset,end:offset+text.length};offset+=text.length;return s;});
 const logical=spans.map(s=>s.text).join(''),ranges=rawRanges(logical,url);
 // Also support a genuine formatted legacy hyperlink, not just an escaped literal one.
 const real=new RegExp('^[ \\t]*'+prefix+'[ \\t]*Job advert[ \\t]*$','gmi');
 for(const m of logical.matchAll(real)){const start=m.index,end=m.index+m[0].length,anchors=spans.filter(s=>s.tag&&s.start>=start&&s.start<=end&&/^<a\b/i.test(s.raw));if(anchors.length===1&&href(anchors[0].raw.replace(/^<a\b/i,'').replace(/>$/,''))===url)ranges.push({start,end,actual:true});}
 if(ranges.length!==count){const e=new Error('Advert line matched plain text but not its formatted representation. No automatic rewrite was performed.');e.statusCode=400;e.code='ADVERT_NORMALIZATION_MISMATCH';throw e;}
 ranges.sort((a,b)=>a.start-b.start);const inserted=new Set();
 const replacement=`Job advert: <a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(url)}</a>`;
 return spans.map(s=>{
  if(s.tag){if(ranges.some(r=>r.actual&&s.start>=r.start&&s.start<=r.end&&/^<\/?a\b/i.test(s.raw)))return '';return s.raw;}
  let out='',pos=s.start;for(const r of ranges){if(r.end<=s.start||r.start>=s.end)continue;const left=Math.max(r.start,s.start),right=Math.min(r.end,s.end);out+=escape(s.text.slice(pos-s.start,left-s.start));if(!inserted.has(r)){out+=replacement;inserted.add(r);}pos=right;}return out+escape(s.text.slice(pos-s.start));
 }).join('');
}
export function normalizeLegacyAdvertSnapshot({bodyPlainText,bodyHtml},advertUrl){
 if(bodyHtml!==undefined&&bodyHtml!==''&&(typeof bodyHtml!=='string'||!bodyHtml.trim()||bodyHtml.length>300000)){const e=new Error('Formatted message must be a non-empty HTML string of at most 300000 characters.');e.statusCode=400;e.code='MESSAGE_HTML_INVALID';throw e;}
 const plain=normalizeLegacyAdvertPlain(bodyPlainText,advertUrl);if(!plain.changed)return {bodyPlainText,bodyHtml,changed:0};
 const html=typeof bodyHtml==='string'&&bodyHtml.trim()?repairHtml(bodyHtml,plain.url,plain.changed):plain.text.split('\n').map(line=>line.trim()==='Job advert: '+plain.url?embedCanonicalAdvertHtml(line,plain.url):escape(line)).join('<br>');
 return {bodyPlainText:plain.text,bodyHtml:html,changed:plain.changed};
}
