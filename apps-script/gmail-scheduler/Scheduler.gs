// Application scheduling candidate v1. Existing Code.gs remains the self-test pilot.
// Installable trigger activation is a separate, explicit Google-side operation.
var NMP_HANDLER='nmpSchedulerTick';
var NMP_REQUEST_HEADER=['requestId','jobId','action','part','total','data','mac'];
var NMP_JOB_HEADER=['jobId','receipt','mac'];
function nmpHex_(bytes){return bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function nmpMac_(text,key){return nmpHex_(Utilities.computeHmacSha256Signature(text,key,Utilities.Charset.UTF_8));}
function nmpHashRaw_(raw){return nmpHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,Utilities.base64DecodeWebSafe(raw)));}
function nmpConfig_(){
 var props=PropertiesService.getScriptProperties(),key=props.getProperty('NMP_SCHEDULER_KEY');
 if(!/^[a-f0-9]{64}$/.test(String(key)))throw Error('Private scheduler key missing.');
 var sheet=SpreadsheetApp.getActiveSpreadsheet();if(!sheet)throw Error('Use the existing bound scheduler project.');
 var owner=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
 var rows=sheet.getSheetByName('Settings').getRange('A1:B4').getValues(),settings={};rows.forEach(function(r){settings[String(r[0])]=String(r[1]);});
 if(!owner||settings.schema!=='cloud-mail-queue-v1'||settings.owner!==owner||settings.environment!=='production'||!/^[a-f0-9-]{36}$/.test(settings.namespace))throw Error('Account or scheduler identity mismatch.');
 var result=Drive.Permissions.list(sheet.getId(),{fields:'permissions(type,role,emailAddress),nextPageToken',pageSize:100});
 if(result.nextPageToken||!result.permissions||!result.permissions.length||result.permissions.some(function(p){return p.type!=='user'||p.role!=='owner'||String(p.emailAddress||'').toLowerCase()!==owner;}))throw Error('Scheduler Sheet privacy could not be verified. No send allowed.');
 return {sheet:sheet,owner:owner,namespace:settings.namespace,sheetId:sheet.getId(),key:key,props:props};
}
function nmpRecordKey_(id){return 'NMP_JOB_V1_'+id;}
function nmpReadJob_(c,id){var raw=c.props.getProperty(nmpRecordKey_(id));return raw?JSON.parse(raw):null;}
function nmpReceipt_(j){return {version:1,jobId:j.jobId,namespace:j.namespace,sheetId:j.sheetId,account:j.account,status:j.status,messageId:j.messageId||null,threadId:j.threadId||'',note:j.note||'',updatedAt:j.updatedAt};}
function nmpPersist_(c,j){
 j.updatedAt=Date.now();c.props.setProperty(nmpRecordKey_(j.jobId),JSON.stringify(j));
 var tab=c.sheet.getSheetByName('Jobs'),last=tab.getLastRow(),row=0;
 if(last>2001)throw Error('Job receipt capacity reached. Review archival; do not erase tombstones.');
 if(last>1){var ids=tab.getRange(2,1,last-1,1).getValues();for(var i=0;i<ids.length;i++)if(String(ids[i][0])===j.jobId){if(row)throw Error('Duplicate job receipt rows.');row=i+2;}}
 var text=JSON.stringify(nmpReceipt_(j));tab.getRange(row||last+1,1,1,3).setValues([[j.jobId,text,nmpMac_(text,c.key)]]);SpreadsheetApp.flush();
}
function nmpHeaders_(c){
 if(JSON.stringify(c.sheet.getSheetByName('Requests').getRange(1,1,1,7).getValues()[0])!==JSON.stringify(NMP_REQUEST_HEADER)||JSON.stringify(c.sheet.getSheetByName('Jobs').getRange(1,1,1,3).getValues()[0])!==JSON.stringify(NMP_JOB_HEADER))throw Error('Scheduler tables not initialised.');
}
// One signed request group, checked exactly as the tick does. Returns {command} or {reason} (the reason is for the
// read-only tidy check; the tick simply ignores a rejected group).
function nmpParseGroup_(c,id,parts){
 var first=parts[0],total=Number(first[4]);if(total<1||total>150||parts.length!==total)return {reason:'some parts are missing'};
 parts.sort(function(a,b){return Number(a[3])-Number(b[3]);});
 var valid=parts.every(function(r,i){return String(r[0])===id&&String(r[1])===String(first[1])&&String(r[2])===String(first[2])&&Number(r[3])===i&&Number(r[4])===total&&String(r[6])===String(first[6]);});if(!valid)return {reason:'parts do not match'};
 var text=parts.map(function(r){return String(r[5]);}).join('');if(text.length>4500000)return {reason:'too large'};
 if(nmpMac_(text,c.key)!==String(first[6]))return {reason:'signature does not match this script key'};
 var command;try{command=JSON.parse(text);}catch(ignore){return {reason:'unreadable'};}
 if(!command||typeof command!=='object'||command.version!==1||command.requestId!==id||command.jobId!==String(first[1])||command.action!==String(first[2]))return {reason:'envelope does not match'};
 if(command.namespace!==c.namespace||command.sheetId!==c.sheetId||command.account!==c.owner)return {reason:'account, Sheet or namespace does not match'};
 if(!/^[a-f0-9-]{36}$/.test(command.jobId)||['schedule','cancel','tidy'].indexOf(command.action)<0)return {reason:'unknown action'};
 if(command.action==='tidy'&&!nmpValidTidy_(command))return {reason:'invalid job list'};
 return {command:command};
}
function nmpCommands_(c,rejected){
 var tab=c.sheet.getSheetByName('Requests'),last=tab.getLastRow();if(last<2)return [];
 if(last>10001)throw Error('Request capacity exceeded. Inspect before modifying data.');
 var rows=tab.getRange(2,1,last-1,7).getValues(),groups={};
 rows.forEach(function(row){var id=String(row[0]);if(!/^[a-f0-9-]{36}$/.test(id))return;(groups[id]||(groups[id]=[])).push(row);});
 var commands=[];
 Object.keys(groups).forEach(function(id){var result=nmpParseGroup_(c,id,groups[id]);if(result.command)commands.push(result.command);else if(rejected){var key=String(groups[id][0][2])+': '+result.reason;rejected[key]=(rejected[key]||0)+1;}});
 return commands;
}
function nmpValidSchedule_(p,now){return p.version===1&&Number.isFinite(p.dueAt)&&Number.isFinite(p.expiresAt)&&p.expiresAt===p.dueAt+15*60000&&p.dueAt<=now+30*86400000&&typeof p.raw==='string'&&p.raw.length<=4*1024*1024&&/^[A-Za-z0-9_-]+={0,2}$/.test(p.raw)&&/^[a-f0-9]{64}$/.test(String(p.contentHash))&&nmpHashRaw_(p.raw)===p.contentHash;}
// Sheet tidy: after the app clears finished records it sends one signed 'tidy' command listing their job IDs. The
// stored request rows (the full email copies) of those jobs are deleted, but only for jobs whose recorded status is
// final: SENT, CANCELLED, MISSED or BLOCKED. UNKNOWN and pending jobs are never touched. Job receipts (Jobs tab) and
// script-property records stay, so a deleted request can never be replayed. The tidy command's own rows go too.
var NMP_TIDY_FINAL=['SENT','CANCELLED','MISSED','BLOCKED'];
function nmpValidTidy_(p){return Array.isArray(p.jobIds)&&p.jobIds.length>=1&&p.jobIds.length<=200&&p.jobIds.every(function(id){return typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);});}
function nmpTidy_(c,commands){
 var done={},targets={};
 commands.forEach(function(p){if(p.action!=='tidy')return;done[p.requestId]=true;p.jobIds.forEach(function(id){var j=nmpReadJob_(c,id);if(j&&NMP_TIDY_FINAL.indexOf(j.status)>=0)targets[id]=true;});});
 if(!Object.keys(done).length)return 0;
 var tab=c.sheet.getSheetByName('Requests'),last=tab.getLastRow();if(last<2)return 0;
 var rows=tab.getRange(2,1,last-1,2).getValues(),drop=[];
 rows.forEach(function(r,i){if(done[String(r[0])]||targets[String(r[1])])drop.push(i+2);});
 if(!drop.length){console.log('Sheet tidy: '+Object.keys(done).length+' tidy request(s), no stored rows of finished jobs to delete.');return 0;}
 // Google refuses to delete every row below a frozen header, so keep one blank row when the whole table goes.
 if(drop.length===last-1)tab.insertRowAfter(last);
 // Delete from the bottom up in contiguous runs: rows the app appends meanwhile land after these and are untouched.
 for(var k=drop.length-1;k>=0;){var end=drop[k],start=end;while(k>0&&drop[k-1]===start-1){k--;start--;}k--;tab.deleteRows(start,end-start+1);}
 SpreadsheetApp.flush();console.log('Sheet tidy: deleted '+drop.length+' row(s) for '+Object.keys(done).length+' tidy request(s).');return drop.length;
}
// Read-only: explains why stored rows are or are not being tidied. Run it from the Apps Script editor. It changes
// nothing, sends nothing, and reports counts and statuses only (no addresses, IDs or email content).
function nmpSchedulerTidyCheck(){
 var c=nmpConfig_();nmpHeaders_(c);
 var tab=c.sheet.getSheetByName('Requests'),last=tab.getLastRow(),rejected={},byAction={},statuses={},done={},targets={},listed={};
 var commands=nmpCommands_(c,rejected),tidies=commands.filter(function(p){return p.action==='tidy';});
 tidies.forEach(function(p){done[p.requestId]=true;p.jobIds.forEach(function(id){listed[id]=true;});});
 Object.keys(listed).forEach(function(id){var j=nmpReadJob_(c,id),status=j?j.status:'no record in this script';statuses[status]=(statuses[status]||0)+1;if(j&&NMP_TIDY_FINAL.indexOf(j.status)>=0)targets[id]=true;});
 var rows=last>=2?tab.getRange(2,1,last-1,3).getValues():[],deletable=0;
 rows.forEach(function(r){var action=String(r[2]||'(blank)');byAction[action]=(byAction[action]||0)+1;if(done[String(r[0])]||targets[String(r[1])])deletable++;});
 var report={requestRows:rows.length,rowsByAction:byAction,tidyRequestsAccepted:tidies.length,requestsRejected:rejected,jobsListedForTidy:Object.keys(listed).length,
  listedJobStatuses:statuses,rowsTheNextTickWouldDelete:deletable,schedulerTriggers:null,schedulerBusy:null};
 try{report.schedulerTriggers=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===NMP_HANDLER;}).length;}catch(ignore){}
 try{var lock=LockService.getScriptLock();report.schedulerBusy=!lock.tryLock(1000);if(!report.schedulerBusy)lock.releaseLock();}catch(ignore){}
 var rejectedTidy=Object.keys(rejected).filter(function(k){return k.indexOf('tidy:')===0;});
 report.verdict=!byAction.tidy?'No tidy request is in the Requests tab. Click "Tidy the Sheet again" in the app and read its message: if it says the request could not be sent, the app could not write to the Sheet.'
  :!tidies.length?'Tidy requests are in the Sheet but this script rejects them ('+rejectedTidy.join('; ')+'). Check the script key and the Settings tab match the app.'
  :deletable?'The next tick should delete '+deletable+' row(s). If they stay, open Executions and look for "Sheet tidy skipped" or a failed nmpSchedulerTick.'+(report.schedulerTriggers===0?' No scheduler trigger is installed, so ticks only run when you run nmpSchedulerTick by hand.':'')
  :'Tidy requests are accepted, but none of the listed jobs is finished in this script, so nothing is deleted. Only SENT, CANCELLED, MISSED and BLOCKED copies are removed.';
 console.log(JSON.stringify(report,null,1));
 try{SpreadsheetApp.getUi().alert('Scheduler tidy check (read-only)',JSON.stringify(report,null,1),SpreadsheetApp.getUi().ButtonSet.OK);}catch(ignore){}
 return report;
}
function nmpSchedulerTick(){
 var lock=LockService.getScriptLock();if(!lock.tryLock(1000)){console.log('Scheduler busy: another run holds the lock, so this tick did nothing.');return;}
 try{
  var c=nmpConfig_();nmpHeaders_(c);var commands=nmpCommands_(c),schedules={};
  commands.forEach(function(p){if(p.action!=='schedule')return;var existing=nmpReadJob_(c,p.jobId);if(existing){if(existing.requestId===p.requestId)schedules[p.jobId]=p;return;}var j={jobId:p.jobId,namespace:c.namespace,sheetId:c.sheetId,account:c.owner,requestId:p.requestId,contentHash:p.contentHash,status:'SCHEDULED'};if(!nmpValidSchedule_(p,Date.now())){j.status='BLOCKED';j.note='Approved content or schedule validation failed. No send attempted.';}nmpPersist_(c,j);schedules[p.jobId]=p;});
  commands.forEach(function(p){if(p.action!=='cancel')return;var j=nmpReadJob_(c,p.jobId);if(!j)j={jobId:p.jobId,namespace:c.namespace,sheetId:c.sheetId,account:c.owner,status:'CANCELLED'};if(j.status==='SCHEDULED'||j.status==='CANCELLED'){j.status='CANCELLED';j.note='Cloud confirmed cancellation before dispatch.';nmpPersist_(c,j);}});
  var all=c.props.getProperties(),keys=Object.keys(all).filter(function(k){return k.indexOf('NMP_JOB_V1_')===0;}),attempted=0,dispatchStarted=Date.now();
  keys.forEach(function(key){var j=JSON.parse(all[key]);if(j.namespace!==c.namespace||j.sheetId!==c.sheetId||j.account!==c.owner)throw Error('Stored job identity mismatch.');if(j.status==='SENDING'){j.status='UNKNOWN';j.note='Earlier dispatch did not finish recording its result. Never retry automatically.';nmpPersist_(c,j);return;}if(j.status!=='SCHEDULED')return;var p=schedules[j.jobId],now=Date.now();if(!p||p.requestId!==j.requestId||p.contentHash!==j.contentHash||!nmpValidSchedule_(p,now)){j.status='BLOCKED';j.note='Frozen request missing or changed. No send attempted.';nmpPersist_(c,j);return;}if(now<p.dueAt)return;if(now>p.expiresAt){j.status='MISSED';j.note='Approved late window expired. No catch-up send.';nmpPersist_(c,j);return;}if(attempted>=20||Date.now()-dispatchStarted>=45000)return;
   nmpConfig_();j.status='SENDING';j.note='Dispatch reserved; cancellation is no longer assured.';nmpPersist_(c,j);attempted++;
   try{var result=Gmail.Users.Messages.send({raw:p.raw},'me');if(!result||typeof result.id!=='string'||!result.id)throw Error('Missing Gmail receipt.');j.status='SENT';j.messageId=result.id;j.threadId=result.threadId||'';j.note='Gmail API accepted message; this is not proof of delivery or ATS submission.';nmpPersist_(c,j);}catch(error){j.status='UNKNOWN';j.note='Send or receipt persistence uncertain. Inspect Gmail; no automatic retry.';try{nmpPersist_(c,j);}catch(ignore){}}
  });
  try{nmpTidy_(c,commands);}catch(error){console.warn('Sheet tidy skipped: '+error.message);}
 }finally{lock.releaseLock();}
}
function nmpSchedulerInstall(){
 var ui=SpreadsheetApp.getUi();if(ui.alert('Activate application scheduler?','This initialises empty Requests/Jobs tables and creates a one-minute Google-hosted trigger. Future app-approved messages may send while this PC is off. Existing pilot code and unrelated triggers are untouched. Authorisation scopes must be reviewed first.',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
 var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('Scheduler busy.');try{var c=nmpConfig_();[['Requests',NMP_REQUEST_HEADER],['Jobs',NMP_JOB_HEADER]].forEach(function(entry){var tab=c.sheet.getSheetByName(entry[0]);if(!tab)throw Error('Expected existing tab missing.');if(tab.getLastRow()===0)tab.getRange(1,1,1,entry[1].length).setValues([entry[1]]);else if(JSON.stringify(tab.getRange(1,1,1,entry[1].length).getValues()[0])!==JSON.stringify(entry[1]))throw Error('Existing table differs; not overwritten.');});SpreadsheetApp.flush();var triggers=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===NMP_HANDLER;});if(triggers.length>1)throw Error('Multiple application scheduler triggers. Inspect first.');if(!triggers.length)ScriptApp.newTrigger(NMP_HANDLER).timeBased().everyMinutes(1).create();}finally{lock.releaseLock();}ui.alert('Application scheduler activated. No email was sent by this function.');
}
function nmpSchedulerPause(){var ui=SpreadsheetApp.getUi();if(ui.alert('Pause application scheduler?','This removes only the application scheduler trigger. Jobs are not cancelled. On resumption, only jobs within their approved late window may send. An in-flight message cannot be recalled.',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;var lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw Error('Dispatch may be in flight. Pause not confirmed.');try{ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()===NMP_HANDLER)ScriptApp.deleteTrigger(t);});}finally{lock.releaseLock();}}
