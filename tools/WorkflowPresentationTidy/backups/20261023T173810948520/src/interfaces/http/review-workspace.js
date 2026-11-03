import {enhanceWorkspaceV2} from './workspace-review-v2.js';
import {createLinkedInIcon,historyDate} from './contact-history-display.js';
// review-ui-v1: presentation only; no fetch, API actions or stored-data rewrites.
export function actionStyle(button){
 const label=(button.textContent||'').trim(),action=button.closest?.('form')?.getAttribute('action')||'';
 if(/^(?:Remove|Clear|Delete|Permanently delete)\b/i.test(label))return 'danger';
 if(/^Send again\b/.test(label))return 'repeat';
 if(/^(?:Draft|Send|Retry draft|Retry send|Retry)\b/.test(label)||button.dataset?.sendQueueId||button.dataset?.directQueueId)return 'email';
 if((['/organisation-research','/cover-letter-refinement'].includes(action)&&button.type==='submit')||/^(?:Research organisation|Polish cover letter)\b/.test(label))return 'api';
 if(label==='Export pack'||(action==='/review-cv-selection'&&button.type==='submit'))return 'primary';
 return 'secondary';
}
export function historyAction(value){return ({send:'Sent email',send_draft:'Sent draft',send_again:'Repeat send'})[value]||'Other action';}
export function historyTime(value,{locale='en-GB',timeZone}={}){const date=new Date(value);if(!value||Number.isNaN(date.getTime()))return 'Not recorded';return new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short',...(timeZone?{timeZone}:{})}).format(date);}
export function renderHistoryRows(body,items,doc=body.ownerDocument){
 body.replaceChildren();
 for(const item of items){const row=body.insertRow();
  const cell=(label)=>{const c=row.insertCell();c.dataset.label=label;return c;};
  const recipient=cell('Recipient'),name=doc.createElement('strong'),email=doc.createElement('span');name.textContent=item.fullName||'Unnamed contact';email.textContent=item.email||'';const line=doc.createElement('div');line.className='history-recipient-name';line.appendChild(name);const profile=createLinkedInIcon(item.linkedinUrl,item.fullName||'contact',doc);if(profile)line.appendChild(profile);recipient.append(line,email);
  const subject=cell('Subject');subject.textContent=item.subject||'';subject.className='history-subject';subject.title=item.subject||'';subject.tabIndex=0;
  const action=cell('Action'),badge=doc.createElement('span');badge.className=item.action==='send_again'?'history-badge history-badge--repeat':'history-badge';badge.textContent=historyAction(item.action);action.appendChild(badge);
  const sent=cell('Sent'),time=doc.createElement('time');time.textContent=historyDate(item.sentAt);time.title=historyTime(item.sentAt);if(item.sentAt)time.setAttribute('datetime',item.sentAt);sent.appendChild(time);
  const details=doc.createElement('details'),summary=doc.createElement('summary');summary.textContent='Details';details.appendChild(summary);
  for(const [label,value] of [['Gmail message ID',item.messageId],['UTC timestamp',item.sentAt],['Recorded action',item.action],['LinkedIn profile captured with send',item.linkedinUrl||'Not recorded']]){const p=doc.createElement('p'),title=doc.createElement('strong'),text=doc.createElement('code');title.textContent=label+': ';text.textContent=value||'Not recorded';p.append(title,text);details.appendChild(p);}
  if(item.messageId){const copy=doc.createElement('button');copy.type='button';copy.textContent='Copy message ID';copy.addEventListener('click',async()=>{try{await doc.defaultView.navigator.clipboard.writeText(item.messageId);copy.textContent='Copied';}catch{copy.textContent='Select the ID above to copy';}});details.appendChild(copy);}
  cell('Details').appendChild(details);
 }
 if(!items.length){const row=body.insertRow(),td=row.insertCell();td.colSpan=5;td.textContent='No matching recorded sends.';}
}
export function bindSubject(field,doc){
 if(field.dataset.uiSubjectBound)return;field.dataset.uiSubjectBound='true';
 const grow=()=>{field.style.height='auto';field.style.height=Math.max(field.scrollHeight||0,52)+'px';};
 const explain=()=>{field.setCustomValidity?.(/[\r\n]/.test(field.value)?'The email subject must be a single line.':'');const message=doc.getElementById?.('current-subject-status');if(message)message.textContent='Subject stays a single line; visual wrapping is allowed. Paste single-line text.';};
 field.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();explain();}});
 field.addEventListener('beforeinput',event=>{if(['insertParagraph','insertLineBreak'].includes(event.inputType)){event.preventDefault();explain();}});
 field.addEventListener('paste',event=>{if(/[\r\n]/.test(event.clipboardData?.getData('text/plain')||'')){event.preventDefault();explain();}});
 field.addEventListener('input',()=>{field.setCustomValidity?.(/[\r\n]/.test(field.value)?'Subject must not contain newline characters.':'');grow();});
 doc.defaultView?.addEventListener('resize',grow);grow();
}
export function enhanceReview(doc=document){
 if(!doc.head||!doc.querySelector)return;
 if(!doc.querySelector('link[href="/review-workspace.css"]')){const css=doc.createElement('link');css.rel='stylesheet';css.href='/review-workspace.css';doc.head.appendChild(css);}
 doc.documentElement?.classList.add('review-workspace');
 for(const field of doc.querySelectorAll('textarea.subject-editor-input'))bindSubject(field,doc);
 for(const button of doc.querySelectorAll('button,input[type="submit"]'))button.dataset.uiAction=actionStyle(button);
 const main=doc.querySelector('main'),current=doc.querySelector('.panel--current'),decision=doc.querySelector('.panel--decision');if(current&&decision&&current.parentElement===decision.parentElement&&!doc.documentElement?.dataset?.uiEditorPromoted){decision.before(current);if(doc.documentElement)doc.documentElement.dataset.uiEditorPromoted='true';}
 if(main&&!doc.querySelector('.workspace-nav')){const nav=doc.createElement('nav');nav.className='workspace-nav';nav.setAttribute('aria-label','Application workspaces');for(const [href,label] of [['/','New application'],['/applications','Saved applications'],['/outreach-queue','Outreach queue']]){const a=doc.createElement('a');a.href=href;a.textContent=label;if(doc.defaultView?.location.pathname===href||(href==='/applications'&&doc.defaultView?.location.pathname.startsWith('/applications/')))a.setAttribute('aria-current','page');nav.appendChild(a);}main.prepend(nav);}
 enhanceWorkspaceV2(doc);
}
if(typeof document!=='undefined'){
 const boot=()=>{enhanceReview(document);let queued=false;const Observer=document.defaultView?.MutationObserver;if(Observer)new Observer(records=>{if(queued||!records.some(r=>!r.target.closest?.('[contenteditable="true"]')))return;queued=true;(document.defaultView.requestAnimationFrame?.bind(document.defaultView)||setTimeout)(()=>{queued=false;enhanceReview(document);});}).observe(document.body,{childList:true,subtree:true});};
 const safeBoot=()=>{try{boot();}catch(error){console.error('Review UI enhancement failed; existing application modules may continue.',error);}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',safeBoot,{once:true});else safeBoot();
}
