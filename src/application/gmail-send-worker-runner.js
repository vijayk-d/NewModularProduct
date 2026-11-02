import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
export function runGmailSendWorker({payload,spawnImpl=spawn,pythonExecutable=process.env.PYTHON||(process.platform==='win32'?'python':'python3'),timeoutMs=240000}={}){
 if(!['prepare','commit'].includes(payload?.action))throw new Error('Explicit send action required.');
 const input=JSON.stringify(payload);if(Buffer.byteLength(input)>64*1024*1024)throw new Error('Send payload too large.');
 return new Promise((resolve,reject)=>{
  let child,timer,done=false,out='';const finish=(e,v)=>{if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve(v);};
  try{child=spawnImpl(pythonExecutable,['-B',fileURLToPath(new URL('../../python-worker/gmail_send_worker.py',import.meta.url))],{stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8:strict'}});}catch{finish(new Error('Send worker could not start.'));return;}
  timer=setTimeout(()=>{child.kill();finish(new Error('Send worker timed out; a committed send may be uncertain.'));},timeoutMs);
  child.on('error',()=>finish(new Error('Send worker start failed.')));child.stdin.on('error',()=>finish(new Error('Send worker input failed.')));
  child.stdout.setEncoding('utf8');child.stdout.on('data',s=>{out+=s;if(Buffer.byteLength(out)>64*1024*1024){child.kill();finish(new Error('Send result too large.'));}});child.stderr.on('data',()=>{});
  child.on('close',code=>{if(done)return;if(code!==0){finish(new Error('Send worker failed. Check any committed outcome before retrying.'));return;}try{const r=JSON.parse(out);if(typeof r.ok!=='boolean'||typeof r.sent!=='boolean'||typeof r.sendingAttempted!=='boolean')throw new Error();finish(null,r);}catch{finish(new Error('Invalid send receipt.'));}});
  child.stdin.end(input,'utf8');
 });
}
