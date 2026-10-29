import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';
export function compare(cvs,roles){
 const expected=new Map(cvs.map(c=>[c.role_code,c])),actual=new Map(roles.map(r=>[r.roleCode,r]));
 return {catalogueCount:cvs.length,selectorCount:roles.length,missingFromSelector:[...expected.keys()].filter(c=>!actual.has(c)),notInCatalogue:[...actual.keys()].filter(c=>!expected.has(c)),amendedNamesNotReflected:cvs.filter(c=>actual.has(c.role_code)&&actual.get(c.role_code).roleName!==c.role_name).map(c=>({roleCode:c.role_code,catalogueName:c.role_name,selectorName:actual.get(c.role_code).roleName})),documentAvailabilityMismatch:cvs.filter(c=>actual.has(c.role_code)&&Boolean(c.local_path)!==Boolean(actual.get(c.role_code).hasDocument)).map(c=>c.role_code)};
}
async function smallJson(file){const st=await fs.stat(file);if(!st.isFile()||st.size>1048576)throw Error('Expected a JSON catalogue smaller than 1 MiB.');return JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));}
export async function audit(root){
 root=await fs.realpath(root);if(await fs.stat(path.join(root,'release.json')).then(()=>true).catch(e=>{if(e.code==='ENOENT')return false;throw e;}))throw Error('Production release refused.');
 const env=parseEnv((await fs.readFile(path.join(root,'.env'),'utf8')).replace(/^\uFEFF/,''));
 if((env.NMP_ENV||'development')!=='development'||String(env.PORT||'3000')!=='3000'||!['127.0.0.1','localhost','::1'].includes(env.HOST||'127.0.0.1'))throw Error('Only loopback development on port 3000 is supported.');
 const shared=String(env.NMP_CV_LIBRARY_DIRECTORY||'').trim(),catalogue=shared?path.join(path.resolve(shared),'catalogue.json'):path.join(root,'config','cv-library.json'),parsed=await smallJson(catalogue),cvs=parsed.cvs||parsed.cv_inventory?.cvs;
 if(!Array.isArray(cvs)||!cvs.length||cvs.length>500||cvs.some(c=>typeof c.role_code!=='string'||typeof c.role_name!=='string')||new Set(cvs.map(c=>c.role_code)).size!==cvs.length)throw Error('Review the catalogue structure, role names and unique IDs.');
 const configured=shared?catalogue:String(env.CV_INVENTORY_PATH||'').trim(),active=configured?path.resolve(root,configured):null;
 const [realCatalogue,realActive]=await Promise.all([fs.realpath(catalogue),active?fs.realpath(active).catch(()=>null):null]);
 const inventoryPointsToCatalogue=Boolean(realActive&&realCatalogue===realActive);
 const hostname=env.HOST==='::1'?'[::1]':env.HOST||'127.0.0.1';
 const response=await fetch('http://'+hostname+':3000/api/preparation/options',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('Development options endpoint returned HTTP '+response.status+'.');
 if(Number(response.headers.get('content-length')||0)>1048576)throw Error('Options response too large.');
 const reader=response.body.getReader();let total=0,chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>1048576){await reader.cancel();throw Error('Options response too large.');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(data.ok!==true||!Array.isArray(data.roles)||data.roles.some(r=>typeof r.roleCode!=='string'||typeof r.roleName!=='string'))throw Error('Invalid development role-options response.');
 const differences=compare(cvs,data.roles),same=inventoryPointsToCatalogue&&['missingFromSelector','notInCatalogue','amendedNamesNotReflected','documentAvailabilityMismatch'].every(k=>!differences[k].length);
 return {status:same?'PREPARATION_SELECTOR_ALIGNED':'ALIGNMENT_REVIEW_NEEDED',inventoryPointsToCatalogue,...differences,note:'Read-only. The configured path is read from disk, not introspected from the running process. No document extraction, indexing, review refresh, email or configuration writes. Matching options does not prove ATS text/scoring freshness or that older saved reviews were refreshed.'};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--root'){console.error('Usage: node audit-cv-library-development.mjs --root PROJECT_ROOT');process.exitCode=1;}
 else audit(args[1]).then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('AUDIT STOPPED. Check that development is running on port 3000, its .env is configured for development, and config/cv-library.json is readable. No files were changed.');process.exitCode=1;});
}
