/** @OnlyCurrentDoc */
// OPTION B FEASIBILITY PILOT ONLY. One explicitly approved self-addressed message.
// No web app, inbox access, drafts, attachments, credentials, contacts or local-server calls.
var PILOT_KEY='OPTION_B_SELF_TEST_V1';
var PILOT_HISTORY='OPTION_B_SELF_TEST_HISTORY_V1';
var PILOT_HANDLER='optionBPilotTick';
var PILOT_DELAY_MS=10*60*1000;
var PILOT_GRACE_MS=15*60*1000;

function onOpen(){
 SpreadsheetApp.getUi().createMenu('Option B pilot')
  .addItem('Schedule one self-test in 10 minutes','pilotScheduleSelfTest')
  .addItem('Show pilot status','pilotShowStatus')
  .addItem('Confirm receipt after checking Gmail','pilotConfirmReceipt')
  .addItem('Stop / cancel pilot','pilotStop')
  .addItem('Archive terminal pilot result','pilotArchiveResult')
  .addToUi();
}
function pilotOwner_(){
 var email=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
 if(!/^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$/.test(email))throw new Error('Google did not disclose the authorised account. Stop; no manually entered recipient is allowed.');
 return email;
}
function pilotProps_(){return PropertiesService.getScriptProperties();}
function pilotLoad_(){var raw=pilotProps_().getProperty(PILOT_KEY);return raw?JSON.parse(raw):null;}
function pilotSave_(job){pilotProps_().setProperty(PILOT_KEY,JSON.stringify(job));}
function pilotMaterial_(job){
 return {version:1,id:job.id,owner:job.owner,to:job.owner,dueAt:job.dueAt,expiresAt:job.expiresAt,
  subject:'[SCHEDULER PILOT] '+job.id,
  body:'This is an explicitly approved Google-hosted scheduling test sent only to this same account.\nNo CV, application data or attachments are included.\n\nPilot ID: '+job.id+'\nRequested send time (UTC): '+new Date(job.dueAt).toISOString()};
}
function pilotDigest_(value){
 var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value),Utilities.Charset.UTF_8);
 return bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
