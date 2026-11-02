import * as fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const INSERT="            ...(qualityV2Enabled() && selectedModel === 'openai/gpt-6-luna' ? {reasoning:{effort:'low'}} : {}),\n";
const ANCHOR='            max_output_tokens: POLISHING_OUTPUT_TOKEN_BUDGET,\n';
const REL='src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
const ORIGINAL='47b18638db973035d137331064738f477c1905ec';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const blob=s=>{const b=Buffer.from(s);return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
export function plan(raw,recipe,expected=ORIGINAL){
 const text=raw.toString('utf8').replace(/\r\n/g,'\n'),installed=text.includes(INSERT);
 if(installed&&text.split(INSERT).length!==2)throw Error('Reasoning patch is duplicated; stop.');
 const prior=installed?text.replace(INSERT,''):text;
 if(!prior.includes('// COVER_LETTER_QUALITY_V2_INTEGRATION')||prior.split(ANCHOR).length!==2)throw Error('Expected quality-v2 runtime integration not found.');
 let restored=prior;for(const p of [...recipe].reverse()){if(restored.split(p.after).length!==2)throw Error('Quality-v2 source differs from its recorded installation.');restored=restored.replace(p.after,p.before);}
 if(blob(restored)!==expected)throw Error('Adapter has other changes; no automatic overwrite.');
 const next=installed?text:prior.replace(ANCHOR,ANCHOR+INSERT);
 return {installed,bytes:Buffer.from(raw.includes(Buffer.from('\r\n'))?next.replaceAll('\n','\r\n'):next)};
}
async function exists(p){try{await fs.access(p);return true;}catch{return false;}}
async function safe(root,p){let current=p;if(current!==root&&!current.startsWith(root+path.sep))throw Error('Managed path escaped project.');while(current!==root){try{if((await fs.lstat(current)).isSymbolicLink())throw Error('Symbolic-link managed paths refused.');}catch(e){if(e.code!=='ENOENT')throw e;}current=path.dirname(current);}}
async function atomic(p,b){const temp=p+'.reasoning-low.tmp';await fs.writeFile(temp,b,{flag:'wx'});try{await fs.rename(temp,p);}finally{await fs.unlink(temp).catch(()=>{});}}
export async function run(args,{expected=ORIGINAL}={}){
 let root=null,mode='--check',count=0;for(let i=0;i<args.length;i++){if(args[i]==='--root')root=args[++i];else if(['--check','--apply','--rollback'].includes(args[i])){mode=args[i];count++;}else throw Error('Unknown argument.');}if(!root||count>1)throw Error('Provide --root and one installer mode.');root=await fs.realpath(root);
 if(await exists(path.join(root,'release.json')))throw Error('Production release refused.');
 const target=path.join(root,REL),folder=path.join(root,'.patch-backups','cover-letter-v2-reasoning-low'),record=path.join(folder,'installation.json'),backup=path.join(folder,'adapter.before'),maintained=path.join(root,'tools/maintenance/set-polishing-reasoning-low.mjs');
 for(const p of [target,record,backup,maintained])await safe(root,p);
 const raw=await fs.readFile(target);
 if(mode==='--rollback'){
  const r=JSON.parse(await fs.readFile(record,'utf8')),b=await fs.readFile(backup);
  if(sha(raw)!==r.after||sha(b)!==r.before)throw Error('Adapter/backup changed; rollback refused.');
  if(r.helperCreated&&await exists(maintained)&&sha(await fs.readFile(maintained))!==r.helperHash)throw Error('Maintained helper changed; rollback refused.');
  await atomic(target,b);if(r.helperCreated)await fs.unlink(maintained).catch(e=>{if(e.code!=='ENOENT')throw e;});await fs.rename(record,path.join(folder,'rolled-back-'+Date.now()+'.json'));
  console.log('ROLLED BACK this reasoning change only. Quality-v2, .env and data preserved.');return;
 }
 const recipeFile=path.join(root,'tools/maintenance/cover-letter-quality-v2/patches.mjs');await safe(root,recipeFile);const {TARGETS}=await import(pathToFileURL(recipeFile).href);
 const recipe=TARGETS.find(t=>t.path===REL);if(!recipe||recipe.gitBlob!==expected||!Array.isArray(recipe.patches))throw Error('Expected maintained quality-v2 patch recipe missing.');
 const p=plan(raw,recipe.patches,expected),helper=await fs.readFile(fileURLToPath(import.meta.url)),helperPresent=await exists(maintained);
 if(helperPresent&&sha(await fs.readFile(maintained))!==sha(helper))throw Error('A different maintained helper already exists.');
 if(p.installed){console.log('ALREADY INSTALLED. No files changed.');return;}
 if(await exists(record)||await exists(backup))throw Error('Previous backup exists. Review before retrying.');
 console.log('CHECK PASSED. Requests reasoning.effort=low only for quality-v2 development + openai/gpt-6-luna. Output cap unchanged. No calls or .env writes.');if(mode!=='--apply')return;
 await fs.mkdir(folder,{recursive:true});await fs.writeFile(backup,raw,{flag:'wx'});await fs.writeFile(record,JSON.stringify({before:sha(raw),after:sha(p.bytes),helperCreated:!helperPresent,helperHash:sha(helper)},null,2)+'\n',{flag:'wx'});
 if(sha(await fs.readFile(target))!==sha(raw))throw Error('Source changed during installation; adapter untouched.');
 if(!helperPresent){await fs.mkdir(path.dirname(maintained),{recursive:true});await fs.writeFile(maintained,helper,{flag:'wx'});}await atomic(target,p.bytes);
 console.log('APPLIED. Restart development. Refresh cost estimate before any single explicitly approved live test.');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)run(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
