import * as fs from 'node:fs/promises';
import path from 'node:path';
export const SHARED_CV_SCHEMA='shared-cv-library-v1';
export const samePath=(a,b)=>{a=path.resolve(a);b=path.resolve(b);return process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;};
export const within=(root,p)=>{const r=path.relative(root,p);return !r||r==='.'||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
export async function noLinkedPath(file){let p=path.resolve(file);for(;;){try{if((await fs.lstat(p)).isSymbolicLink())throw Error('CV-library managed links are not accepted.');}catch(e){if(e.code!=='ENOENT')throw e;}const parent=path.dirname(p);if(parent===p)return;p=parent;}}
export function sharedCvLayout({projectRoot,sharedDirectory,mode}){
 const root=path.resolve(projectRoot);if(!['development','production'].includes(mode)||typeof sharedDirectory!=='string'||!path.isAbsolute(sharedDirectory))throw Error('Shared CV configuration requires an absolute directory and a supported environment.');
 const shared=path.resolve(sharedDirectory);if(within(root,shared)||within(shared,root))throw Error('Keep shared CV storage separate from the application source/release directory.');
 return {shared:true,sharedDirectory:shared,mode,cataloguePath:path.join(shared,'catalogue.json'),privateDirectory:path.join(shared,'indexes',mode)};
}
export function resolveCvLibraryRuntime({env=process.env,mode,projectRoot,server,legacyInventoryPath}){
 const root=path.resolve(projectRoot),configured=String(env.NMP_CV_LIBRARY_DIRECTORY||'').trim(),loopback=['127.0.0.1','localhost','::1'].includes(server.host);
 if(mode==='verification')return {enabled:false,shared:false,mode,cataloguePath:legacyInventoryPath,inventoryPath:legacyInventoryPath};
 if(configured){const layout=sharedCvLayout({projectRoot:root,sharedDirectory:configured,mode});if(!loopback||server.port!==(mode==='production'?3100:3000))throw Error('Shared CV UI requires the expected loopback development/production port.');return {...layout,enabled:true,inventoryPath:layout.cataloguePath};}
 return {enabled:mode==='development'&&loopback&&server.port===3000,shared:false,mode,cataloguePath:path.join(root,'config','cv-library.json'),privateDirectory:path.join(root,'output','cv-library-v1'),inventoryPath:legacyInventoryPath};
}
export async function checkSharedCvOwnership(sharedDirectory,cvFolder){
 await noLinkedPath(sharedDirectory);const root=await fs.realpath(sharedDirectory),marker=path.join(root,'ownership.json');await noLinkedPath(marker);const st=await fs.stat(marker);if(!st.isFile()||st.size>8192)throw Error('Shared CV ownership marker unavailable.');const value=JSON.parse(await fs.readFile(marker,'utf8'));
 if(!(await fs.stat(cvFolder)).isDirectory())throw Error('CV_FOLDER must be a directory.');
 if(value.schema!==SHARED_CV_SCHEMA||!samePath(await fs.realpath(cvFolder),value.cvFolderRealPath))throw Error('Shared CV library is not initialised for this CV_FOLDER.');return root;
}
export async function assertSharedCvReady(runtime,cvFolder){if(!runtime.shared)return;await checkSharedCvOwnership(runtime.sharedDirectory,cvFolder);await noLinkedPath(runtime.cataloguePath);const st=await fs.stat(runtime.cataloguePath);if(!st.isFile()||st.size>1048576)throw Error('Shared CV catalogue unavailable or oversized.');const value=JSON.parse(await fs.readFile(runtime.cataloguePath,'utf8'));if(!Array.isArray(value.cvs)||!value.cvs.length||value.cvs.length>500)throw Error('Shared CV catalogue must contain a nonempty cvs array.');}
