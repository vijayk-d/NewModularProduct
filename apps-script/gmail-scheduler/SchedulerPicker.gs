// Option A: explicit per-file Google Picker grant. No Gmail or trigger calls.
function nmpPickerContext_(){
 var sheet=SpreadsheetApp.getActiveSpreadsheet();
 if(!sheet)throw Error('Open this project from the configured scheduler spreadsheet.');
 var tab=sheet.getSheetByName('Settings');
 if(!tab)throw Error('Settings is missing in this bound spreadsheet. Do not create a replacement Sheet.');
 var owner=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase(),settings={};
 tab.getRange('A1:B4').getValues().forEach(function(row){if(row.length===2)settings[String(row[0])]=String(row[1]);});
 if(!owner||settings.owner!==owner||settings.schema!=='cloud-mail-queue-v1'||settings.environment!=='production'||!/^[a-f0-9-]{36}$/.test(settings.namespace))throw Error('Bound Sheet/account identity does not match the scheduler contract.');
 return {sheet:sheet,owner:owner,namespace:settings.namespace};
}
function nmpShowSchedulerPicker(){
 nmpPickerContext_();
 if(typeof nmpConfig_!=='function'||typeof nmpHeaders_!=='function')throw Error('The maintained Scheduler.gs must be installed in this same bound project first.');
 var html=HtmlService.createHtmlOutputFromFile('SchedulerFilePicker').setWidth(900).setHeight(650);
 SpreadsheetApp.getUi().showModalDialog(html,'Authorise only the existing scheduler spreadsheet');
}
function nmpSchedulerPickerBootstrap(){
 var context=nmpPickerContext_(),properties=PropertiesService.getScriptProperties();
 var project=String(properties.getProperty('NMP_PICKER_PROJECT_NUMBER')||'').trim();
 var apiKey=String(properties.getProperty('NMP_PICKER_API_KEY')||'').trim();
 if(!/^[0-9]{6,20}$/.test(project))throw Error('Configure NMP_PICKER_PROJECT_NUMBER with the standard Cloud project NUMBER used by this Apps Script project.');
 if(!/^[A-Za-z0-9_-]{20,100}$/.test(apiKey))throw Error('Configure the restricted Picker API key in NMP_PICKER_API_KEY. Do not put it in source.');
 return {expectedFileId:context.sheet.getId(),expectedName:context.sheet.getName(),projectNumber:project,developerKey:apiKey,oauthToken:ScriptApp.getOAuthToken()};
}
function nmpVerifySchedulerPickerSelection(fileId){
 var context=nmpPickerContext_();
 if(typeof fileId!=='string'||fileId!==context.sheet.getId())return {ok:false,scheduled:false,sent:false,stage:'selected_file_mismatch',note:'Wrong file selected. No scheduler operation was performed. Picker selection may already have granted access to that other file; this code cannot undo that grant. Select only the bound scheduler Sheet.'};
 var stage='drive_per_file_and_owner_only_privacy';
 try{
  var checked=nmpConfig_();
  if(!checked.sheet||checked.sheet.getId()!==fileId||checked.owner!==context.owner||checked.namespace!==context.namespace)throw Error('Context mismatch');
  stage='scheduler_table_headers';nmpHeaders_(checked);
  return {ok:true,scheduled:false,sent:false,triggerChanged:false,perFileAccess:true,ownerOnlyPrivacy:true,tablesReady:true,note:'Per-file Drive access and owner-only privacy checks passed for this bound Sheet. No trigger was started and no email was sent.'};
 }catch(error){
  return {ok:false,scheduled:false,sent:false,triggerChanged:false,stage:stage,note:'Selected-file validation did not pass. Check that Picker, its API key, project number and Apps Script use the same standard Cloud project; then retry this read-only verification. Do not broaden Drive scopes or bypass the privacy guard.'};
 }
}
