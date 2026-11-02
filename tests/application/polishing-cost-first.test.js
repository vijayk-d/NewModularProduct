import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_POLISHING_MODEL,POLISHING_MODELS,modelRates,rankModelsForRequest,estimateModelTokenCost,POLISHING_OUTPUT_TOKEN_BUDGET} from '../../src/application/polishing-model-catalog.js';
import {estimatePolishingApiRequest} from '../../src/application/polishing-cost-estimator.js';
import {buildPolishingApiRequest,createPerplexityCoverLetterRefinementAdapter} from '../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
import {attachPolishingCostControls} from '../../src/interfaces/http/polishing-cost-controls.js';
test('nine allowlisted models sort cost-first and Haiku is the fresh-review default',()=>{
  assert.equal(POLISHING_MODELS.length,9);assert.equal(DEFAULT_POLISHING_MODEL,'anthropic/claude-haiku-5-5');
  assert.equal(POLISHING_MODELS[0].id,DEFAULT_POLISHING_MODEL);
  assert.ok(POLISHING_MODELS.every((item,index)=>index===0||item.referenceCostUsd>=POLISHING_MODELS[index-1].referenceCostUsd));
});
test('Haiku and GPT-6 Luna tie at base rates',()=>{
  const ranks=rankModelsForRequest(5000,1500);assert.equal(ranks[0].estimatedTokenCostUsd,ranks[1].estimatedTokenCostUsd);
});
test('Haiku price changes for the whole request above 100000 tokens',()=>{
  const model=POLISHING_MODELS[0];assert.equal(modelRates(model,100000).tier,'base');assert.equal(modelRates(model,100001).tier,'high');
  assert.equal(modelRates(model,100001).inputUsdPerMillion,0.5);
});
test('cost ordering changes with a larger prompt',()=>{
  assert.equal(rankModelsForRequest(110000,4096)[0].id,'openai/gpt-6-luna');
});
test('OpenAI higher tier applies above 272000 tokens',()=>{
  const model=POLISHING_MODELS.find(item=>item.id==='openai/gpt-5.6-luna');assert.equal(modelRates(model,272001).outputUsdPerMillion,1.8);
});
test('negative token estimates are rejected',()=>assert.throws(()=>estimateModelTokenCost(POLISHING_MODELS[0],-1,100)));
test('offline builder supplies explicit output budget including Anthropic',()=>{
  const body=buildPolishingApiRequest({draftPlainText:'Original',maxWords:450,webSearchEnabled:false},DEFAULT_POLISHING_MODEL);
  assert.equal(body.max_output_tokens,POLISHING_OUTPUT_TOKEN_BUDGET);assert.ok(!body.tools);
});
test('cost estimate exposes counts and public rates, not evidence text',()=>{
  const body=buildPolishingApiRequest({draftPlainText:'PRIVATE DRAFT',selectedCvText:'PRIVATE CV',maxWords:450,webSearchEnabled:false},DEFAULT_POLISHING_MODEL);
  const estimate=estimatePolishingApiRequest(body);assert.ok(estimate.estimatedInputTokens>0);assert.ok(!JSON.stringify(estimate).includes('PRIVATE'));
  assert.equal(estimate.webSearchAllowed,false);assert.ok(estimate.limitation.includes('Not a billing ceiling'));
});
test('search allowance is reported separately from token estimate',()=>{
  const body=buildPolishingApiRequest({draftPlainText:'Original',maxWords:450,webSearchEnabled:true},DEFAULT_POLISHING_MODEL);
  assert.equal(estimatePolishingApiRequest(body).webSearchAllowed,true);
});
test('paid request uses the same builder budget',async()=>{
  let sent;const adapter=createPerplexityCoverLetterRefinementAdapter({apiKey:'synthetic',async fetchImpl(url,options){sent=JSON.parse(options.body);return {ok:true,status:200,async json(){return {status:'completed',output_parsed:{proposedDraft:'I led delivery.',warnings:[],highlightPhrases:[],appliedResearchPointIds:[],omittedResearchPointIds:[],suggestedResearchPoints:[]}};}};}});
  await adapter.refine({draftPlainText:'Original',maxWords:450,webSearchEnabled:false,polishingModel:DEFAULT_POLISHING_MODEL});
  assert.equal(sent.max_output_tokens,4096);assert.equal(sent.model,DEFAULT_POLISHING_MODEL);
});
test('incomplete response cannot become a proposal',async()=>{
  const adapter=createPerplexityCoverLetterRefinementAdapter({apiKey:'synthetic',async fetchImpl(){return {ok:true,status:200,async json(){return {status:'incomplete',usage:{cost:{total_cost:0.001}},output_parsed:{proposedDraft:'I led delivery.',warnings:[],highlightPhrases:[]}};}};}});
  await assert.rejects(adapter.refine({draftPlainText:'Original',maxWords:450,polishingModel:DEFAULT_POLISHING_MODEL}),error=>error.code==='REFINEMENT_INCOMPLETE_OUTPUT'&&error.attemptMetadata.providerReportedCostUsd===0.001);
});
test('client makes only local estimate calls and cancel prevents submission',async()=>{
  const originalFormData=globalThis.FormData;globalThis.FormData=class {constructor(){}*[Symbol.iterator](){yield ['reviewId','synthetic'];}};
  const listeners={};let submitted=0;const select={value:DEFAULT_POLISHING_MODEL,dataset:{},replaceChildren(){},appendChild(){},addEventListener(name,fn){listeners['model-'+name]=fn;}};
  const status={textContent:''},button={disabled:false};const form={dataset:{},querySelector(selector){if(selector==='[name="polishingModel"]')return select;if(selector==='[data-polishing-cost-status]')return status;if(selector==='button[type="submit"]')return button;return null;},addEventListener(name,fn){listeners[name]=fn;},requestSubmit(){submitted++;}};
  const doc={querySelector(){return form;},createElement(){return {};}};
  const urls=[];
  try{
    attachPolishingCostControls(doc,async url=>{urls.push(url);return {ok:true,async json(){return {ok:true,...estimatePolishingApiRequest(buildPolishingApiRequest({maxWords:450,webSearchEnabled:false},DEFAULT_POLISHING_MODEL))};}};},()=>false);
    await new Promise(resolve=>setTimeout(resolve,5));
    await listeners.submit({preventDefault(){}});
    assert.equal(submitted,0);assert.ok(urls.every(url=>url==='/cover-letter-refinement/estimate'));assert.ok(status.textContent.includes('Cancelled'));
  }finally{globalThis.FormData=originalFormData;}
});

