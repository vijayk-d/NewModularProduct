// Install or replace the private Word cover-letter template used by Export pack.
// Usage (from the app folder):  node tools/maintenance/set-cover-letter-template.mjs "<path to template.docx>" [--state "<state folder>"]
// The state folder defaults to NMP_STATE_DIRECTORY, else ./output. Contents are never printed.
import {readFile,writeFile,mkdir,rename,rm,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {templateWordWorker,TEMPLATE_FOLDER} from '../../src/infrastructure/documents/template-cover-letter.js';

const HELP={
 LETTER_TEMPLATE_STRUCTURE:'The template body needs at least three paragraphs and its page settings. The first two body paragraphs are kept (for example a date or reference line); everything after them must be empty. Put the letterhead in the Word header. Remove any numbered or bulleted list from the template.',
 LETTER_TEMPLATE_NOT_EMPTY:'Only the first two body paragraphs may contain text. Delete any sample letter text below them and keep the rest as empty paragraphs.',
 LETTER_TEMPLATE_TOO_LARGE:'The template is too large. Keep it under 5 MiB.',
 LETTER_TEMPLATE_CHANGED:'The template changed while it was being checked. Close it in Word and run this again.'
};

export async function setCoverLetterTemplate({source,stateDirectory,worker=templateWordWorker}){
 if(!source||path.extname(source).toLowerCase()!=='.docx')throw Error('Give the path to a .docx template.');
 const bytes=await readFile(source);
 if(bytes.length>5*1024*1024||!bytes.subarray(0,2).equals(Buffer.from('PK')))throw Error('The file is not a Word .docx document under 5 MiB.');
 const folder=path.join(path.resolve(stateDirectory),TEMPLATE_FOLDER);
 await mkdir(folder,{recursive:true});
 for(const p of [folder,path.join(folder,'template.docx'),path.join(folder,'settings.json')]){try{if((await lstat(p)).isSymbolicLink())throw Error('Linked template folders are refused.');}catch(e){if(e.code!=='ENOENT')throw e;}}
 const digest=createHash('sha256').update(bytes).digest('hex'),candidate=path.join(folder,'template.candidate.docx');
 await writeFile(candidate,bytes);
 try{
  await worker({template:candidate,templateSha256:digest,html:'<p>Template check</p><ul><li>Bullet <mark>highlight</mark></li></ul><p>Kind regards</p>'});
 }catch(e){
  await rm(candidate,{force:true});
  throw Error((HELP[e.code]||'The template could not be used ('+(e.code||'unknown')+').')+' Existing template unchanged.');
 }
 await rename(candidate,path.join(folder,'template.docx'));
 await writeFile(path.join(folder,'settings.json'),JSON.stringify({enabled:true,templateSha256:digest},null,2)+'\n');
 return {folder,templateSha256:digest};
}

export function parseArguments(args,env=process.env){
 const i=args.indexOf('--state');
 if(i>=0&&!args[i+1])throw Error('Give a folder after --state.');
 const rest=i>=0?args.filter((a,n)=>n!==i&&n!==i+1):[...args];
 if(rest.length!==1)throw Error('Give exactly one .docx template path (put it in quotes if it has spaces).');
 return {source:rest[0],stateDirectory:i>=0?args[i+1]:(env.NMP_STATE_DIRECTORY||path.resolve('output'))};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const {source,stateDirectory}=parseArguments(process.argv.slice(2));const r=await setCoverLetterTemplate({source,stateDirectory});console.log('TEMPLATE SET: '+r.folder);console.log('SHA-256: '+r.templateSha256);console.log('Export pack will now use this template. Re-run this command after editing the template.');}
 catch(e){console.error('TEMPLATE NOT SET: '+e.message);process.exitCode=1;}
}
