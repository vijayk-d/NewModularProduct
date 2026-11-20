import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {sharedCvLayout,checkSharedCvOwnership,noLinkedPath,samePath} from '../../config/shared-cv-library-runtime.js';
import {extractAtsTerms} from '../../domain/ats/ats-engine.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const allowed=new Set(['role_code','role_name','local_path','tags','use_cases','priority','legacy_aliases']);
const priorities=new Set(['very-high','high','medium','low']);
export function relativeCvPath(value){
 if(typeof value!=='string'||!value.trim())throw fail('A relative document path is required.');
 const p=value.trim().replaceAll('\\','/'),parts=p.split('/');
 if(path.win32.isAbsolute(p)||path.posix.isAbsolute(p)||parts.some(x=>!x||x==='.'||x==='..'||/[<>:"|?*\x00-\x1f]/.test(x)||/[. ]$/.test(x)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(x)))throw fail('Document path must remain inside CV_FOLDER; links and absolute paths are not accepted.');
 if(!/\.(pdf|docx)$/i.test(p))throw fail('Only PDF and DOCX documents are supported.');
 return p;
}
export function normaliseCatalogue(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['cvs','cv_inventory'].includes(k))||(value.cvs&&value.cv_inventory))throw fail('Unsupported catalogue root.');
 const rows=value?.cvs??value?.cv_inventory?.cvs;
 if(!Array.isArray(rows)||!rows.length||rows.length>500)throw fail('Catalogue must contain between 1 and 500 CV entries.');
 const codes=new Set(),aliases=[];
 const cvs=rows.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!allowed.has(k)))throw fail('Unsupported entry fields. Use the cleaned catalogue; absolute legacy paths and extracted text do not belong here.');
  const text=(v,n,max)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw fail('Invalid '+n+'.');return v.trim();};
  const code=text(row.role_code,'role code',60);
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(code)||codes.has(code.toLowerCase()))throw fail('Role codes must be unique, including case-insensitive comparisons.');
  codes.add(code.toLowerCase());
  const list=(v,n)=>{if(v===undefined)return [];if(!Array.isArray(v)||v.length>100)throw fail('Invalid '+n+'.');return v.map(x=>text(x,n,200));};
  const entry={role_code:code,role_name:text(row.role_name,'role name',160),local_path:relativeCvPath(row.local_path),tags:list(row.tags,'tags'),use_cases:list(row.use_cases,'use cases'),priority:row.priority||'medium'};
  if(!priorities.has(entry.priority))throw fail('Unsupported priority.');
  if(row.legacy_aliases!==undefined){entry.legacy_aliases=list(row.legacy_aliases,'legacy aliases');for(const alias of entry.legacy_aliases)aliases.push(alias.toLowerCase());}
  return entry;
 });
 if(new Set(aliases).size!==aliases.length||aliases.some(x=>codes.has(x)))throw fail('Legacy aliases must not collide with another alias or canonical code.');
 return {cvs};
}
async function noLink(file){try{if((await fs.lstat(file)).isSymbolicLink())throw fail('Symbolic links are not accepted for managed files.',409);}catch(e){if(e.code!=='ENOENT')throw e;}}
async function atomic(file,data){
 await noLink(file);
 const temp=path.join(path.dirname(file),'.cv-library-'+randomUUID()+'.tmp');
 try{const h=await fs.open(temp,'wx',0o600);try{await h.writeFile(data);await h.sync();}finally{await h.close();}await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}
}
// describe(entry) is optional: it reports the Word file and the sections recognised, for the index and the library page.
export function createCvLibrary({projectRoot,cataloguePath,cvFolder,privateDirectory,adapter,sharedDirectory='',mode='development',describe=null}){
 const root=path.resolve(projectRoot),catalogue=path.resolve(cataloguePath),privateRoot=path.resolve(privateDirectory);
 const shared=Boolean(sharedDirectory);
 if(shared){const layout=sharedCvLayout({projectRoot:root,sharedDirectory,mode});if(!samePath(catalogue,layout.cataloguePath)||!samePath(privateRoot,layout.privateDirectory))throw fail('Shared CV paths do not match the configured layout.');}
 else if(mode!=='development'||catalogue!==path.join(root,'config','cv-library.json')||privateRoot!==path.join(root,'output','cv-library-v1'))throw fail('Unexpected CV-library storage configuration.');
 async function sharedWriter(fn){if(!shared)return fn();await checkSharedCvOwnership(sharedDirectory,cvFolder);const lock=path.join(sharedDirectory,'catalogue-write.lock');let h;try{h=await fs.open(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw fail('Shared catalogue is being updated. Reload/retry after the other save; do not delete locks blindly.',409);throw e;}try{return await fn();}finally{await h.close();await fs.unlink(lock);}}
 let queue=Promise.resolve();
 const exclusive=fn=>{const task=queue.then(async()=>{
  await preparePrivate();const lock=path.join(privateRoot,'operation.lock');let h;
  try{h=await fs.open(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw fail('Another library operation is running. A crash lock requires manual review while the server is stopped.',409);throw e;}
  try{return await fn();}finally{await h.close();await fs.unlink(lock);}
 });queue=task.catch(()=>{});return task;};
 async function preparePrivate(){
  if(shared){const live=await checkSharedCvOwnership(sharedDirectory,cvFolder);await fs.mkdir(privateRoot,{recursive:true});await noLinkedPath(privateRoot);if(!samePath(await fs.realpath(privateRoot),path.join(live,'indexes',mode)))throw fail('Shared cache path was redirected.',409);return;}
  const realRoot=await fs.realpath(root);
  await fs.mkdir(privateRoot,{recursive:true});
  if(await fs.realpath(privateRoot)!==path.join(realRoot,'output','cv-library-v1'))throw fail('Private cache must not be redirected through a link.',409);
 }
 async function load(){
  if(shared)await checkSharedCvOwnership(sharedDirectory,cvFolder);
  await noLink(path.dirname(catalogue));await noLink(catalogue);
  const st=await fs.stat(catalogue);if(!st.isFile()||st.size>1048576)throw fail('Catalogue must be a JSON file smaller than 1 MiB.');
  const raw=await fs.readFile(catalogue);let data;
  try{data=normaliseCatalogue(JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,'')));}catch(e){if(e.status)throw e;throw fail('Catalogue is not valid JSON.');}
  return {...data,etag:hash(raw),raw};
 }
 async function index(){
  const filename=path.join(privateRoot,'index.json');await noLink(filename);
  try{const st=await fs.stat(filename);if(st.size>70*1024*1024)throw fail('Index exceeds its safety limit.',409);const parsed=JSON.parse(await fs.readFile(filename,'utf8'));if(parsed.version!==1||!parsed.records||typeof parsed.records!=='object')throw fail('Index format invalid; preserve it and rebuild after review.',409);return parsed;}catch(e){if(e.code==='ENOENT')return {version:1,records:{}};throw e;}
 }
 async function resolveFile(entry){
  if(!cvFolder)throw fail('CV_FOLDER is not configured.',409);
  const realRoot=await fs.realpath(cvFolder),target=path.resolve(realRoot,...relativeCvPath(entry.local_path).split('/'));
  const rel=path.relative(realRoot,target);if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw fail('CV path escaped its root.',409);
  let walking=realRoot;for(const part of rel.split(path.sep)){walking=path.join(walking,part);await noLink(walking);}
  const real=await fs.realpath(target),actual=path.relative(realRoot,real);
  if(!actual||actual==='..'||actual.startsWith('..'+path.sep)||path.isAbsolute(actual))throw fail('CV path escaped its root.',409);
  const st=await fs.stat(real);if(!st.isFile()||st.size>20*1024*1024)throw fail('CV is not a regular file below the 20 MiB limit.',409);
  return {real,st};
 }
 // SHA-256 of the current file, remembered by size and modified time so unchanged files are not re-read.
 const hashes=new Map();
 async function fingerprint(entry){
  const {real,st}=await resolveFile(entry),key=real+'|'+st.size+'|'+st.mtimeMs;
  if(!hashes.has(key)){if(hashes.size>500)hashes.clear();hashes.set(key,hash(await fs.readFile(real)));}
  return {sha256:hashes.get(key),sizeBytes:st.size,mtimeMs:st.mtimeMs};
 }
 const meta=entry=>hash(JSON.stringify(entry));
 async function snapshot(){const c=await load();await preparePrivate();const i=await index(),indexed=[];
  for(const e of c.cvs){const r=i.records[e.role_code];indexed.push({role_code:e.role_code,status:await stateOf(e,r),indexedAt:r?.indexedAt||r?.checkedAt||null,wordCount:r?.wordCount||null,topTerms:r?.topTerms||[],word:r?.word||null,sections:r?.sections||'',describeError:r?.describeError||'',sizeBytes:r?.sizeBytes||null});}
  return {etag:c.etag,cvs:c.cvs,environment:mode,storage:shared?'shared':'development',cataloguePath:catalogue,indexed,autoIndex:{...autoState}};}
 async function validate(){const c=await load();await preparePrivate();const i=await index(),results=[];for(const e of c.cvs){try{const f=await fingerprint(e),record=i.records[e.role_code];results.push({role_code:e.role_code,...f,status:record?.status==='failed'?'failed':record?.sha256===f.sha256&&record.metadataHash===meta(e)&&record.text?'current':record?'stale':'not indexed'});}catch{results.push({role_code:e.role_code,status:'unavailable',error:'Check CV_FOLDER, the relative path, file permissions and size.'});}}return {etag:c.etag,results};}
 async function extract(entry){
  const before=await fingerprint(entry);
  const result=await adapter.extract({relativePath:entry.local_path,expectedHash:before.sha256});
  const after=await fingerprint(entry),text=String(result.text||'').trim();
  if(before.sha256!==after.sha256||(result.sha256&&result.sha256!==before.sha256)||!text||text.length>120000)throw fail('Document changed or usable text was unavailable.',409);
  let terms=[];try{terms=extractAtsTerms(text,{limit:12}).map(t=>t.term).slice(0,12);}catch{terms=[];}
  let described={};if(typeof describe==='function'){try{described=await describe(entry)||{};}catch(e){described={describeError:e?.status?e.message:'The Word version could not be checked.'};}}
  return {...before,text,metadataHash:meta(entry),status:'indexed',indexedAt:new Date().toISOString(),wordCount:(text.match(/\S+/g)||[]).length,topTerms:terms,
   word:described.word||null,sections:described.sections||'',describeError:described.describeError||'',
   warnings:Array.isArray(result.warnings)?result.warnings.map(x=>String(x).slice(0,500)).slice(0,20):[]};
 }
 // Where each CV stands against its index: indexed (current), changed since indexing, failed or not indexed.
 async function stateOf(entry,record){
  if(record?.status==='failed')return 'failed';
  if(!record?.text)return 'not indexed';
  try{const f=await fingerprint(entry);return f.sha256===record.sha256&&record.metadataHash===meta(entry)?'indexed':'changed';}catch{return 'unavailable';}
 }
 // Texts for CV ranking: only records that match the current file; anything else falls back to tags.
 async function indexedTexts(){
  const c=await load(),i=await index(),texts={},fallback=[];
  for(const e of c.cvs){const r=i.records[e.role_code];if(await stateOf(e,r)==='indexed')texts[e.role_code]=r.text;else fallback.push(e.role_code);}
  return {texts,fallback};
 }
 async function inspect(code){const c=await load(),entry=c.cvs.find(e=>e.role_code===code);if(!entry)throw fail('Unknown catalogue code.',404);return {role_code:code,...await extract(entry)};}
 async function save({etag,cvs}){return exclusive(()=>sharedWriter(async()=>{
  const next=normaliseCatalogue({cvs}),before=await load();if(etag!==before.etag)throw fail('Catalogue changed. Reload before saving; no changes were written.',409);
  if(before.cvs.some(e=>!next.cvs.some(n=>n.role_code===e.role_code)))throw fail('Removing or renaming existing codes is disabled to protect saved application references.',409);
  if(shared)for(const entry of next.cvs){const prior=before.cvs.find(e=>e.role_code===entry.role_code);if(!prior||prior.local_path!==entry.local_path)await fingerprint(entry);}
  const backupDir=path.join(shared?sharedDirectory:privateRoot,'backups');await fs.mkdir(backupDir,{recursive:true});await noLink(backupDir);
  const backup=path.join(backupDir,before.etag+'.json');await noLink(backup);
  try{await fs.writeFile(backup,before.raw,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;if(hash(await fs.readFile(backup))!==before.etag)throw fail('Existing backup failed integrity verification.',409);}
  if((await load()).etag!==before.etag)throw fail('Catalogue changed during save; reload first.',409);
  await atomic(catalogue,JSON.stringify(next,null,2)+'\n');return {etag:(await load()).etag,saved:true};
 }));}
 async function reindex({mode='changed',code}={}){if(!['changed','all'].includes(mode))throw fail('Invalid indexing mode.');return exclusive(async()=>{
  const c=await load(),i=await index(),results=[];if(code&&!c.cvs.some(e=>e.role_code===code))throw fail('Unknown catalogue code.',404);
  for(const e of c.cvs){if(code&&e.role_code!==code)continue;try{
   const f=await fingerprint(e),old=i.records[e.role_code];
   if(mode==='changed'&&old?.status==='indexed'&&old.text&&old.sha256===f.sha256&&old.metadataHash===meta(e)){results.push({role_code:e.role_code,status:'unchanged'});continue;}
   i.records[e.role_code]=await extract(e);results.push({role_code:e.role_code,status:'indexed'});
  }catch{i.records[e.role_code]={status:'failed',checkedAt:new Date().toISOString()};results.push({role_code:e.role_code,status:'failed',error:'No usable current text; stale cached text was removed.'});}}
  if((await load()).etag!==c.etag)throw fail('Catalogue changed during indexing. No index update was saved.',409);
  await atomic(path.join(privateRoot,'index.json'),JSON.stringify(i));return {results};
 });}
 async function discover(){
  const c=await load(),known=new Set(c.cvs.map(e=>e.local_path.toLowerCase())),rootPath=await fs.realpath(cvFolder),found=[];let visited=0,truncated=false;
  async function scan(dir,depth){await noLink(dir);const actual=await fs.realpath(dir),r=path.relative(rootPath,actual);if(r==='..'||r.startsWith('..'+path.sep)||path.isAbsolute(r))return;if(depth>10||visited>=2000){truncated=true;return;}for(const d of await fs.readdir(dir,{withFileTypes:true})){if(++visited>2000){truncated=true;break;}if(d.isSymbolicLink())continue;const p=path.join(dir,d.name);if(d.isDirectory())await scan(p,depth+1);else if(d.isFile()&&/\.(pdf|docx)$/i.test(d.name)){const rel=path.relative(rootPath,p).split(path.sep).join('/');try{relativeCvPath(rel);if(!known.has(rel.toLowerCase()))found.push(rel);}catch{}}}}
  await scan(rootPath,0);return {files:found,truncated};
 }
 // Background indexing: re-reads only changed CVs, at start-up and on an interval. Never blocks a request.
 const autoState={lastRunAt:null,lastResult:null,running:false};
 function startAutoIndex({initialDelayMs=20000,intervalMs=30*60*1000,log=console.warn}={}){
  const run=async()=>{if(autoState.running)return;autoState.running=true;try{const r=await reindex({mode:'changed'});const counts={indexed:0,unchanged:0,failed:0};for(const x of r.results)counts[x.status]=(counts[x.status]||0)+1;autoState.lastResult=counts;if(counts.failed)log('[CV_LIBRARY] AUTO_INDEX '+counts.failed+' CV(s) could not be indexed');}catch(e){autoState.lastResult={error:e?.status===409?'busy':'failed'};}finally{autoState.running=false;autoState.lastRunAt=new Date().toISOString();}};
  const first=setTimeout(run,initialDelayMs);first.unref?.();const every=setInterval(run,intervalMs);every.unref?.();
  return ()=>{clearTimeout(first);clearInterval(every);};
 }
 return {snapshot,validate,inspect,save,reindex,discover,indexedTexts,startAutoIndex,async exportCatalogue(){return {cvs:(await load()).cvs};}};
}
