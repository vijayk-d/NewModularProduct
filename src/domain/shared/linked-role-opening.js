// The URL fallback is plain-text metadata, immediately following the application opening.
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function safeAdvertUrl(value){try{const u=new URL(String(value||''));return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!/[\r\n{}]/.test(String(value))?u.href:null;}catch{return null;}}
const opening=/^I am applying for the (.+?) opportunity(?=\.| at | advertised by )[^\r\n]*$/m;
export function linkedOpeningParts(text){
 const value=String(text).replace(/\r\n/g,'\n'),match=opening.exec(value);
 if(!match)return null;
 const after=match.index+match[0].length;
 const fallback=/^\nRole details:[ \t]*(https?:\/\/\S+)[ \t]*(?=\n|$)/.exec(value.slice(after));
 if(!fallback)return null;const url=safeAdvertUrl(fallback[1]);if(!url)return null;
 return {text:value,start:match.index,end:after,role:match[1],url,fallbackEnd:after+fallback[0].length};
}
export function renderLinkedRoleOpening(text,renderLine=escape){
 const p=linkedOpeningParts(text);if(!p)return null;
 const prefix='I am applying for the ',roleStart=p.start+prefix.length,roleEnd=roleStart+p.role.length;
 const first=p.text.slice(p.start,p.end);
 const linked=escape(prefix)+`<a href="${escape(p.url)}" target="_blank" rel="noopener noreferrer">${escape(p.role)}</a>`+escape(first.slice(prefix.length+p.role.length));
 const before=p.text.slice(0,p.start),after=p.text.slice(p.fallbackEnd);
 return before.split('\n').map(renderLine).join('<br>')+linked+after.split('\n').map(renderLine).join('<br>');
}
export function restoreLinkedOpeningPlain(text,links,advertUrl){
 const value=String(text).replace(/\r\n/g,'\n'),url=safeAdvertUrl(advertUrl);if(!url)return value;
 const match=opening.exec(value);if(!match)return value;
 const start=match.index+'I am applying for the '.length,end=start+match[1].length;
 const link=(links||[]).find(l=>l.href===url&&l.textStart===start&&l.textEnd===end&&l.text===match[1]);
 if(!link)return value;
 const offset=match.index+match[0].length;
 if(/^\nRole details:/.test(value.slice(offset)))return value;
 return value.slice(0,offset)+'\nRole details: '+url+value.slice(offset);
}

export function canonicalLinkedOpeningPlain(text){
 const p=linkedOpeningParts(text);if(!p)return String(text);
 return p.text.slice(0,p.end)+'\nRole details: '+p.url+p.text.slice(p.fallbackEnd);
}
