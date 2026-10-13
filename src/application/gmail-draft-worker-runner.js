import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export async function runGmailDraftWorker({ payload, pythonExecutable = process.env.PYTHON || (process.platform==='win32'?'python':'python3'),
  spawnImpl = spawn, timeoutMs = 240000 } = {}) {
  if(payload?.action!=='draft' || !Array.isArray(payload.drafts) || !payload.drafts.length || payload.drafts.length>100) throw new Error('Only explicit draft payloads are supported. Sending is disabled.');
  const ids=payload.drafts.map(item=>item.queueId);
  if(ids.some(id=>typeof id!=='string' || !id) || new Set(ids).size!==ids.length) throw new Error('Draft payloads require distinct string queue IDs.');
  const worker=fileURLToPath(new URL('../../python-worker/gmail_draft_worker.py',import.meta.url));
  const input=JSON.stringify(payload);if(Buffer.byteLength(input)>16*1024*1024)throw new Error('Draft payload is too large.');
  return new Promise((resolve,reject)=>{
    let child, done=false, stdout='', timer;
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(result);};
    try {child=spawnImpl(pythonExecutable,[worker],{stdio:['pipe','pipe','pipe']});}
    catch {finish(new Error('Draft worker could not start. No success was recorded.'));return;}
    timer=setTimeout(()=>{child.kill();finish(new Error('Draft worker timed out. Draft creation may be uncertain; check Gmail before retrying. No success was recorded.'));},timeoutMs);
    child.on('error',()=>finish(new Error('Draft worker could not start. No success was recorded.')));
    child.stdin.on('error',()=>finish(new Error('Draft worker input failed. Check Gmail before retrying. No success was recorded.')));
    child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(Buffer.byteLength(stdout)>1024*1024){child.kill();finish(new Error('Draft worker returned an oversized result. Check Gmail before retrying.'));}});
    child.stderr.on('data',()=>{});
    child.on('close',code=>{
      if(done)return;
      if(code!==0){finish(new Error('Draft worker failed. Draft creation may be uncertain; check Gmail before retrying. No success was recorded.'));return;}
      let result;try {result=JSON.parse(stdout);}catch{finish(new Error('Draft worker returned invalid JSON. Check Gmail before retrying. No success was recorded.'));return;}
      const details=result?.details;
      if(result?.sent!==0 || !Array.isArray(details) || details.length!==ids.length ||
        new Set(details.map(item=>item.queueId)).size!==ids.length || details.some(item=>!ids.includes(item.queueId) || !['drafted','failed','unknown'].includes(item.status) ||
          (item.status==='drafted' && (typeof item.draftId!=='string' || !item.draftId || /^local-/i.test(item.draftId))))) {
        finish(new Error('Draft worker returned an unconfirmed result. Check Gmail before retrying. No success was recorded.'));return;
      }
      finish(null,{...result,processed:details.length,drafted:details.filter(item=>item.status==='drafted').length,
        failed:details.filter(item=>item.status==='failed').length,unknown:details.filter(item=>item.status==='unknown').length});
    });
    child.stdin.end(input);
  });
}