test('confirmation authorizes one native form submission with the chosen model',async()=>{
  const originalFormData=globalThis.FormData;globalThis.FormData=class{constructor(){}*[Symbol.iterator](){yield ['reviewId','synthetic'];}};
  const handlers={},hidden={};let submitted=0,confirmed=0;
  const select={value:DEFAULT_POLISHING_MODEL,dataset:{selectionExplicit:'true'},replaceChildren(){},appendChild(){},addEventListener(){}};
  const status={textContent:''},button={disabled:false};
  const form={dataset:{},querySelector(key){if(key==='[name="polishingModel"]')return select;if(key==='[data-polishing-cost-status]')return status;if(key==='button[type="submit"]')return button;
    const match=key.match(/^\[name="([^"]+)"\]$/);return match?hidden[match[1]]:null;},appendChild(node){hidden[node.name]=node;},
    addEventListener(name,fn){handlers[name]=fn;},requestSubmit(){submitted++;handlers.submit({preventDefault(){throw new Error('approved submit must bypass');}});}};
  const doc={querySelector(){return form;},createElement(){return {};}};
  try{
    attachPolishingCostControls(doc,async()=>({ok:true,async json(){return {ok:true,...estimatePolishingApiRequest(buildPolishingApiRequest({maxWords:450,webSearchEnabled:false},DEFAULT_POLISHING_MODEL))};}}),()=>{confirmed++;return true;});
    await new Promise(resolve=>setTimeout(resolve,5));await handlers.submit({preventDefault(){}});
    assert.equal(confirmed,1);assert.equal(submitted,1);assert.equal(hidden.polishingCostConfirmed.value,'true');assert.equal(hidden.polishingConfirmedModel.value,DEFAULT_POLISHING_MODEL);
  }finally{globalThis.FormData=originalFormData;}
});
