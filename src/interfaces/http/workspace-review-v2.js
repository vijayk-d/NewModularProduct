// workspace-v2: presentation and local UI preferences only; no API calls, submits or application-record/credential writes.
const labels=[['vacancy','Vacancy details'],['email','Email domain'],['cv','CV selection'],['tailored','Tailored CV'],['questions','Application questions'],['achievements','Achievements'],['research','Research'],['polishing','Polishing'],['proposal','Proposal'],['letter','Current letter'],['contacts','Linked/imported contacts'],['organisation','Organisation contacts'],['queue','Outreach queue'],['history','Sent history'],['outcome','Outcome'],['import','Imported advert']];
const pathFor={questions:'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',outcome:'M5 21V4 M5 4h11l-2 4 2 4H5',vacancy:'M4 6h16v14H4z M8 6V3h8v3',email:'M3 5h18v14H3z M3 6l9 7 9-7',cv:'M6 3h9l4 4v14H6z M9 12h7 M9 16h7',tailored:'M6 3h9l4 4v14H6z M9 17l5-5 2 2-5 5H9z',achievements:'M12 3l3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1z',research:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',polishing:'M4 20l5-1L20 8l-4-4L5 15z M14 6l4 4',proposal:'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5',letter:'M4 4h16v16H4z M7 8h10 M7 12h10 M7 16h7',contacts:'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M2 21v-3a7 7 0 0 1 14 0v3 M18 7a3 3 0 0 1 0 6 M19 16a5 5 0 0 1 3 5',organisation:'M4 21V3h16v18 M8 7h2 M14 7h2 M8 11h2 M14 11h2 M10 21v-5h4v5',queue:'M5 5h16 M5 12h16 M5 19h16 M2 5h0 M2 12h0 M2 19h0',history:'M3 12a9 9 0 1 0 3-7 M3 3v6h6 M12 7v6l4 2',import:'M12 3v12 M7 10l5 5 5-5 M4 15v6h16v-6'};
function icon(key,doc){const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');for(const [k,v]of Object.entries({viewBox:'0 0 24 24',width:'20',height:'20',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(k,v);const p=doc.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',pathFor[key]||pathFor.letter);svg.appendChild(p);return svg;}
function storage(doc,key,value){try{if(value===undefined)return JSON.parse(doc.defaultView.localStorage.getItem(key)||'null');doc.defaultView.localStorage.setItem(key,JSON.stringify(value));}catch{}return null;}
function eventFor(doc,name){const E=doc.defaultView?.Event||globalThis.Event;return new E(name,{bubbles:true});}
function node(doc,tag,text){const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
function moveBefore(element,anchor){if(element&&anchor&&element!==anchor&&anchor.previousElementSibling!==element)anchor.before(element);}
export function mountChoiceCards(select,{title,kind,reviewId='',doc=select.ownerDocument}={}){
 if(!select)return null;
 let state=select.__workspaceChoice;
 if(!state){
  const box=node(doc,'fieldset');box.className='workspace-choice-cards';box.setAttribute('data-choice-kind',kind);box.appendChild(node(doc,'legend',title));const options=node(doc,'div');options.className='workspace-choice-options';box.appendChild(options);select.before(box);
  const old=doc.querySelector('label[for="'+select.id+'"]');if(old){old.hidden=true;old.dataset.workspaceOldLabel='true';}
  select.hidden=true;select.dataset.workspaceChoiceCarrier='true';
  state={box,options,signature:'',base:select.value,key:'workspace-choice-v2:'+reviewId+':'+kind};select.__workspaceChoice=state;
  const saved=storage(doc,state.key);if(saved?.base===state.base&&[...select.options].some(o=>o.value===saved.value)){select.value=saved.value;if(kind==='model')select.dataset.selectionExplicit='true';}
  const remember=()=>storage(doc,state.key,{base:state.base,value:select.value});
  select.addEventListener('change',()=>{remember();mountChoiceCards(select,{title,kind,reviewId,doc});});
  select.addEventListener('polishing-options-updated',()=>{if(state.rememberNext){remember();state.rememberNext=false;}mountChoiceCards(select,{title,kind,reviewId,doc});});
  select.closest('form')?.querySelector('[data-polishing-cheapest]')?.addEventListener('click',()=>{state.rememberNext=true;});
 }
 const signature=[...select.options].map(o=>o.value+'|'+o.textContent).join('\n');
 if(signature!==state.signature){
  const focusedValue=state.options.contains?.(doc.activeElement)?doc.activeElement.value:null;
  state.signature=signature;state.options.replaceChildren();
  for(const option of select.options){const label=node(doc,'label');label.className='workspace-choice-card';const radio=node(doc,'input');radio.type='radio';radio.name='workspace-'+kind+'-choice';radio.value=option.value;radio.disabled=option.disabled;const parts=String(option.textContent||option.label||option.value).split(' — ');const text=node(doc,'span');text.appendChild(node(doc,'strong',parts.shift()));if(parts.length)text.appendChild(node(doc,'small',parts.join(' — ')));label.append(radio,text);
   radio.addEventListener('change',()=>{if(!radio.checked)return;select.value=radio.value;if(kind==='model')select.dataset.selectionExplicit='true';select.dispatchEvent(eventFor(doc,'change'));});state.options.appendChild(label);
  }
  if(focusedValue!==null)for(const radio of state.options.querySelectorAll('input[type="radio"]'))if(radio.value===focusedValue)radio.focus?.({preventScroll:true});
 }
 for(const radio of state.options.querySelectorAll('input[type="radio"]'))radio.checked=radio.value===select.value;
 return state.box;
}
function wrapVacancy(doc){
 const vacancy=doc.querySelector('.panel--vacancy'),email=doc.getElementById('email-domain-resolution');
 if(vacancy&&email&&!vacancy.parentElement?.classList.contains('workspace-vacancy-row')){const row=node(doc,'div');row.className='workspace-vacancy-row';vacancy.before(row);row.append(vacancy,email);}
 if(vacancy&&!vacancy.querySelector('.workspace-vacancy-fields')){const ps=[...vacancy.children].filter(e=>e.tagName==='P');if(ps.length){const grid=node(doc,'div');grid.className='workspace-vacancy-fields';ps[0].before(grid);for(const p of ps)grid.appendChild(p);}}
 if(vacancy)for(const a of vacancy.querySelectorAll('.workspace-vacancy-fields a[href]'))if(!a.title)a.title=a.textContent.trim()||a.href;
 const ranking=doc.querySelector('.cv-ranking-summary');if(ranking&&!ranking.dataset.workspaceCompact){ranking.dataset.workspaceCompact='true';const ps=[...ranking.children].filter(e=>e.tagName==='P');if(ps.length){const row=node(doc,'div');row.className='workspace-rating-line';for(const p of ps)row.appendChild(p);ranking.appendChild(row);}ranking.open=true;}
}
function moveActions(doc){
 const current=doc.querySelector('.panel--current'),bar=current?.querySelector('.application-save-bar'),del=current?.querySelector('[data-delete-saved-review]');
 if(bar&&del){const save=[...bar.querySelectorAll('button')].find(b=>/^Save application$/i.test(b.textContent.trim()));if(save&&save.nextElementSibling!==del)save.after(del);if(del.textContent!=='Delete application')del.textContent='Delete application';}
 const linked=doc.querySelector('.linked-imported-contacts-body')?.closest('table');if(linked){const scope=linked.closest('section'),toolbar=scope?.querySelector('.linked-contact-actions:not(.organisation-contact-actions)');moveBefore(toolbar,linked.closest('.contact-edit-scroll')||linked);if(toolbar)toolbar.classList.add('workspace-contact-toolbar');}
 const available=doc.querySelector('.available-imported-contacts-body')?.closest('table'),form=available?.closest('form');
 if(available&&form){let toolbar=form.querySelector('.workspace-available-toolbar');if(!toolbar){toolbar=node(doc,'div');toolbar.className='workspace-available-toolbar';(available.closest('.contact-edit-scroll')||available).before(toolbar);}const submit=form.querySelector('button[type="submit"]');if(submit&&submit.parentElement!==toolbar)toolbar.appendChild(submit);const actions=form.closest('section')?.querySelector('.contact-linking-actions');if(actions&&actions.parentElement!==toolbar)toolbar.appendChild(actions);}
}
function importedLayout(doc){
 for(const section of doc.querySelectorAll('main section')){
  const heading=[...section.children].find(e=>e.tagName==='H2');if(!heading||heading.textContent.trim()!=='Imported LinkedIn advert')continue;
  section.classList.add('workspace-imported-advert');
  const preview=[...section.children].find(e=>e.tagName==='DIV');if(preview&&!preview.classList.contains('workspace-imported-grid'))preview.classList.add('workspace-imported-grid');
 }
}
function sections(doc){
 const main=doc.querySelector('main');if(!main)return [];
 const findTitle=text=>[...main.querySelectorAll('h2')].find(e=>e.textContent.trim()===text)?.closest('section');
 const nodes={vacancy:doc.querySelector('.panel--vacancy'),email:doc.getElementById('email-domain-resolution'),cv:doc.querySelector('.panel--decision'),tailored:doc.getElementById('tailored-cv'),questions:doc.getElementById('application-questions'),outcome:doc.getElementById('application-outcome'),achievements:doc.querySelector('.achievement-selection-summary')||doc.getElementById('achievement-preparation'),research:doc.querySelector('.panel--research'),polishing:doc.querySelector('.refinement-panel'),proposal:doc.querySelector('.refinement-proposal'),letter:doc.querySelector('.panel--current'),contacts:doc.querySelector('form[action="/recruiter-contacts/link"]')?.closest('section'),organisation:doc.querySelector('.organisation-contact-summary'),queue:doc.querySelector('.outreach-queue-section'),history:doc.querySelector('.sent-history-table')?.closest('section'),import:findTitle('Imported LinkedIn advert')};
 return labels.map(([key,label])=>({key,label,target:nodes[key]})).filter(x=>x.target&&!x.target.hidden);
}
// The control each rail link lands on: the section's main button or field, not just the section heading.
export const SECTION_ACTIONS=Object.freeze({
 vacancy:['[name="jobTitle"]','input','textarea'],
 email:['.find-email-domain-button','#email-domain-input'],
 cv:[{text:'Apply CV selection'},'input[name="selectedCvRoleCode"]:checked','input[name="selectedCvRoleCode"]'],
 tailored:[{text:'Draft tailored CV'}],
 questions:['#question-text'],
 outcome:['#outcome-choice'],
 achievements:['input[type="checkbox"]','button'],
 research:[{text:'Research organisation'}],
 polishing:[{text:'Polish cover letter'}],
 proposal:[{text:'Use proposal as current draft'}],
 letter:['#cover-letter-draft','[contenteditable="true"]'],
 contacts:[{text:'Refresh contacts'},{text:'Link selected contacts'}],
 organisation:['button','a[href]'],
 queue:['button','a[href]'],
 history:['a[href]','button'],
 import:['button','a[href]']
});
const visible=e=>Boolean(e)&&!e.disabled&&!e.hidden&&!e.closest('[hidden]')&&(e.offsetParent!==null||e.getClientRects?.().length>0);
export function actionFor(key,target){
 for(const rule of SECTION_ACTIONS[key]||[]){
  const found=typeof rule==='string'?[...target.querySelectorAll(rule)]:[...target.querySelectorAll('button,input[type="submit"],a[href]')].filter(e=>(e.textContent||e.value||'').trim()===rule.text);
  const hit=found.find(visible);if(hit)return hit;
 }
 return null;
}
// Scrolls to the section's main control, focuses it and highlights it briefly; falls back to the section itself.
const openCollapsed=element=>{for(const d of element.matches?.('details:not([open])')?[element]:[])d.open=true;for(const d of element.querySelectorAll?.('details.questions-panel:not([open])')||[])d.open=true;let up=element.parentElement?.closest?.('details:not([open])');while(up){up.open=true;up=up.parentElement?.closest('details:not([open])');}};
export function focusSectionAction(key,target,doc=target.ownerDocument){
 openCollapsed(target);
 const control=actionFor(key,target);
 const goal=control||target;
 if(!control&&!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
 try{goal.scrollIntoView({block:control?'center':'start',behavior:'smooth'});}catch{goal.scrollIntoView?.();}
 try{goal.focus({preventScroll:true});}catch{goal.focus?.();}
 goal.classList.add('workspace-focus-flash');
 (doc.defaultView||globalThis).setTimeout(()=>goal.classList.remove('workspace-focus-flash'),1600);
 return goal;
}
// Sub-sections shown under the current section while the rail is widened. Each lands on its own control.
const FOCUSABLE='input:checked,input:not([type="hidden"]),select,textarea,button,[contenteditable="true"],a[href]';
const firstControl=root=>[...(root.matches?.(FOCUSABLE)?[root]:[]),...root.querySelectorAll(FOCUSABLE)].find(visible)||null;
const bySelector=(target,list)=>list.map(([label,selector,wrap])=>{const found=target.querySelector(selector);return found?{label,element:wrap?found.closest(wrap)||found:found}:null;}).filter(Boolean);
export const SUBSECTIONS=Object.freeze({
 polishing:t=>bySelector(t,[['Model','[data-choice-kind="model"]'],['Tone','[data-choice-kind="tone"]'],['Length','[data-choice-kind="length"]'],['Relationship','[data-advertiser-relationship]'],['Scenarios','[data-scenario-choices]','fieldset'],['Organisation values','.organisation-values-choices'],['Instructions','#personal-polishing-instructions']]),
 letter:t=>bySelector(t,[['Subject','#current-cover-letter-subject'],['Letter','#cover-letter-draft']]),
 contacts:t=>bySelector(t,[['Linked','.linked-imported-contacts-body','table'],['Available','.available-imported-contacts-body','table']]),
 tailored:t=>[...t.querySelectorAll('h3.tailored-step')].filter(h=>!h.closest('[hidden]')).map(h=>({label:h.textContent.replace(/^\d+\.\s*/,'').trim(),element:h}))
});
// The control a sub-section lands on: the element itself if it is a control, else the first control inside it, else the first one after a heading.
export function subsectionControl(element){
 if(element.matches?.('h1,h2,h3,h4')){let next=element.nextElementSibling;while(next&&!next.matches('h1,h2,h3,h4')){const c=firstControl(next);if(c)return c;next=next.nextElementSibling;}return null;}
 return firstControl(element);
}
export function focusSubsection(element,doc=element.ownerDocument){
 openCollapsed(element);
 const control=subsectionControl(element),goal=control||element;
 if(!control&&!element.hasAttribute('tabindex'))element.setAttribute('tabindex','-1');
 try{(control||element).scrollIntoView({block:'center',behavior:'smooth'});}catch{goal.scrollIntoView?.();}
 try{goal.focus({preventScroll:true});}catch{goal.focus?.();}
 goal.classList.add('workspace-focus-flash');
 (doc.defaultView||globalThis).setTimeout(()=>goal.classList.remove('workspace-focus-flash'),1600);
 return goal;
}
const SECTION_GROUPS={vacancy:'Role',import:'Role',email:'Role',cv:'Prepare',tailored:'Prepare',achievements:'Prepare',research:'Prepare',questions:'Prepare',polishing:'Letter',proposal:'Letter',letter:'Letter',outcome:'Outreach',contacts:'Outreach',organisation:'Outreach',queue:'Outreach',history:'Outreach'};
// Sub-sections show for the section you are in.
function markCurrent(nav){for(const box of nav.querySelectorAll('.workspace-subsections'))box.dataset.current=String(Boolean(nav.querySelector('a[data-section-key="'+box.dataset.parent+'"][aria-current]')));}
function sectionNav(doc){
 const entries=sections(doc),main=doc.querySelector('main');if(!entries.length||!main)return;
 let nav=doc.querySelector('.workspace-section-nav');if(!nav){nav=node(doc,'nav');nav.className='workspace-section-nav';nav.setAttribute('aria-label','Application sections');main.before(nav);}
 for(const x of entries){if(!x.target.id)x.target.id='workspace-section-'+x.key;x.target.classList.add('workspace-section-target');x.subs=(SUBSECTIONS[x.key]?.(x.target)||[]).filter(s=>s.element&&!s.element.closest('[hidden]'));x.subs.forEach((s,i)=>{if(!s.element.id)s.element.id='workspace-sub-'+x.key+'-'+i;});}
 const signature=entries.map(x=>x.target.id+':'+x.label+'['+x.subs.map(s=>s.element.id+'='+s.label).join(',')+']').join('|');
 if(nav.dataset.signature!==signature){nav.dataset.signature=signature;nav.replaceChildren();let group='';for(const x of entries){const g=SECTION_GROUPS[x.key]||'More';if(g!==group){group=g;const h=node(doc,'span',g);h.className='workspace-section-group';h.setAttribute('aria-hidden','true');nav.appendChild(h);}const a=node(doc,'a');a.href='#'+x.target.id;a.title=x.label;a.setAttribute('aria-label',x.label);a.dataset.sectionKey=x.key;a.append(icon(x.key,doc),node(doc,'span',x.label));a.addEventListener('click',event=>{const target=doc.getElementById(x.target.id);if(!target)return;event.preventDefault();try{doc.defaultView?.history?.replaceState(null,'','#'+x.target.id);}catch{}focusSectionAction(x.key,target,doc);});nav.appendChild(a);if(x.subs.length){const box=node(doc,'div');box.className='workspace-subsections';box.dataset.parent=x.key;box.dataset.current='false';for(const sub of x.subs){const s=node(doc,'a',sub.label);s.className='workspace-subsection';s.href='#'+sub.element.id;s.setAttribute('aria-label',x.label+': '+sub.label);s.addEventListener('click',event=>{const el=doc.getElementById(sub.element.id);if(!el)return;event.preventDefault();try{doc.defaultView?.history?.replaceState(null,'','#'+sub.element.id);}catch{}focusSubsection(el,doc);});box.appendChild(s);}nav.appendChild(box);}}markCurrent(nav);}
 if(!doc.__workspaceIntersection&&doc.defaultView?.IntersectionObserver){doc.__workspaceIntersection=new doc.defaultView.IntersectionObserver(changes=>{for(const item of changes){if(!item.isIntersecting)continue;for(const a of nav.querySelectorAll('a[data-section-key]')){if(a.hash==='#'+item.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');}markCurrent(nav);}},{rootMargin:'-5% 0px -70% 0px'});doc.__workspaceObserved=new Set();}
 if(doc.__workspaceIntersection)for(const x of entries)if(!doc.__workspaceObserved.has(x.target)){doc.__workspaceObserved.add(x.target);doc.__workspaceIntersection.observe(x.target);}
}
export function enhanceWorkspaceV2(doc=document){
 if(!doc.querySelector||!doc.createElement||!doc.getElementById||!doc.querySelectorAll)return;
 wrapVacancy(doc);moveActions(doc);importedLayout(doc);
 const reviewId=doc.querySelector('input[name="reviewId"]')?.value||doc.defaultView?.location.pathname||'preparation';
 const model=doc.querySelector('select[name="polishingModel"]');if(model)mountChoiceCards(model,{title:'Polishing model',kind:'model',reviewId,doc});
 const tone=doc.querySelector('select[name="letterTone"]');if(tone)mountChoiceCards(tone,{title:'Letter tone',kind:'tone',reviewId,doc});
 sectionNav(doc);
 // Sections and sub-sections added later (Tailored CV steps, Outcome, Application questions) join the rail.
 const main=doc.querySelector('main'),win=doc.defaultView;
 if(main&&win?.MutationObserver&&!doc.__workspaceRailObserver){let timer=0;doc.__workspaceRailObserver=new win.MutationObserver(()=>{win.clearTimeout(timer);timer=win.setTimeout(()=>{try{sectionNav(doc);}catch{}},150);});doc.__workspaceRailObserver.observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});}
}
