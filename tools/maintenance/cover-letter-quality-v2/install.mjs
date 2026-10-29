import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {TARGETS} from './patches.mjs';
import {MANIFEST} from './manifest.mjs';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const blob=s=>{const b=Buffer.from(s);return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
export function plan(raw,target){
 const text=raw.toString('utf8').replace(/\r\n/g,'\n');
 if(blob(text)===target.gitBlob){let next=text;for(const p of target.patches){if(next.split(p.before).length!==2)throw Error('Patch anchor is missing or not unique: '+target.path);next=next.replace(p.before,p.after);}return {installed:false,bytes:Buffer.from(raw.includes(Buffer.from('\r\n'))?next.replaceAll('\n','\r\n'):next)};}
 let original=text;for(const p of [...target.patches].reverse()){if(original.split(p.after).length!==2)throw Error('Source baseline differs: '+target.path+'. No force option exists.');original=original.replace(p.after,p.before);}
 if(blob(original)!==target.gitBlob)throw Error('Installed source has unrelated changes: '+target.path);
 return {installed:true,bytes:raw};
}
const exists=async p=>fs.access(p).then(()=>true).catch(()=>false);
async function noLinks(root,file){let p=path.resolve(file);if(p!==root&&!p.startsWith(root+path.sep))throw Error('Managed path escaped the project.');while(p!==root){try{if((await fs.lstat(p)).isSymbolicLink())throw Error('Managed paths cannot be links.');}catch(e){if(e.code!=='ENOENT')throw e;}p=path.dirname(p);}}
async function replace(file,data){const temp=file+'.quality-v2.tmp';await fs.writeFile(temp,data,{flag:'wx'});try{await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}}
export async function install(root,mode,{targets=TARGETS,payload=MANIFEST,bundle=path.dirname(fileURLToPath(import.meta.url))}={}){
 root=await fs.realpath(root);if(await exists(path.join(root,'release.json')))throw Error('Production release refused.');
 const manifestPath='tools/maintenance/cover-letter-quality-v2/manifest.mjs';
 const backups=path.join(root,'.patch-backups','cover-letter-quality-v2-runtime'),record=path.join(backups,'installation.json');await noLinks(root,record);
 if(mode==='--rollback'){
  const r=JSON.parse(await fs.readFile(record,'utf8'));
  if(JSON.stringify(r.edits.map(x=>x.path).sort())!==JSON.stringify(targets.map(x=>x.path).sort())||JSON.stringify(r.added.map(x=>x.path).sort())!==JSON.stringify([...payload.map(x=>x.path),manifestPath].sort()))throw Error('Rollback record scope mismatch.');
  for(const e of r.edits){const f=path.join(root,e.path);await noLinks(root,f);if(![e.before,e.after].includes(sha(await fs.readFile(f))))throw Error('A modified source changed after installation; rollback refused.');const b=path.join(backups,e.backup);await noLinks(root,b);if(sha(await fs.readFile(b))!==e.before)throw Error('Backup integrity failed.');}
  for(const e of r.added){const f=path.join(root,e.path);await noLinks(root,f);if(await exists(f)&&sha(await fs.readFile(f))!==e.sha256)throw Error('An added feature file changed; rollback refused.');}
  for(const e of r.edits)if(sha(await fs.readFile(path.join(root,e.path)))!==e.before)await replace(path.join(root,e.path),await fs.readFile(path.join(backups,e.backup)));
  for(const e of r.added)if(e.created)await fs.unlink(path.join(root,e.path)).catch(x=>{if(x.code!=='ENOENT')throw x;});
  await fs.rename(record,path.join(backups,'rolled-back-'+Date.now()+'.json'));console.log('ROLLED BACK. Private .env and application data preserved.');return;
 }
 const edits=[];for(const target of targets){const f=path.join(root,target.path);await noLinks(root,f);const original=await fs.readFile(f),p=plan(original,target);edits.push({...target,original,...p});}
 if(edits.some(e=>e.installed)&&!edits.every(e=>e.installed))throw Error('Partial installation detected. Use the retained rollback record; no automatic overwrite.');
 const additions=[];for(const item of payload){if(!/^(src\/application\/cover-letter-quality-v2\.js|tests\/cover-letter-quality-v2\.test\.js|docs\/cover-letter-quality-v2-runtime\.md|tools\/maintenance\/cover-letter-quality-v2\/(?:install|patches|manifest)\.mjs)$/.test(item.path))throw Error('Unexpected payload target.');const f=path.join(root,item.path);await noLinks(root,f);const packed=path.join(bundle,'payload',item.path),bytes=await fs.readFile(await exists(packed)?packed:f);if(sha(bytes)!==item.sha256)throw Error('Payload integrity mismatch.');const present=await exists(f);if(present&&sha(await fs.readFile(f))!==item.sha256)throw Error('An existing feature file differs: '+item.path);additions.push({...item,bytes,created:!present});}
 const manifestBytes=await fs.readFile(path.join(bundle,'manifest.mjs')),manifestTarget=path.join(root,manifestPath);await noLinks(root,manifestTarget);const manifestPresent=await exists(manifestTarget);if(manifestPresent&&sha(await fs.readFile(manifestTarget))!==sha(manifestBytes))throw Error('Maintained manifest differs.');additions.push({path:manifestPath,bytes:manifestBytes,sha256:sha(manifestBytes),created:!manifestPresent});
 if(edits.every(e=>e.installed)){if(additions.some(a=>a.created))throw Error('Installed feature has missing files.');console.log('ALREADY INSTALLED. No changes made.');return;}
 console.log('CHECK PASSED: both source baselines and feature payload verified. No .env/data/provider changes.');if(mode!=='--apply')return;
 if(await exists(record)||await exists(path.join(backups,'original-0')))throw Error('Previous installation backup exists. Review or roll back first.');
 await fs.mkdir(backups,{recursive:true});
 const report={edits:[],added:additions.map(({bytes,...x})=>x)};
 for(const [i,e]of edits.entries()){const backup='original-'+i;await fs.writeFile(path.join(backups,backup),e.original,{flag:'wx'});report.edits.push({path:e.path,before:sha(e.original),after:sha(e.bytes),backup});}
 await fs.writeFile(record,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 try{for(const a of additions)if(a.created){const f=path.join(root,a.path);await fs.mkdir(path.dirname(f),{recursive:true});await fs.writeFile(f,a.bytes,{flag:'wx'});}for(const e of edits){const f=path.join(root,e.path);if(sha(await fs.readFile(f))!==sha(e.original))throw Error('Source changed during installation.');await replace(f,e.bytes);}}
 catch{throw Error('Installation interrupted. Stop development and use --rollback; original files and a rollback record were retained.');}
 console.log('INSTALLED, disabled by default. No private .env changes. Follow the runtime README for tests and explicit development opt-in.');
}
export async function main(args){let root=null,mode='--check',modes=0;for(let i=0;i<args.length;i++){if(args[i]==='--root'){root=args[++i];}else if(['--check','--apply','--rollback'].includes(args[i])){mode=args[i];modes++;}else throw Error('Unknown argument.');}if(!root||modes>1)throw Error('Provide --root PROJECT and one of --check/--apply/--rollback.');return install(root,mode);}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
