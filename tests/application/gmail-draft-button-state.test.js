import test from 'node:test';
import assert from 'node:assert/strict';
import {gmailDraftButtonState} from '../../src/interfaces/http/outreach-queue-browser.js';
const configuration={draftCreationEnabled:true,configurationReady:true};
const preview={ticket:'opaque',expiresAt:2000};
test('backend-ready state makes preview clickable but not creation without approval',()=>assert.deepEqual(gmailDraftButtonState({configuration,now:1000}),{previewDisabled:false,createDisabled:true}));
test('blocked configuration still permits a local readiness/explanation click',()=>assert.deepEqual(gmailDraftButtonState({configuration:{draftCreationEnabled:false,configurationReady:false},now:1000}),{previewDisabled:false,createDisabled:true}));
test('pending action locks both buttons against duplicate clicks',()=>assert.deepEqual(gmailDraftButtonState({busy:true,configuration,preview,now:1000}),{previewDisabled:true,createDisabled:true}));
test('creation requires enabled configuration and an unexpired preview ticket',()=>assert.equal(gmailDraftButtonState({configuration,preview,now:1000}).createDisabled,false));
test('expired, missing, or disabled preview state cannot enable creation',()=>{
 for(const value of [{configuration,preview,now:2000},{configuration,preview:{expiresAt:2000},now:1000},{configuration:{draftCreationEnabled:false,configurationReady:true},preview,now:1000}])assert.equal(gmailDraftButtonState(value).createDisabled,true);
});
