import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const email=value=>typeof value==='string'&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim())?value.trim():'';
const oauthKeys=['GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_REFRESH_TOKEN'];
function failure(message,code,statusCode=503){const error=new Error(message);error.code=code;error.statusCode=statusCode;return error;}
export async function runGmailMailboxWorker({expectedAddress,spawnImpl=spawn,pythonExecutable=process.env.PYTHON||(process.platform==='win32'?'python':'python3'),timeoutMs=30000}={}) {
  if(!email(expectedAddress))throw failure('Configure an explicit Gmail sender address.','GMAIL_CHECK_CONFIGURATION',400);
  const worker=fileURLToPath(new URL('../../python-worker/gmail_mailbox_check.py',import.meta.url));
  return new Promise((resolve,reject)=>{
    let child,done=false,stdout='',timer;
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(result);};
    try{child=spawnImpl(pythonExecutable,[worker],{stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});}catch{finish(failure('Mailbox worker could not start. No draft created.','GMAIL_CHECK_WORKER'));return;}
    timer=setTimeout(()=>{child.kill();finish(failure('Mailbox check timed out. No draft created.','GMAIL_CHECK_TIMEOUT'));},timeoutMs);
    child.on('error',()=>finish(failure('Mailbox worker could not start. No draft created.','GMAIL_CHECK_WORKER')));
    child.stdin.on('error',()=>finish(failure('Mailbox worker input failed. No draft created.','GMAIL_CHECK_WORKER')));
    child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(Buffer.byteLength(stdout)>16384){child.kill();finish(failure('Mailbox worker result was too large.','GMAIL_CHECK_PROTOCOL'));}});
    child.stderr.on('data',()=>{});
    child.on('close',code=>{
      if(done)return;if(code!==0){finish(failure('Mailbox worker failed. No draft created.','GMAIL_CHECK_WORKER'));return;}
      let result;try{result=JSON.parse(stdout);}catch{finish(failure('Mailbox worker returned invalid JSON.','GMAIL_CHECK_PROTOCOL'));return;}
      if(result?.draftCreated!==false||result?.sent!==false||typeof result.ok!=='boolean'){
        finish(failure('Mailbox worker returned an invalid safety result.','GMAIL_CHECK_PROTOCOL'));return;
      }
      finish(null,result);
    });
    child.stdin.end(JSON.stringify({action:'check_mailbox',expectedAddress}));
  });
}
export function createGmailMailboxPort({env=process.env,runner=runGmailMailboxWorker}={}) {
  function getStatus(){
    const flag=String(env.ENABLE_GMAIL_MAILBOX_CHECK||'').trim().toLowerCase();
    const configuredFromAddress=email(String(env.GMAIL_FROM_ADDRESS||''));
    const missingSettings=oauthKeys.filter(key=>!String(env[key]||'').trim());
    if(!configuredFromAddress)missingSettings.push('GMAIL_FROM_ADDRESS');
    return {mailboxCheckEnabled:flag==='true',flagValid:!flag||['true','false'].includes(flag),configuredFromAddress,
      configurationReady:missingSettings.length===0,missingSettings,draftCreationEnabled:false,sendingEnabled:false};
  }
  return {getStatus,async check({confirmed,expectedAddress}={}){
    const status=getStatus();
    if(!status.mailboxCheckEnabled)throw failure('Mailbox checking is disabled. Set ENABLE_GMAIL_MAILBOX_CHECK=true and restart.','GMAIL_CHECK_DISABLED',403);
    if(!status.configurationReady)throw failure('Gmail OAuth settings or the sender address are missing. No authentication attempted.','GMAIL_CHECK_CONFIGURATION',400);
    if(confirmed!==true)throw failure('Confirm the read-only mailbox check first.','GMAIL_CHECK_CONFIRMATION',400);
    if(email(expectedAddress).toLowerCase()!==status.configuredFromAddress.toLowerCase())throw failure('Sender configuration changed. Refresh Gmail status before checking.','GMAIL_CHECK_CONFIGURATION',409);
    let result;try{result=await runner({expectedAddress:status.configuredFromAddress});}
    catch(error){throw failure(error?.code==='GMAIL_CHECK_TIMEOUT'?'Mailbox check timed out. No draft created.':'Mailbox check failed. No draft created or sent.',error?.code==='GMAIL_CHECK_TIMEOUT'?'GMAIL_CHECK_TIMEOUT':'GMAIL_CHECK_WORKER');}
    if(result?.draftCreated!==false||result?.sent!==false)throw failure('Mailbox response did not confirm read-only safety.','GMAIL_CHECK_PROTOCOL');
    const mailbox=email(result.mailbox);
    const messages={GMAIL_DEPENDENCIES_MISSING:'Gmail Python dependencies are unavailable.',GMAIL_OAUTH_REVOKED:'Reconnect Gmail: the OAuth grant expired or was revoked.',GMAIL_PROFILE_FAILED:'Gmail authentication/profile check failed.',GMAIL_CHECK_DISABLED:'Mailbox checking is disabled.',GMAIL_CHECK_CONFIGURATION:'Gmail configuration changed or is incomplete.'};
    if(result.ok!==true){
      if(result.code==='GMAIL_MAILBOX_MISMATCH'&&result.authenticated===true&&mailbox)return {ok:false,authenticated:true,mailbox,
        configuredFromAddress:status.configuredFromAddress,mailboxMatch:false,draftCreated:false,sent:false,
        error:'Authenticated mailbox differs from the configured sender. Alias support is not enabled.'};
      throw failure(messages[result.code]||'Mailbox check failed. No draft created or sent.',Object.hasOwn(messages,result.code)?result.code:'GMAIL_PROFILE_FAILED');
    }
    if(result.authenticated!==true||!mailbox||mailbox.toLowerCase()!==status.configuredFromAddress.toLowerCase())throw failure('Mailbox response did not confirm the configured account.','GMAIL_MAILBOX_MISMATCH',409);
    return {ok:true,authenticated:true,mailbox,configuredFromAddress:status.configuredFromAddress,mailboxMatch:true,draftCreated:false,sent:false};
  }};
}
