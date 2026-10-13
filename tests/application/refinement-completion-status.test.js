import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCompletedRefinement} from '../../src/application/refinement-completion-status.js';
import {describeRefinementFailure} from '../../src/application/refinement-error-details.js';
const context={requestedModel:'anthropic/claude-haiku-5-5',outputTokenBudget:4096,httpStatus:200,elapsedMs:25100,providerRequestId:'synthetic'};
function rejected(payload){try{assertCompletedRefinement(payload,context);}catch(error){return error;}throw new Error('Expected rejection');}
test('completed and legacy mock responses remain supported',()=>{assertCompletedRefinement({status:'completed'});assertCompletedRefinement({output_parsed:{proposedDraft:'Evidence'}});});
test('incomplete captures budget reason, model and usage without exposing text',()=>{
 const error=rejected({status:'incomplete',model:context.requestedModel,incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:4000,output_tokens:4096,cost:{total_cost:0.002}},output:[{type:'message',content:[{text:'PRIVATE LETTER'}]}]});
 const details=describeRefinementFailure(error);
 assert.equal(error.code,'REFINEMENT_INCOMPLETE_OUTPUT');assert.equal(details.responseStatus,'incomplete');assert.equal(details.incompleteReason,'max_output_tokens');assert.equal(details.outputAtTokenBudget,true);assert.equal(details.httpStatus,200);assert.equal(details.returnedModel,context.requestedModel);assert.ok(!JSON.stringify(details).includes('PRIVATE'));
});
test('failed provider result is not mislabeled incomplete',()=>{
 const error=rejected({status:'failed',error:{code:'invalid_schema',type:'validation_error',message:'PRIVATE INPUT schema problem'}});
 assert.equal(error.code,'REFINEMENT_PROVIDER_FAILED');const details=describeRefinementFailure(error);assert.equal(details.providerErrorCategory,'structured_output');assert.ok(!JSON.stringify(details).includes('PRIVATE'));
});
test('queued and in-progress results are pending, not truncation',()=>{for(const status of ['queued','in_progress'])assert.equal(rejected({status}).code,'REFINEMENT_RESPONSE_PENDING');});
test('cancelled and unknown statuses are classified separately',()=>{assert.equal(rejected({status:'cancelled'}).code,'REFINEMENT_PROVIDER_CANCELLED');assert.equal(rejected({status:'unknown'}).code,'REFINEMENT_STATUS_UNRECOGNIZED');});
test('missing reason does not become an invented token-limit explanation',()=>{
 const details=describeRefinementFailure(rejected({status:'incomplete',usage:{output_tokens:4096}}));assert.equal(details.incompleteReason,'unreported');assert.equal(details.outputAtTokenBudget,true);
});
test('incomplete message beneath completed envelope is not accepted',()=>{assert.equal(rejected({status:'completed',output:[{type:'message',status:'incomplete'}]}).code,'REFINEMENT_INCOMPLETE_OUTPUT');});
test('wrapper-carried details remain visible in the server diagnostic',()=>{
 const original=rejected({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}});
 const rethrown=new Error('Controlled failure');rethrown.code=original.code;rethrown.refinementDetails=describeRefinementFailure(original);
 assert.equal(describeRefinementFailure(rethrown).incompleteReason,'max_output_tokens');
});
