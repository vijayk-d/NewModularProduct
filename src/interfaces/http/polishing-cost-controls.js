export function attachPolishingCostControls(doc=document, fetchImpl=fetch, confirmImpl=message=>window.confirm(message)) {
  const form=doc.querySelector('form[action="/cover-letter-refinement"]');
  if(!form||form.dataset.costGuardAttached==='true')return;
  form.dataset.costGuardAttached='true';
  const select=form.querySelector('[name="polishingModel"]');
  const status=form.querySelector('[data-polishing-cost-status]');
  const button=form.querySelector('button[type="submit"]');
  if(!select||!status||!button)return;
  const personalInstructions=()=>String(form.querySelector('[name="instructions"]')?.value||'').replace(/\r\n?/g,'\n').trim();
  const instructionField=form.querySelector('[name="instructions"]');
  instructionField?.addEventListener('input',()=>{for(const field of form.querySelectorAll('[name="polishingCostConfirmed"],[name="polishingConfirmedInstructions"]'))field.value='';status.textContent='Personal instructions changed. The next polish will refresh the cost estimate and ask for confirmation.';});
  const scenarioInput=()=>form.querySelector('[name="scenarioSelections"]')?.value||'[]';
  form.querySelector('[name="scenarioSelections"]')?.addEventListener('change',()=>{for(const field of form.querySelectorAll('[name="polishingCostConfirmed"],[name="polishingConfirmedScenarios"]'))field.value='';status.textContent='Scenario selection changed. A fresh estimate and confirmation are required.';});
  let pending=false,bypass=false;
  async function estimate() {
    const values=new URLSearchParams(new FormData(form));
    const response=await fetchImpl('/cover-letter-refinement/estimate',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:values.toString()});
    const result=await response.json();
    if(!response.ok||!result.ok)throw new Error(result.error||'Local cost estimate failed. No polishing call was made.');
    const choice=select.value;
    const chosen=select.dataset.selectionExplicit==='true'?choice:result.recommendedModel;
    select.replaceChildren();
    for(const item of result.models){
      const option=doc.createElement('option');option.value=item.id;
      option.textContent=`${item.label} (${item.provider}) — $${item.estimatedTokenCostUsd.toFixed(6)} token subtotal; $${item.inputUsdPerMillion.toFixed(2)} input / $${item.outputUsdPerMillion.toFixed(2)} output per 1M (${item.tier} tier)`;
      select.appendChild(option);
    }
    select.value=chosen;
    const model=result.models.find(item=>item.id===chosen);
    if(!model)throw new Error('Selected model is unavailable. No polishing call was made.');
    status.textContent=`${model.label}: approximately ${result.estimatedInputTokens} input tokens, ${result.outputTokenBudget} output-token budget; $${model.estimatedTokenCostUsd.toFixed(6)} token subtotal. ${result.assumption} ${result.limitation} ${result.webSearchAllowed?'Fast search is allowed: $0.001 per invocation plus result tokens.':'Web search is disabled.'} Local estimate only; no Perplexity call was made.`;
    if(select.dispatchEvent){const E=doc.defaultView?.Event||globalThis.Event;select.dispatchEvent(new E('polishing-options-updated',{bubbles:true}));}
    return {result,model};
  }
  async function showEstimate(){
    if(pending)return;pending=true;button.disabled=true;
    try{await estimate();}catch(error){status.textContent=error.message;}finally{pending=false;button.disabled=false;}
  }
  select.addEventListener('change',()=>{select.dataset.selectionExplicit='true';showEstimate();});
  for(const input of (form.querySelectorAll?.('[name="letterLengthMode"],[name="advertiserRelationship"]')||[]))input.addEventListener('change',()=>{for(const field of form.querySelectorAll('[name="polishingCostConfirmed"],[name="polishingConfirmedLengthMode"]'))field.value='';showEstimate();});
  form.querySelector('[data-polishing-cheapest]')?.addEventListener('click',()=>{select.dataset.selectionExplicit='false';showEstimate();});
  form.querySelector('[data-polishing-estimate]')?.addEventListener('click',showEstimate);
  form.addEventListener('submit',async event=>{
    if(bypass)return;
    event.preventDefault();if(pending)return;pending=true;button.disabled=true;
    try {
      const instructions=personalInstructions();
      const scenarios=scenarioInput();
      const relationship=form.querySelector('[name="advertiserRelationship"]:checked')?.value;
      const {result,model}=await estimate();
      if(relationship!==form.querySelector('[name="advertiserRelationship"]:checked')?.value)throw new Error('Advertiser relationship changed; review the estimate again.');
      if(instructions!==personalInstructions())throw new Error('Personal instructions changed; review the estimate again.');
      if(scenarios!==scenarioInput())throw new Error('Scenario selection changed; review the estimate again.');
      const approved=confirmImpl(`Polish using ${model.label} (${model.provider})?\nAdvertiser relationship: ${relationship||'saved selection'}.\nLetter length: ${result.letterLengthMode||'standard'}; complete-letter maximum ${result.fullLetterMaximumWords||400} words.\nApproximate input: ${result.estimatedInputTokens} tokens. Output-token budget: ${result.outputTokenBudget}.\nToken subtotal at that budget: $${model.estimatedTokenCostUsd.toFixed(6)} USD.\n${result.webSearchAllowed?'Additional fast-search charges and result tokens are excluded.':'Web search disabled.'}\nThis is not a guaranteed final charge. Your CV evidence goes to the selected provider through Perplexity. No automatic paid retries.`);
      if(instructions!==personalInstructions())throw new Error('Personal instructions changed; review the estimate again.');
      if(scenarios!==scenarioInput())throw new Error('Scenario selection changed; review the estimate again.');
      if(!approved){status.textContent+=' Cancelled. No polishing call made.';return;}
      let confirmation=form.querySelector('[name="polishingCostConfirmed"]');
      if(!confirmation){confirmation=doc.createElement('input');confirmation.type='hidden';confirmation.name='polishingCostConfirmed';form.appendChild(confirmation);}
      confirmation.value='true';
      let confirmedScenarios=form.querySelector('[name="polishingConfirmedScenarios"]');if(!confirmedScenarios){confirmedScenarios=doc.createElement('input');confirmedScenarios.type='hidden';confirmedScenarios.name='polishingConfirmedScenarios';form.appendChild(confirmedScenarios);}confirmedScenarios.value=result.scenarioCostProof||'';
      let confirmedInstructions=form.querySelector('[name="polishingConfirmedInstructions"]');if(!confirmedInstructions){confirmedInstructions=doc.createElement('input');confirmedInstructions.type='hidden';confirmedInstructions.name='polishingConfirmedInstructions';form.appendChild(confirmedInstructions);}confirmedInstructions.value=instructions;
      let confirmedModel=form.querySelector('[name="polishingConfirmedModel"]');
      if(!confirmedModel){confirmedModel=doc.createElement('input');confirmedModel.type='hidden';confirmedModel.name='polishingConfirmedModel';form.appendChild(confirmedModel);}
      confirmedModel.value=model.id;
      let confirmedLength=form.querySelector('[name="polishingConfirmedLengthMode"]');if(!confirmedLength){confirmedLength=doc.createElement('input');confirmedLength.type='hidden';confirmedLength.name='polishingConfirmedLengthMode';form.appendChild(confirmedLength);}confirmedLength.value=result.letterLengthMode||'standard';
      if(relationship){let field=form.querySelector('[name="polishingConfirmedRelationship"]');if(!field){field=doc.createElement('input');field.type='hidden';field.name='polishingConfirmedRelationship';form.appendChild(field);}field.value=relationship;}
      button.disabled=false;bypass=true;form.requestSubmit(button);bypass=false;
    }catch(error){status.textContent=error.message+' No polishing call was made.';}
    finally{pending=false;button.disabled=false;}
  });
  showEstimate();
}
