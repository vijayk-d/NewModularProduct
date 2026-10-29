import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
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
  const code=text(row.role_code,'role code',80);
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
export function createCvLibrary({projectRoot,cataloguePath,cvFolder,privateDirectory,adapter}){
 const root=path.resolve(projectRoot),catalogue=path.resolve(cataloguePath),privateRoot=path.resolve(privateDirectory);
 if(catalogue!==path.join(root,'config','cv-library.json')||privateRoot!==path.join(root,'output','cv-library-v1'))throw fail('Unexpected CV-library storage configuration.');
 let queue=Promise.resolve();
 const exclusive=fn=>{const task=queue.then(async()=>{
  await preparePrivate();const lock=path.join(privateRoot,'operation.lock');let h;
  try{h=await fs.open(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw fail('Another library operation is running. A crash lock requires manual review while the server is stopped.',409);throw e;}
  try{return await fn();}finally{await h.close();await fs.unlink(lock);}
 });queue=task.catch(()=>{});return task;};
 async function preparePrivate(){
  const realRoot=await fs.realpath(root);
  await fs.mkdir(privateRoot,{recursive:true});
  if(await fs.realpath(privateRoot)!==path.join(realRoot,'output','cv-library-v1'))throw fail('Private cache must not be redirected through a link.',409);
 }
 async function load(){
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
 async function fingerprint(entry){
  if(!cvFolder)throw fail('CV_FOLDER is not configured.',409);
  const realRoot=await fs.realpath(cvFolder),target=path.resolve(realRoot,...relativeCvPath(entry.local_path).split('/'));
  const rel=path.relative(realRoot,target);if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw fail('CV path escaped its root.',409);
  let walking=realRoot;for(const part of rel.split(path.sep)){walking=path.join(walking,part);await noLink(walking);}
  const real=await fs.realpath(target),actual=path.relative(realRoot,real);
  if(!actual||actual==='..'||actual.startsWith('..'+path.sep)||path.isAbsolute(actual))throw fail('CV path escaped its root.',409);
  const st=await fs.stat(real);if(!st.isFile()||st.size>25*1024*1024)throw fail('CV is not a regular file below the 25 MiB limit.',409);
  return {sha256:hash(await fs.readFile(real)),sizeBytes:st.size};
 }
 const meta=entry=>hash(JSON.stringify(entry));
 async function snapshot(){const c=await load();await preparePrivate();const i=await index();return {etag:c.etag,cvs:c.cvs,indexed:c.cvs.map(e=>({role_code:e.role_code,indexedAt:i.records[e.role_code]?.indexedAt||null,status:i.records[e.role_code]?.status==='failed'?'failed':i.records[e.role_code]?.text?'indexed; current file not checked':'not indexed'}))};}
 async function validate(){const c=await load();await preparePrivate();const i=await index(),results=[];for(const e of c.cvs){try{const f=await fingerprint(e),record=i.records[e.role_code];results.push({role_code:e.role_code,...f,status:record?.status==='failed'?'failed':record?.sha256===f.sha256&&record.metadataHash===meta(e)&&record.text?'current':record?'stale':'not indexed'});}catch{results.push({role_code:e.role_code,status:'unavailable',error:'Check CV_FOLDER, the relative path, file permissions and size.'});}}return {etag:c.etag,results};}
 async function extract(entry){
  const before=await fingerprint(entry);
  const result=await adapter.extract({relativePath:entry.local_path,expectedHash:before.sha256});
  const after=await fingerprint(entry),text=String(result.text||'').trim();
  if(before.sha256!==after.sha256||(result.sha256&&result.sha256!==before.sha256)||!text||text.length>120000)throw fail('Document changed or usable text was unavailable.',409);
  return {...before,text,metadataHash:meta(entry),status:'indexed',indexedAt:new Date().toISOString(),warnings:Array.isArray(result.warnings)?result.warnings.map(x=>String(x).slice(0,500)).slice(0,20):[]};
 }
 async function inspect(code){const c=await load(),entry=c.cvs.find(e=>e.role_code===code);if(!entry)throw fail('Unknown catalogue code.',404);return {role_code:code,...await extract(entry)};}
 async function save({etag,cvs}){return exclusive(async()=>{
  const next=normaliseCatalogue({cvs}),before=await load();if(etag!==before.etag)throw fail('Catalogue changed. Reload before saving; no changes were written.',409);
  if(before.cvs.some(e=>!next.cvs.some(n=>n.role_code===e.role_code)))throw fail('Removing or renaming existing codes is disabled to protect saved application references.',409);
  const backupDir=path.join(privateRoot,'backups');await fs.mkdir(backupDir,{recursive:true});await noLink(backupDir);
  const backup=path.join(backupDir,before.etag+'.json');await noLink(backup);
  try{await fs.writeFile(backup,before.raw,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;if(hash(await fs.readFile(backup))!==before.etag)throw fail('Existing backup failed integrity verification.',409);}
  if((await load()).etag!==before.etag)throw fail('Catalogue changed during save; reload first.',409);
  await atomic(catalogue,JSON.stringify(next,null,2)+'\n');return {etag:(await load()).etag,saved:true};
 });}
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
 return {snapshot,validate,inspect,save,reindex,discover};
}
