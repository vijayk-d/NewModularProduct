import test from 'node:test';
import assert from 'node:assert/strict';
import { refinementAttemptLogFields } from '../../src/application/refinement-attempt-log.js';
test('successful attempt emits models, separate token counts and actual cost',()=>{
 const fields=refinementAttemptLogFields({requestedModel:'anthropic/claude-haiku-5-5',returnedModel:'anthropic/claude-haiku-5-5',inputTokens:4000,outputTokens:1200,reasoningTokens:0,providerReportedCostUsd:0.001,durationMs:25000,outcome:'passed'});
 assert.equal(fields.requestedModel,'anthropic/claude-haiku-5-5');assert.equal(fields.inputTokens,4000);assert.equal(fields.reasoningTokens,0);assert.equal(fields.reportedRequestCostUsd,0.001);assert.equal(fields.costSource,'provider_reported');assert.equal(fields.outcome,'passed');
});
test('timeout keeps unknown usage and billing unknown, not zero',()=>{
 const fields=refinementAttemptLogFields({requestedModel:'perplexity/glm-5.3-flash',outcome:'failed',errorCode:'REFINEMENT_NETWORK_FAILED'});
 assert.equal(fields.returnedModel,'unreported');assert.equal(fields.outputTokens,'unreported');assert.equal(fields.reportedRequestCostUsd,'unavailable');assert.equal(fields.costSource,'unavailable');
});
test('provider-reported zero is preserved as zero',()=>assert.equal(refinementAttemptLogFields({providerReportedCostUsd:0}).reportedRequestCostUsd,0));
test('local rejection retains reported usage/cost in its metrics',()=>{
 const fields=refinementAttemptLogFields({outcome:'failed',errorCode:'REFINEMENT_INCOMPLETE_OUTPUT',inputTokens:4000,outputTokens:4096,reasoningTokens:3800,providerReportedCostUsd:0.0024});
 assert.equal(fields.outputTokens,4096);assert.equal(fields.reasoningTokens,3800);assert.equal(fields.reportedRequestCostUsd,0.0024);assert.equal(fields.errorCode,'REFINEMENT_INCOMPLETE_OUTPUT');
});
test('no prompt, CV, letter or secret fields can enter this log',()=>{
 const fields=refinementAttemptLogFields({requestedModel:'<script>PRIVATE</script>',prompt:'PRIVATE',cv:'PRIVATE',apiKey:'PRIVATE',proposedDraft:'PRIVATE',providerReportedCostUsd:-1});
 assert.ok(!JSON.stringify(fields).includes('PRIVATE'));assert.equal(fields.reportedRequestCostUsd,'unavailable');
});
test('null metadata is safe',()=>assert.equal(refinementAttemptLogFields(null).requestedModel,'unreported'));
