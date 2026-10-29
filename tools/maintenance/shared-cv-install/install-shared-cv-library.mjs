import * as fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {TARGETS} from './patches.mjs';
import {MANIFEST} from './manifest.mjs';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const blob=s=>{const b=Buffer.from(s);return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
export function plan(raw,target){const text=raw.toString('utf8').replace(/\r\n/g,'\n');if(blob(text)===target.blob){let next=text;for(const p of target.edits){if(next.split(p.before).length!==2)throw Error('Missing/non-unique source anchor: '+target.path);next=next.replace(p.before,p.after);}return {installed:false,bytes:Buffer.from(raw.includes(Buffer.from('\r\n'))?next.replaceAll('\n','\r\n'):next)};}let prior=text;for(const p of [...target.edits].reverse()){if(prior.split(p.after).length!==2)throw Error('Source baseline differs: '+target.path);prior=prior.replace(p.after,p.before);}if(blob(prior)!==target.blob)throw Error('Installed source has unrelated changes: '+target.path);return {installed:true,bytes:raw};}
const exists=async p=>fs.access(p).then(()=>true).catch(()=>false);
async function safe(root,p){if(p!==root&&!p.startsWith(root+path.sep))throw Error('Managed path escaped root.');while(p!==root){try{if((await fs.lstat(p)).isSymbolicLink())throw Error('Managed links refused.');}catch(e){if(e.code!=='ENOENT')throw e;}p=path.dirname(p);}}
async function atomic(p,b){const temp=p+'.shared-cv-install.tmp';await fs.writeFile(temp,b,{flag:'wx'});try{await fs.rename(temp,p);}finally{await fs.unlink(temp).catch(()=>{});}}
export async function install(root,mode,{targets=TARGETS,bundle=path.dirname(fileURLToPath(import.meta.url))}={}){
 root=await fs.realpath(root);if(await exists(path.join(root,'release.json')))throw Error('Production release refused. Install source in the development checkout, never an active release.');const dir=path.join(root,'.patch-backups/shared-cv-library-v1'),record=path.join(dir,'installation.json');await safe(root,record);
 const meta=[['tools/maintenance/shared-cv-install/install-shared-cv-library.mjs','install-shared-cv-library.mjs'],['tools/maintenance/shared-cv-install/patches.mjs','patches.mjs'],['tools/maintenance/shared-cv-install/manifest.mjs','manifest.mjs']];
 const expectedAdded=[...MANIFEST.map(x=>x.path),...meta.map(x=>x[0])].sort();
 if(mode==='--rollback'){
  const r=JSON.parse(await fs.readFile(record,'utf8'));if(JSON.stringify(r.changed.map(e=>e.path).sort())!==JSON.stringify(targets.map(t=>t.path).sort())||JSON.stringify(r.added.map(e=>e.path).sort())!==JSON.stringify(expectedAdded))throw Error('Rollback scope mismatch.');
  for(const e of r.changed){const p=path.join(root,e.path),b=path.join(dir,e.backup);await safe(root,p);await safe(root,b);if(![e.before,e.after].includes(sha(await fs.readFile(p)))||sha(await fs.readFile(b))!==e.before)throw Error('Changed source or backup differs; rollback refused.');}
  for(const a of r.added){const p=path.join(root,a.path);await safe(root,p);if(await exists(p)&&sha(await fs.readFile(p))!==a.hash)throw Error('Added feature source changed; rollback refused.');}
  for(const e of r.changed)if(sha(await fs.readFile(path.join(root,e.path)))!==e.before)await atomic(path.join(root,e.path),await fs.readFile(path.join(dir,e.backup)));
  for(const a of r.added)if(a.created)await fs.unlink(path.join(root,a.path)).catch(e=>{if(e.code!=='ENOENT')throw e;});await fs.rename(record,path.join(dir,'rolled-back-'+Date.now()+'.json'));console.log('SOURCE ROLLBACK COMPLETE. Private environments/live catalogue/data were NOT restored or deleted. Review the documented configuration rollback order.');return;
 }
 const changes=[];for(const target of targets){const p=path.join(root,target.path);await safe(root,p);const before=await fs.readFile(p),next=plan(before,target);changes.push({...target,before,...next});}
 if(changes.some(c=>c.installed)&&!changes.every(c=>c.installed))throw Error('Partial source installation; inspect or roll back first.');
 const additions=[];
 for(const m of MANIFEST){if(!/^(src\/config\/shared-cv-library-runtime\.js|tests\/shared-cv-library(?:-setup)?\.test\.js|tools\/maintenance\/(?:shared-cv-library-setup|check-shared-cv-library)\.mjs|docs\/shared-cv-library\.md)$/.test(m.path))throw Error('Unexpected new source path.');const target=path.join(root,m.path),packed=path.join(bundle,'payload',m.path),bytes=await fs.readFile(await exists(packed)?packed:target);if(sha(bytes)!==m.sha256)throw Error('Payload hash mismatch.');await safe(root,target);const present=await exists(target);if(present&&sha(await fs.readFile(target))!==m.sha256)throw Error('Existing new feature file differs: '+m.path);additions.push({path:m.path,bytes,hash:m.sha256,created:!present});}
 for(const [rel,name]of meta){const p=path.join(root,rel);await safe(root,p);const bytes=await fs.readFile(path.join(bundle,name)),present=await exists(p);if(present&&sha(await fs.readFile(p))!==sha(bytes))throw Error('Maintained installer metadata differs.');additions.push({path:rel,bytes,hash:sha(bytes),created:!present});}
 if(changes.every(c=>c.installed)){if(additions.some(a=>a.created))throw Error('Installed feature has missing files.');console.log('ALREADY INSTALLED. Source only; shared setup/deployment are separate.');return;}
 if(await exists(record)||await exists(path.join(dir,'before-0')))throw Error('Prior installation backup exists.');
 console.log('CHECK PASSED: seven committed source baselines and new payload hashes verified. No private/live data or configuration changes.');if(mode!=='--apply')return;
 await fs.mkdir(dir,{recursive:true});const report={changed:[],added:additions.map(({bytes,...a})=>a)};
 for(const [i,c]of changes.entries()){const backup='before-'+i;await fs.writeFile(path.join(dir,backup),c.before,{flag:'wx'});report.changed.push({path:c.path,before:sha(c.before),after:sha(c.bytes),backup});}
 await fs.writeFile(record,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 try{for(const a of additions)if(a.created){const p=path.join(root,a.path);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,a.bytes,{flag:'wx'});}for(const c of changes){const p=path.join(root,c.path);if(sha(await fs.readFile(p))!==sha(c.before))throw Error('Source changed during installation.');await atomic(p,c.bytes);}}catch{throw Error('Source install interrupted. Backups/record retained for --rollback. Do not proceed to shared setup.');}
 console.log('SOURCE INSTALLED. Run local tests, then the read-only shared setup plan. No .env, shared catalogue, Git or production release was changed.');
}
export async function main(args){let root=null,mode='--check',count=0;for(let i=0;i<args.length;i++){if(args[i]==='--root')root=args[++i];else if(['--check','--apply','--rollback'].includes(args[i])){mode=args[i];count++;}else throw Error('Unknown argument.');}if(!root||count>1)throw Error('Provide --root and one mode.');await install(root,mode);}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main(process.argv.slice(2)).catch(e=>{console.error('STOPPED: '+e.message);process.exitCode=1;});
