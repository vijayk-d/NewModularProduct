import test from 'node:test';
import assert from 'node:assert/strict';
import { POLISHING_MODELS, DEFAULT_POLISHING_MODEL, normalizePolishingModel, buildPolishingAttempt, normalizeAttemptMetadata, retainSuccessfulProposal } from '../../src/application/polishing-model-catalog.js';
import { createPerplexityCoverLetterRefinementAdapter } from '../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
import { refineCoverLetter } from '../../src/application/refine-cover-letter.js';
import { renderRefinementPanel } from '../../src/interfaces/http/rendering.js';
function adapter({fail=false,badBody=false,usage=true}={}) {
  const capture={calls:0};
  const port=createPerplexityCoverLetterRefinementAdapter({apiKey:'synthetic',async fetchImpl(url,options){
    capture.calls++;capture.payload=JSON.parse(options.body);
    if(fail){const error=new TypeError('Synthetic fetch failure');error.cause={code:'UND_ERR_HEADERS_TIMEOUT'};throw error;}
    return {ok:true,status:200,headers:{get(){return 'synthetic';}},async json(){return {
      model:'google/gemini-3.1-flash-lite',...(usage?{usage:{input_tokens:123,output_tokens:45,output_tokens_details:{reasoning_tokens:7},cost:{total_cost:0.00012}}}:{}),
      output_parsed:{proposedDraft:badBody?'':'I led delivery across squads.',warnings:[],highlightPhrases:[],appliedResearchPointIds:[],omittedResearchPointIds:[],suggestedResearchPoints:[]}
    };}};
  }});return {port,capture};
}
const request={draftPlainText:'Original',maxWords:450,webSearchEnabled:false,letterTone:'professional',polishingModel:'google/gemini-3.1-flash-lite'};
test('catalog sorts by reference cost while keeping explicit legacy default',()=>{
  assert.equal(POLISHING_MODELS.length,9);
  assert.ok(POLISHING_MODELS.every((model,index)=>index===0||model.referenceCostUsd>=POLISHING_MODELS[index-1].referenceCostUsd));
  assert.equal(DEFAULT_POLISHING_MODEL,'anthropic/claude-haiku-5-5');
});
test('model allowlist rejects unknown IDs',()=>assert.throws(()=>normalizePolishingModel('attacker/model'),/supported/));
test('selected model reaches the provider without adding search',async()=>{
  const f=adapter();const result=await f.port.refine(request);
  assert.equal(f.capture.payload.model,request.polishingModel);assert.equal(f.capture.calls,1);
  assert.ok(!Object.hasOwn(f.capture.payload,'tools'));assert.equal(result.model,request.polishingModel);
});
test('invalid model is rejected before any provider call',async()=>{
  const f=adapter();await assert.rejects(f.port.refine({...request,polishingModel:'unknown'}),/supported/);assert.equal(f.capture.calls,0);
});
test('missing selection preserves constructor model',async()=>{
  const f=adapter();const legacy={...request};delete legacy.polishingModel;await f.port.refine(legacy);
  assert.equal(f.capture.payload.model,'perplexity/glm-5.3-flash');
});
test('successful metadata records returned model and provider cost',async()=>{
  const f=adapter();const result=await f.port.refine(request);
  assert.equal(result.attemptMetadata.requestedModel,request.polishingModel);
  assert.equal(result.attemptMetadata.returnedModel,'google/gemini-3.1-flash-lite');
  assert.equal(result.attemptMetadata.providerReportedCostUsd,0.00012);
  assert.equal(result.attemptMetadata.reasoningTokens,7);assert.equal(result.attemptMetadata.outcome,'passed');
});
test('missing reported usage stays unavailable, not zero',async()=>{
  const result=await adapter({usage:false}).port.refine(request);assert.equal(result.attemptMetadata.providerReportedCostUsd,null);
});
test('network failure preserves attempt metadata and does not retry',async()=>{
  const f=adapter({fail:true});let failure;
  try{await f.port.refine(request);}catch(error){failure=error;}
  assert.equal(failure.attemptMetadata.outcome,'failed');assert.equal(failure.attemptMetadata.errorCode,'REFINEMENT_NETWORK_FAILED');
  assert.equal(failure.attemptMetadata.providerReportedCostUsd,null);assert.equal(f.capture.calls,1);
});
test('local rejection retains provider billing metadata',async()=>{
  let error;try{await adapter({badBody:true}).port.refine(request);}catch(value){error=value;}
  assert.equal(error.attemptMetadata.outcome,'failed');assert.equal(error.attemptMetadata.providerReportedCostUsd,0.00012);
});
test('normalizer passes selected model and preserves returned metadata',async()=>{
  let normalized;
  const result=await refineCoverLetter(request,{coverLetterRefinementPort:{async refine(value){normalized=value;return {proposedDraft:'Evidence',attemptMetadata:buildPolishingAttempt({requestModel:request.polishingModel,outcome:'passed'})};}}});
  assert.equal(normalized.polishingModel,request.polishingModel);assert.equal(result.attemptMetadata.requestedModel,request.polishingModel);
});
test('normalizer keeps failure metadata without exposing raw exception contents',async()=>{
  const error=new Error('PRIVATE FAILURE');error.attemptMetadata=buildPolishingAttempt({requestModel:request.polishingModel,outcome:'failed'});
  const result=await refineCoverLetter(request,{coverLetterRefinementPort:{async refine(){throw error;}}});
  assert.equal(result.attemptMetadata.requestedModel,request.polishingModel);assert.ok(!result.error.includes('PRIVATE'));
});
test('failed attempt retains old proposal and its attribution without mutation',()=>{
  const old={proposedDraft:'Approved evidence',warnings:['Check dates'],attemptMetadata:{requestedModel:'perplexity/glm-5.3-flash'}};
  const before=JSON.stringify(old);const kept=retainSuccessfulProposal(old,{proposedDraft:'',warnings:['Timeout']});
  assert.equal(kept.proposedDraft,old.proposedDraft);assert.equal(kept.attemptMetadata.requestedModel,'perplexity/glm-5.3-flash');
  assert.equal(JSON.stringify(old),before);assert.ok(kept.warnings.at(-1).includes('Previous proposal retained'));
});
test('dropdown lists pricing and selected provider without a selection-triggered call',()=>{
  const result=renderRefinementPanel({research:{status:'found'},polishingModel:request.polishingModel});
  assert.ok(result.includes('name="polishingModel"'));assert.ok(result.includes('value="google/gemini-3.1-flash-lite" selected'));
  assert.ok(result.includes('$0.25 input / $1.50 output'));assert.ok(result.includes('2026-10-13'));
  assert.ok(!result.includes('onchange='));
});
test('attempt summary distinguishes unavailable cost from provider-reported zero',()=>{
  const attempt=buildPolishingAttempt({requestModel:request.polishingModel,outcome:'failed',durationMs:302000});
  const unavailable=renderRefinementPanel({research:{status:'found'},refinementLastAttempt:attempt});assert.ok(unavailable.includes('Unavailable—not zero'));
  const zero=renderRefinementPanel({research:{status:'found'},refinementLastAttempt:{...attempt,providerReportedCostUsd:0}});assert.ok(zero.includes('$0.000000'));
});
test('metadata normalization discards unknown fields and unsafe labels',()=>{
  const result=normalizeAttemptMetadata({requestedModel:'<script>',apiKey:'PRIVATE',providerReportedCostUsd:-1});
  assert.equal(result.requestedModel,null);assert.equal(result.providerReportedCostUsd,null);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('output extractor handles a reasoning item before the final message',async()=>{
  const port=createPerplexityCoverLetterRefinementAdapter({apiKey:'synthetic',async fetchImpl(){return {ok:true,status:200,async json(){return {output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:JSON.stringify({proposedDraft:'I led delivery.',warnings:[],highlightPhrases:[],appliedResearchPointIds:[],omittedResearchPointIds:[],suggestedResearchPoints:[]})}]}]};}};}});
  const result=await port.refine(request);assert.equal(result.proposedDraft,'I led delivery.');
});
