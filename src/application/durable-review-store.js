import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(JSON.stringify(v)??'undefined').digest('hex');
export function reviewStoreError(message,code='REVIEW_STORE_INVALID',statusCode=503){const e=new Error(message);e.code=code;e.statusCode=statusCode;return e;}
function clean(value){
 let copy;try{copy=JSON.parse(JSON.stringify(value));}catch{throw reviewStoreError('Saved review must be serializable.');}
 if(!copy||typeof copy!=='object'||Array.isArray(copy))throw reviewStoreError('Saved review must be a JSON object.');
 delete copy._storageMeta;
 const forbidden=new Set(['apiKey','api_key','authorization','password','access_token','accessToken','refresh_token','refreshToken','client_secret','clientSecret','GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_REFRESH_TOKEN','PERPLEXITY_API_KEY','__proto__','prototype','constructor']);
 const forbiddenLower=new Set([...forbidden].map(k=>k.toLowerCase()));
 const check=(v,depth=0)=>{if(depth>60)throw reviewStoreError('Saved review nesting is too deep.');if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(forbiddenLower.has(k.toLowerCase()))throw reviewStoreError('Credential/prototype fields must not be persisted in reviews.');check(x,depth+1);}};
 check(copy);if(Buffer.byteLength(JSON.stringify(copy))>2*1024*1024)throw reviewStoreError('Saved application exceeds 2 MiB.');return copy;
}
const hashes=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,hash(x)]));
export function createDurableReviewStore(repository){
 const store={durable:repository.durable===true,
  get(id){const row=repository.read(id);if(!row)return undefined;const value=clean(row.value);return {...value,_storageMeta:{revision:row.revision,fields:hashes(value)}};},
  has(id){return Boolean(repository.read(id));},
  set(id,input){
   if(typeof id!=='string'||!(/^[A-Za-z0-9_-]{1,100}$/).test(id)||!input||typeof input!=='object'||Array.isArray(input))throw reviewStoreError('Review identity/value is invalid.');
   const incoming=clean(input),meta=input._storageMeta;
   for(let attempt=0;attempt<3;attempt++){
    const row=repository.read(id),current=row?clean(row.value):{},revision=row?.revision||0;
    if(row&&!meta)throw reviewStoreError('A saved application cannot be overwritten without its revision.','REVIEW_STORE_CONFLICT',409);
    const fields=meta?.fields||{},changed=[...new Set([...Object.keys(fields),...Object.keys(incoming)])].filter(k=>hash(incoming[k])!==(fields[k]??hash(undefined)));
    // A new plain draft invalidates old formatting unless this update supplies new formatting too.
    if(changed.includes('currentDraftPlainText')&&!changed.includes('currentDraftHtml')&&current.currentDraftHtml!==undefined){delete incoming.currentDraftHtml;changed.push('currentDraftHtml');}
    for(const k of changed)if(row&&hash(current[k])!==(fields[k]??hash(undefined))&&hash(current[k])!==hash(incoming[k]))throw reviewStoreError('The same application field changed elsewhere. Reload before saving.','REVIEW_STORE_CONFLICT',409);
    const next={...current};for(const k of changed){if(incoming[k]===undefined)delete next[k];else Object.defineProperty(next,k,{value:incoming[k],enumerable:true,writable:true,configurable:true});}
    if(row&&hash(next)===hash(current))return store;
    try{repository.write(id,revision,clean(next));return store;}catch(e){if(e.code!=='REVIEW_STORE_CONFLICT'||attempt===2)throw e;}
   }
   return store;
  },
  summaries(options={}){return repository.summaries(options);},
  close(){repository.close?.();}
 };
 return store;
}
export function createMemoryReviewRepository(){
 const rows=new Map();return {read:id=>rows.has(id)?structuredClone(rows.get(id)):undefined,
  write(id,revision,value){if((rows.get(id)?.revision||0)!==revision)throw reviewStoreError('Revision changed.','REVIEW_STORE_CONFLICT',409);rows.set(id,{revision:revision+1,value:structuredClone(value)});},
  summaries({query='',page=1,size=20}={}){const items=[...rows].map(([id,r])=>({id,revision:r.revision,jobTitle:r.value.formData?.jobTitle||'',organisation:r.value.formData?.organisationName||'',subject:r.value.currentDraftSubject||r.value.prepared?.coverLetter?.subject||'',cvCode:r.value.selectedCvRoleCode||'',advertUrl:r.value.formData?.jobAdvertLink||''})).filter(r=>!query||[r.jobTitle,r.organisation,r.subject].some(v=>v.toLowerCase().includes(query.toLowerCase())));const pages=Math.max(1,Math.ceil(items.length/size)),p=Math.min(pages,Math.max(1,page));return {items:items.slice((p-1)*size,p*size),total:items.length,page:p,pages};}};
}
