import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {gmailLoadedEnvironment,gmailDraftConfigurationDiagnostics} from '../../src/application/gmail-runtime-diagnostics.js';
const repository={getById(){},findDraftOperation(){},claimDraftOperation(){},recordDraftOutcome(){}};
const mailbox={mailboxCheckEnabled:true,configurationReady:true,configuredFromAddress:'sender@example.test'};
test('OAuth credential values are never printed or returned',()=>{
 const rows=gmailLoadedEnvironment({GMAIL_OAUTH_CLIENT_ID:'PRIVATE_ID',GMAIL_OAUTH_CLIENT_SECRET:'PRIVATE_SECRET',GMAIL_OAUTH_REFRESH_TOKEN:'PRIVATE_TOKEN',UNRELATED_SECRET:'PRIVATE_OTHER'});
 assert.ok(!JSON.stringify(rows).includes('PRIVATE'));assert.equal(rows.find(row=>row.name==='GMAIL_OAUTH_CLIENT_SECRET').value,'[set; redacted]');
});
test('valid sender and safe paths are visible while invalid flags are hidden',()=>{
 const rows=gmailLoadedEnvironment({GMAIL_FROM_ADDRESS:'sender@example.test',CV_FOLDER:'D:\\CVs',ENABLE_GMAIL_DRAFT_CREATION:'PRIVATE_FLAG'});
 assert.equal(rows.find(row=>row.name==='GMAIL_FROM_ADDRESS').value,'sender@example.test');assert.ok(!JSON.stringify(rows).includes('PRIVATE_FLAG'));
});
test('missing creation flag gives an exact blocked reason',t=>{
 const folder=mkdtempSync(join(tmpdir(),'gmail-env-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const result=gmailDraftConfigurationDiagnostics({env:{CV_FOLDER:folder},mailbox,repository});
 assert.equal(result.configurationReady,true);assert.ok(result.blockedReasons[0].includes('ENABLE_GMAIL_DRAFT_CREATION=true'));
});
test('missing OAuth, CV directory and ledger methods are reported independently',()=>{
 const result=gmailDraftConfigurationDiagnostics({env:{ENABLE_GMAIL_DRAFT_CREATION:'true',CV_FOLDER:'/no/such/cv'},mailbox:{mailboxCheckEnabled:false,configurationReady:false,missingSettings:['GMAIL_OAUTH_REFRESH_TOKEN']},repository:{}});
 assert.equal(result.configurationReady,false);assert.ok(result.blockedReasons.some(reason=>reason.includes('GMAIL_OAUTH_REFRESH_TOKEN')));assert.ok(result.blockedReasons.some(reason=>reason.includes('CV_FOLDER')));assert.equal(result.missingLedgerMethods.length,4);
});
test('complete configuration enables review without authenticating or reserving',t=>{
 const folder=mkdtempSync(join(tmpdir(),'gmail-ready-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const result=gmailDraftConfigurationDiagnostics({env:{ENABLE_GMAIL_DRAFT_CREATION:'true',CV_FOLDER:folder},mailbox,repository});
 assert.deepEqual(result.blockedReasons,[]);assert.equal(result.configurationReady,true);
});
