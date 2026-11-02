import {normalizeLegacyAdvertSnapshot} from '../../src/domain/shared/legacy-advert-normalization.js';
import {extractOutreachExperienceBody} from '../../src/application/compose-outreach-letter.js';
import {pathToFileURL} from 'node:url';
export const affectedIds=['1067ca85-b0c6-4881-a372-74dc822dd454','605d9f05-83e6-403e-854a-16d80fffcffc'];
export async function repairAdvertRows({items,ids=affectedIds,apply=false,api}){
 const outcomes=[];
 for(const id of ids){const item=items.find(i=>i.id===id);
  if(!item){outcomes.push({id,outcome:'skipped',reason:'Row not found.'});continue;}
  if(item.status!=='new'||item.canEditMessage!==true){outcomes.push({id,outcome:'skipped',reason:'Row is no longer new/editable; nothing overwritten or reset.'});continue;}
  try{const fixed=normalizeLegacyAdvertSnapshot(item,item.application?.jobAdvertLink||'');
   if(!fixed.changed){outcomes.push({id,outcome:'unchanged',reason:'No recognized matching legacy advert line.'});continue;}
   extractOutreachExperienceBody(fixed.bodyPlainText,['micro1']);
   if(!apply){outcomes.push({id,outcome:'ready-to-repair',matchingAdvertLines:fixed.changed});continue;}
   const result=await api('/api/outreach-queue/message-save',{queueId:id,expectedVersion:item.editVersion,bodyPlainText:fixed.bodyPlainText,bodyHtml:fixed.bodyHtml});
   if(result.saved!==true)throw new Error('No confirmed local save receipt.');
   outcomes.push({id,outcome:'repaired',matchingAdvertLines:fixed.changed,subjectRecipientCv:'unchanged',gmailOperation:'none'});
  }catch(e){outcomes.push({id,outcome:'skipped',reason:e.message});}
 }
 return outcomes;
}
async function main(){const args=process.argv.slice(2),apply=args.includes('--apply'),i=args.indexOf('--base');const base=new URL(i<0?'http://127.0.0.1:3000':args[i+1]);
 if(!['http:','https:'].includes(base.protocol)||!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password)throw new Error('Only a loopback application URL is allowed.');
 const api=async(path,payload)=>{const response=await fetch(new URL(path,base),payload===undefined?{cache:'no-store'}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||`Local API failed (${response.status})`);return data;};
 const queue=await api('/api/outreach-queue'),outcomes=await repairAdvertRows({items:queue.items,apply,api});for(const item of outcomes)console.log(JSON.stringify(item));
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',repaired:outcomes.filter(o=>o.outcome==='repaired').length,paidModelCalls:0,gmailCalls:0}));
 if(!apply)console.log('Dry run only. Use --apply to save these exact two rows through the version-checked local API.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error('ERROR: '+e.message);process.exitCode=1;});
