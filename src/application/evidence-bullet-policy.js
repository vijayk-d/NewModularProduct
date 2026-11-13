// Local, zero-cost evidence selection and post-generation checks. Warnings only; never retries.
export const MAX_EVIDENCE_BULLETS=3;
const STOP=new Set('about above after again also and any are been being both but can could does doing each from have having into its more most other our ours over same should some such than that their them then there these they this those through under very was were what when where which while who will with within would your you'.split(' '));
const AI=/\b(?:AI|ML|LLM|GenAI|machine learning|artificial intelligence|copilot|agents?)\b/i;
const METRIC=/[£$€]\s?\d|\d[\d,.]*\s?(?:%|k\b|m\b|bn\b|x\b)|\d[\d,.]*\s?(?:per cent|percent)/i;
const WEAK=/\b(?:supported|supporting|helped|helping|contributed to|involved in|focused on|focusing on)\b/i;
const stems=t=>new Set(String(t||'').toLowerCase().match(/[a-z]{4,}/g)?.filter(w=>!STOP.has(w)).map(w=>w.slice(0,6))||[]);
// Latest year in a free-text period; present/current sorts first, unknown last.
export function periodEnd(period=''){const t=String(period||'');if(/\b(?:present|current|now|to date|ongoing)\b/i.test(t))return 9999;const ys=(t.match(/\b(?:19|20)\d{2}\b/g)||[]).map(Number);return ys.length?Math.max(...ys):-1;}
// Same employer despite suffixes or a blank field: first significant word of organisation, else of the 'At X,' opening.
const ORG_SUFFIX=/^(?:THE|UK|LTD|LIMITED|PLC|GROUP|INC)$/;
export const orgKey=s=>{const raw=String(s?.organisation||'').trim()||(/^At ([^,]{1,80}),/i.exec(String(s?.approvedWording||'').trim())?.[1]||'');return raw.toUpperCase().replace(/[^A-Z0-9 ]+/g,' ').split(/\s+/).filter(w=>w&&!ORG_SUFFIX.test(w))[0]||'';};
export function selectScenariosForRole(scenarios=[],jobDescriptionText='',max=MAX_EVIDENCE_BULLETS){
 if(!Array.isArray(scenarios)||!scenarios.length)return {kept:[],dropped:[],warnings:[]};
 const jd=stems(jobDescriptionText),jdAi=AI.test(jobDescriptionText);
 const ends=[...new Set(scenarios.map(s=>periodEnd(s.period)).filter(e=>e>0))].sort((a,b)=>b-a);
 const scored=scenarios.map((s,i)=>{let score=0;const r=ends.indexOf(periodEnd(s.period));if(r===0)score+=2;else if(r===1)score+=1;for(const w of stems(s.approvedWording))if(jd.has(w))score++;if(!jdAi&&AI.test(s.approvedWording))score-=2;if(METRIC.test(s.approvedWording))score+=1;return {s,i,score};})
  .sort((a,b)=>b.score-a.score||periodEnd(b.s.period)-periodEnd(a.s.period)||a.i-b.i);
 const kept=[],dropped=[],orgs=new Set();
 for(const x of scored){const k=orgKey(x.s);if(kept.length<max&&!(k&&orgs.has(k))){kept.push(x.s);if(k)orgs.add(k);}else dropped.push(x.s);}
 kept.sort((x,y)=>periodEnd(y.period)-periodEnd(x.period));
 const warnings=dropped.length?['Evidence limited to '+kept.length+' role-relevant scenario bullet(s), one per organisation. Not used: '+dropped.map(s=>(s.organisation?s.organisation+': ':'')+s.approvedWording.slice(0,60)+(s.approvedWording.length>60?'…':'')).join(' | ')+'. Reselect if a different choice is preferred.']:[];
 return {kept,dropped,warnings};
}
export function evidenceBulletWarnings(draft='',scenarios=[],evidenceText=''){
 const lines=String(draft).split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 const bullets=lines.filter(l=>l.startsWith('•')),plain=lines.filter(l=>/^At [A-Z][^,]{1,80},\s*I\b/.test(l));
 const w=[];
 if(plain.length)w.push(plain.length+' evidence line(s) lack the • bullet marker.');
 const ev=[...bullets,...plain];
 if(ev.length>MAX_EVIDENCE_BULLETS)w.push(ev.length+' evidence items; the letter allows '+MAX_EVIDENCE_BULLETS+'.');
 const orgOf=l=>orgKey({organisation:(/^(?:•\s*)?At ([^,]{1,80}),/.exec(l)?.[1]||'')});
 const seen=new Map();for(const l of ev){const o=orgOf(l);if(o)seen.set(o,(seen.get(o)||0)+1);}
 for(const [o,n]of seen)if(n>1)w.push(o+' appears in '+n+' evidence items; use one per organisation.');
 for(const l of ev){const o=orgOf(l)||l.slice(0,30);if(WEAK.test(l))w.push('Weak verb in '+o+' evidence ("'+WEAK.exec(l)[0]+'"); state the owned action or outcome if the source supports it.');
  if(!METRIC.test(l)&&scenarios.some(s=>s.organisation&&orgOf(l)&&orgKey(s)===orgOf(l)&&METRIC.test(s.approvedWording)))w.push(o+' evidence is activity-only although its approved scenario states a metric.');}
 const ps=/\bmy (?:[\w-]+ )?(?:public[- ]sector|government)\b|\b(?:public[- ]sector|government) (?:delivery )?(?:background|experience)\b/i;
 if(ps.test(draft)&&!/\b(?:public[- ]sector|government|council|NHS|HMRC|DWP|civil service|ministry)\b/i.test([evidenceText,...scenarios.map(s=>s.approvedWording)].join(' ')))w.push('The letter claims public-sector or government experience that the supplied evidence does not state; remove it or add evidence.');
 return w;
}
export function polishParameters({request={},draft='',quality={},selection={kept:[],dropped:[]},toneLabel=''}){
 const lines=String(draft).split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 const ev=lines.filter(l=>l.startsWith('•')||/^At [A-Z][^,]{1,80},\s*I\b/.test(l));
 const orgs=ev.map(l=>(/^(?:•\s*)?At ([^,]{1,80}),/.exec(l)?.[1]||'?').trim());
 return {
  tone:toneLabel||request.letterTone||'professional',
  lengthMode:quality.mode||request.letterLengthMode||'standard',
  words:quality.wordCount??null,
  targetWords:quality.targetMinimum!=null&&quality.maximumWords!=null?quality.targetMinimum+'–'+quality.maximumWords:'',
  characters:String(draft).length,
  narrativeParagraphs:quality.narrativeParagraphs??null,
  evidenceItems:ev.length,
  bulletedItems:ev.filter(l=>l.startsWith('•')).length,
  itemsWithMetric:ev.filter(l=>METRIC.test(l)).length,
  evidenceOrder:orgs.join(' → '),
  scenariosSelected:(selection.kept?.length||0)+(selection.dropped?.length||0),
  scenariosUsed:selection.kept?.length||0,
  jobMentionsAi:AI.test(String(request.jobDescriptionText||'')),
  model:request.polishingModel||'default',
  webSearch:request.webSearchEnabled!==false,
  writingExamples:Array.isArray(request.writingReferenceExamples)?request.writingReferenceExamples.length:0,
  researchPoints:Array.isArray(request.selectedResearchPoints)?request.selectedResearchPoints.length:0,
  explicitAchievements:request.achievementSelectionExplicit===true,
  advertiserRelationship:request.advertiserRelationship||'direct-employer'
 };
}
// Deterministic formatting only: prefix '• ' to unbulleted 'At ORG, I …' evidence lines. Wording unchanged.
export function bulletEvidenceLines(draft=''){return String(draft).split('\n').map(l=>/^At [A-Z][^,]{1,80},\s*I\b/.test(l.trim())?'• '+l.trim():l).join('\n');}