function pilotValid_(job,owner){
 return job&&job.version===1&&job.approved===true&&job.owner===owner&&/^[a-f0-9-]{36}$/.test(String(job.id))
  &&Number.isFinite(job.dueAt)&&Number.isFinite(job.expiresAt)&&job.expiresAt===job.dueAt+PILOT_GRACE_MS
  &&job.digest===pilotDigest_(pilotMaterial_(job));
}
function pilotDeleteTriggers_(){
 ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()===PILOT_HANDLER)ScriptApp.deleteTrigger(t);});
}
function pilotEnsureTrigger_(){
 var own=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===PILOT_HANDLER;});
 if(own.length>1)throw new Error('Multiple pilot clock triggers detected. Stop the pilot before scheduling.');
 if(!own.length)ScriptApp.newTrigger(PILOT_HANDLER).timeBased().everyMinutes(1).create();
}
function pilotScheduleSelfTest(){
 var ui=SpreadsheetApp.getUi(),owner=pilotOwner_();
 if(pilotLoad_())throw new Error('A pilot record already exists. Inspect it; stop/archive a terminal result before explicitly creating a different test.');
 if(MailApp.getRemainingDailyQuota()<1)throw new Error('No sending quota remains. No job created.');
 var now=Date.now(),job={version:1,id:Utilities.getUuid().toLowerCase(),owner:owner,dueAt:now+PILOT_DELAY_MS,expiresAt:now+PILOT_DELAY_MS+PILOT_GRACE_MS,status:'PREPARING',approved:true,createdAt:now};
 var material=pilotMaterial_(job);
 var local=Utilities.formatDate(new Date(job.dueAt),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss z');
 var message='AUTHORISE ONE REAL TEST EMAIL?\n\nFrom / To: '+owner+'\nCC/BCC: none\nAttachments: none\nRequested: '+local+'\nUTC: '+new Date(job.dueAt).toISOString()+'\nMaximum late window: 15 minutes; otherwise MISSED.\n\nSubject: '+material.subject+'\n\n'+material.body+'\n\nThis creates a Google-hosted clock trigger. It may send later with no further prompt, including while your PC is off. Timing is best-effort. No application emails are involved.';
 if(ui.alert('Approve self-test scheduling',message,ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
 var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw new Error('Pilot is busy. Nothing new scheduled.');
 try{
  if(pilotLoad_())throw new Error('Another pilot appeared. Nothing new scheduled.');
  if(Date.now()+60000>=job.dueAt)throw new Error('Approval took too long. Run again to review a new future time.');
  job.digest=pilotDigest_(material);pilotSave_(job);
  try{
   pilotEnsureTrigger_();job.status='SCHEDULED';pilotSave_(job);
  }catch(error){
   try{job.status='SETUP_FAILED';job.note='Setup not confirmed. No automatic retries.';pilotSave_(job);}catch(ignore){}
   try{pilotDeleteTriggers_();}catch(ignore){}
   throw new Error('Setup failed or is unconfirmed. Inspect status and stop the pilot; do not schedule a duplicate blindly.');
  }
 }finally{lock.releaseLock();}
 ui.alert('Self-test scheduled','Pilot ID: '+job.id+'\nRequested time: '+local+'\nYou may now turn the PC off. Check Gmail on another device after the due time. SUBMITTED will mean only that the send call returned, not proof of receipt.',ui.ButtonSet.OK);
}
function optionBPilotTick(){
 var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
 try{
  var job=pilotLoad_();if(!job)return;
  if(job.status==='SENDING'){
   job.status='UNKNOWN';job.note='An earlier attempt did not finish recording its outcome. Inspect Gmail; never retry this job automatically.';pilotSave_(job);try{pilotDeleteTriggers_();}catch(ignore){}return;
  }
  if(job.status!=='SCHEDULED'){try{pilotDeleteTriggers_();}catch(ignore){}return;}
  var now=Date.now();if(now<job.dueAt)return;
  var owner;
  try{owner=pilotOwner_();if(!pilotValid_(job,owner))throw new Error('Invalid approval.');}
  catch(error){job.status='BLOCKED';job.note='Account or approved-content validation failed. No send attempted.';pilotSave_(job);try{pilotDeleteTriggers_();}catch(ignore){}return;}
  if(now>job.expiresAt){job.status='MISSED';job.note='Approved late window expired. No catch-up send.';pilotSave_(job);try{pilotDeleteTriggers_();}catch(ignore){}return;}
  try{if(MailApp.getRemainingDailyQuota()<1)throw new Error('No quota.');}
  catch(error){job.status='BLOCKED';job.note='Sending quota/preflight unavailable. No send attempted.';pilotSave_(job);try{pilotDeleteTriggers_();}catch(ignore){}return;}
  var material=pilotMaterial_(job);
  job.status='SENDING';job.attemptStartedAt=now;pilotSave_(job);
  // Use only the frozen deterministic material, never a supplied address or editable Gmail draft.
  try{
   MailApp.sendEmail({to:material.to,subject:material.subject,body:material.body,name:'Scheduling feasibility pilot'});
   job.status='SUBMITTED';job.submittedAt=Date.now();job.note='MailApp returned without an error. No Gmail message ID or delivery receipt is available; confirm in Gmail yourself.';pilotSave_(job);
  }catch(error){
   job.status='UNKNOWN';job.note='Send or outcome persistence failed. Email may already have been submitted. No automatic retry.';
   try{pilotSave_(job);}catch(ignore){}
  }
  try{pilotDeleteTriggers_();}catch(ignore){}
 }finally{lock.releaseLock();}
}
function pilotShowStatus(){
 var ui=SpreadsheetApp.getUi(),job=pilotLoad_();
 if(!job){ui.alert('No pilot job exists.');return;}
 if(job.owner!==pilotOwner_())throw new Error('This record belongs to another account.');
 ui.alert('Pilot status',JSON.stringify(job,null,2)+'\n\nSUBMITTED is not delivery confirmation. This pilot cannot determine whether your PC was off.',ui.ButtonSet.OK);
}
function pilotStop(){
 var ui=SpreadsheetApp.getUi(),lock=LockService.getScriptLock();
 if(!lock.tryLock(1000))throw new Error('A worker may be sending now. Cancellation is not confirmed; do not assume the message was recalled.');
 var text;
 try{
  var job=pilotLoad_();if(job&&job.owner!==pilotOwner_())throw new Error('Different account.');
  if(job&&['PREPARING','SCHEDULED'].indexOf(job.status)>=0){job.status='CANCELLED';job.note='Cancelled before execution.';pilotSave_(job);text='Pending self-test cancelled.';}
  else text='No pending job cancelled. A submitted/in-flight/unknown message cannot be recalled by this action.';
  pilotDeleteTriggers_();
 }finally{lock.releaseLock();}
 ui.alert('Pilot stopped',text+' Only this pilot handler clock is removed; other triggers are untouched.',ui.ButtonSet.OK);
}
function pilotConfirmReceipt(){
 var ui=SpreadsheetApp.getUi(),job=pilotLoad_();if(!job)throw new Error('No pilot exists.');
 if(job.owner!==pilotOwner_())throw new Error('Different account.');
 if(['SUBMITTED','UNKNOWN'].indexOf(job.status)<0)throw new Error('No submitted/uncertain attempt to confirm.');
 var reply=ui.alert('Manual evidence confirmation','Have you checked Gmail for exactly this pilot ID '+job.id+' and confirmed the test message arrived while this PC was OFF?\n\nThis records your observation, not a provider-generated receipt.',ui.ButtonSet.YES_NO);
 if(reply!==ui.Button.YES)return;
 var lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw new Error('Pilot busy. Nothing confirmed.');
 try{var current=pilotLoad_();if(!current||current.id!==job.id||['SUBMITTED','UNKNOWN'].indexOf(current.status)<0)throw new Error('Pilot changed.');current.userConfirmedReceiptAt=Date.now();current.userConfirmedPcOff=true;current.status='USER_CONFIRMED_RECEIPT';current.note='Receipt and PC-off condition confirmed by the user, not a provider-generated receipt.';pilotSave_(current);}finally{lock.releaseLock();}
 ui.alert('Your receipt/PC-off observation was recorded. No email was sent by this action.');
}
function pilotArchiveResult(){
 var ui=SpreadsheetApp.getUi(),job=pilotLoad_();if(!job)throw new Error('No result exists.');
 if(job.owner!==pilotOwner_())throw new Error('Different account.');
 if(['SCHEDULED','PREPARING','SENDING','UNKNOWN'].indexOf(job.status)>=0)throw new Error('Stop pending work first. UNKNOWN must be reconciled in Gmail, not silently cleared.');
 if(ui.alert('Archive this pilot result?','This does not retry anything. A future self-test will need fresh approval and a new ID.',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
 var lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw new Error('Pilot busy.');
 try{var current=pilotLoad_();if(!current||current.id!==job.id||['SCHEDULED','PREPARING','SENDING','UNKNOWN'].indexOf(current.status)>=0)throw new Error('Pilot changed.');pilotDeleteTriggers_();var history=JSON.parse(pilotProps_().getProperty(PILOT_HISTORY)||'[]');history.push(current);pilotProps_().setProperty(PILOT_HISTORY,JSON.stringify(history.slice(-10)));pilotProps_().deleteProperty(PILOT_KEY);}finally{lock.releaseLock();}
 ui.alert('Terminal result archived. No test is automatically scheduled.');
}
function pilotInspectReadOnly() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('OPTION_B_SELF_TEST_V1');

  if (!raw) {
    console.log(JSON.stringify({
      recordExists: false,
      inspectedAtUtc: new Date().toISOString()
    }, null, 2));
    return;
  }

  const job = JSON.parse(raw);

  function utc(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'INVALID_DATE' : date.toISOString();
  }

  let accountMatches = null;
  let approvalMatches = null;
  let quota = null;
  let clockCount = null;

  try {
    const email = String(
      Session.getEffectiveUser().getEmail() || ''
    ).trim().toLowerCase();
    accountMatches = !!email && email === job.owner;
  } catch (_) {}

  try {
    approvalMatches =
      job.digest === pilotDigest_(pilotMaterial_(job));
  } catch (_) {}

  try {
    quota = MailApp.getRemainingDailyQuota();
  } catch (_) {}

  try {
    clockCount = ScriptApp.getProjectTriggers()
      .filter(t => t.getHandlerFunction() === 'optionBPilotTick')
      .length;
  } catch (_) {}

  console.log(JSON.stringify({
    recordExists: true,
    id: job.id,
    status: job.status,
    createdAtUtc: utc(job.createdAt),
    dueAtUtc: utc(job.dueAt),
    expiresAtUtc: utc(job.expiresAt),
    attemptStartedAtUtc: utc(job.attemptStartedAt),
    submittedAtUtc: utc(job.submittedAt),
    inspectedAtUtc: new Date().toISOString(),
    scriptTimeZone: Session.getScriptTimeZone(),
    accountMatches: accountMatches,
    approvalMatchesCurrentCode: approvalMatches,
    remainingRecipientQuota: quota,
    pilotClockTriggerCount: clockCount,
    note: String(job.note || '').replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      '[email omitted]'
    )
  }, null, 2));
}
