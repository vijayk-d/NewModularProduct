export const PALETTE_LABELS=Object.freeze({sky:'Sky blue',mint:'Mint green',lavender:'Lavender',rose:'Rose',ivory:'Ivory',white:'White'});
export function attachPalettePreview({doc,container,reviewId,request,onSaved=()=>{}}){
 const field=doc.createElement('fieldset'),legend=doc.createElement('legend'),choices=doc.createElement('div'),button=doc.createElement('button'),status=doc.createElement('p');
 const group='email-palette-'+String(reviewId||'review').replace(/[^A-Za-z0-9_-]/g,'');
 field.className='email-palette-controls';legend.textContent='Email background';choices.className='email-palette-choices';choices.setAttribute('role','radiogroup');choices.setAttribute('aria-label','Email background');button.type='button';button.textContent='Save email background';status.setAttribute('role','status');status.setAttribute('aria-live','polite');field.append(legend,choices,button,status);container.append(field);
 let info=null,selected=null,pending=null,error=null,disabled=true;
 const radios=()=>[...choices.querySelectorAll('input[type="radio"]')];
 function setDisabled(v){disabled=v;for(const r of radios())r.disabled=v;}
 function dirty(){return Boolean(info&&selected!==info.emailTheme.id);}
 function paint(){const c=info?.emailThemeChoices.find(c=>c.id===selected);if(c)for(const id of ['cover-letter-draft','proposed-cover-letter']){const e=doc.getElementById(id);if(e)e.style.backgroundColor=c.backgroundColor;}}
 function validate(d){if(!d?.emailTheme||typeof d.themeVersion!=='string'||!Array.isArray(d.emailThemeChoices)||!d.emailThemeChoices.some(c=>c.id===d.emailTheme.id&&c.backgroundColor===d.emailTheme.backgroundColor)||!d.emailThemeChoices.every(c=>typeof c.id==='string'&&/^#[a-f0-9]{6}$/i.test(c.backgroundColor)&&[1,3,5].every(i=>parseInt(c.backgroundColor.slice(i,i+2),16)>=230)))throw Error('Invalid theme metadata.');}
 function draw(){
  choices.replaceChildren();
  for(const c of info.emailThemeChoices){
   const label=doc.createElement('label'),input=doc.createElement('input'),swatch=doc.createElement('span'),text=doc.createElement('span');
   label.className='email-palette-choice';input.type='radio';input.name=group;input.value=c.id;input.checked=c.id===selected;input.disabled=disabled;
   swatch.className='email-palette-swatch';swatch.setAttribute('aria-hidden','true');swatch.style.backgroundColor=c.backgroundColor;
   text.textContent=PALETTE_LABELS[c.id]||c.id;label.title=c.backgroundColor;label.append(input,swatch,text);choices.append(label);
  }
  paint();
 }
 function accept(d){validate(d);if(pending||dirty())throw Error('Unsaved palette choice cannot be replaced.');info=d;selected=d.emailTheme.id;error=null;disabled=false;draw();status.textContent='Saved background loaded. Existing messages remain unchanged.';}
 async function save(){if(pending)return pending;if(!info)throw error||Error('Theme not loaded.');if(!dirty())return info;const id=selected;setDisabled(true);button.disabled=true;
 pending=(async()=>{try{const d=await request('/api/application-reviews/theme',{reviewId,expectedThemeVersion:info.themeVersion,themeChoice:id});validate(d);if(d.emailTheme.id!==id)throw Error('Saved palette differs from requested choice.');info=d;selected=id;error=null;disabled=false;draw();onSaved(d);status.textContent='Background saved for future email copies; existing messages unchanged.';return d;}catch(e){error=e;status.textContent='Background not saved: '+e.message;throw e;}finally{pending=null;setDisabled(false);button.disabled=false;}})();return pending;}
 choices.addEventListener('change',e=>{const value=e.target?.value;if(!info||disabled||!info.emailThemeChoices.some(c=>c.id===value))return;selected=value;error=null;paint();status.textContent='Unsaved background preview. Save before leaving.';});button.addEventListener('click',()=>save().catch(()=>{}));
 return {accept,save,refreshPreview:paint,pending:()=>dirty()||Boolean(pending),unavailable:()=>!info||Boolean(error),fail(e){error=e;status.textContent='Theme unavailable: '+e.message;}};
}
