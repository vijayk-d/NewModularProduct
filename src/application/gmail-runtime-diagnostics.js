import { statSync } from 'node:fs';
const validEmail=value=>typeof value==='string'&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim());
const present=value=>typeof value==='string'&&Boolean(value.trim());
const flag=value=>!present(value)?'[not set; defaults off]':['true','false'].includes(value.trim().toLowerCase())?value.trim().toLowerCase():'[invalid value]';
const safePath=value=>!present(value)?'[not set]':value.length<=500&&!/[\r\n\u0000]/.test(value)?value:'[invalid/redacted]';
export function gmailLoadedEnvironment(env=process.env) {
  const rows=[];
  for(const key of ['ENABLE_GMAIL_MAILBOX_CHECK','ENABLE_GMAIL_DRAFT_CREATION','ENABLE_GMAIL','ENABLE_GMAIL_SENDING'])rows.push({name:key,value:flag(env[key])});
  rows.push({name:'GMAIL_FROM_ADDRESS',value:validEmail(env.GMAIL_FROM_ADDRESS)?env.GMAIL_FROM_ADDRESS.trim():'[missing or invalid address]'});
  for(const key of ['GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_REFRESH_TOKEN'])rows.push({name:key,value:present(env[key])?'[set; redacted]':'[missing]'});
  for(const key of ['CV_FOLDER','PYTHON','GMAIL_CREDENTIALS_PATH','GOOGLE_APPLICATION_CREDENTIALS'])rows.push({name:key,value:safePath(env[key])});
  return rows;
}
export function gmailDraftConfigurationDiagnostics({env=process.env,mailbox={},repository}={}) {
  let cvFolderExists=false;try{cvFolderExists=present(env.CV_FOLDER)&&statSync(env.CV_FOLDER).isDirectory();}catch{}
  const methods=['getById','findDraftOperation','claimDraftOperation','recordDraftOutcome'];
  const missingLedgerMethods=methods.filter(name=>typeof repository?.[name]!=='function');
  const checks=[
    {name:'draftCreationFlag',ok:String(env.ENABLE_GMAIL_DRAFT_CREATION||'').trim().toLowerCase()==='true',reason:'Set ENABLE_GMAIL_DRAFT_CREATION=true in the environment used to start this server.'},
    {name:'mailboxCheckFlag',ok:mailbox.mailboxCheckEnabled===true,reason:'Enable ENABLE_GMAIL_MAILBOX_CHECK=true for this server.'},
    {name:'oauthAndSender',ok:mailbox.configurationReady===true,reason:'Missing/invalid Gmail settings: '+(mailbox.missingSettings||['Gmail OAuth settings or sender address']).join(', ')},
    {name:'cvFolder',ok:cvFolderExists,reason:'CV_FOLDER is missing, inaccessible, or not an existing directory.'},
    {name:'draftLedger',ok:missingLedgerMethods.length===0,reason:'Missing draft repository methods: '+missingLedgerMethods.join(', ')}
  ];
  return {checks,blockedReasons:checks.filter(check=>!check.ok).map(check=>check.reason),
    configurationReady:checks.filter(check=>check.name!=='draftCreationFlag').every(check=>check.ok),
    cvFolderExists,missingLedgerMethods,environment:gmailLoadedEnvironment(env)};
}

