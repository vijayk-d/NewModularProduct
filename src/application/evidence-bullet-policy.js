// Local, zero-cost evidence selection and post-generation checks. Warnings only; never retries.
export const MAX_EVIDENCE_BULLETS=3;
const STOP=new Set('about above after again also and any are been being both but can could does doing each from have having into its more most other our ours over same should some such than that their them then there these they this those through under very was were what when where which while who will with within would your you'.split(' '));
const AI=/\b(?:AI|ML|LLM|GenAI|machine learning|artificial intelligence|copilot|agents?)\b/i;
const METRIC=/[£$€]\s?\d|\d[\d,.]*\s?(?:%|k\b|m\b|bn\b|x\b)|\d[\d,.]*\s?(?:per cent|percent)/i;
const WEAK=/\b(?:supported|supporting|helped|helping|contributed to|involved in|focused on|focusing on)\b/i;
const stems=t=>new Set(String(t||'').toLowerCase().match(/[a-z]{4,}/g)?.filter(w=>!STOP.has(w)).map(w=>w.slice(0,6))||[]);
const orgKey=s=>String(s.organisation||'').trim().toUpperCase();
export function selectScenariosForRole(scenarios=[],jobDescriptionText='',max=MAX_EVIDENCE_BULLETS){
 if(!Array.isArray(scenarios)||!scenarios.length)return {kept:[],dropped:[],warnings:[]};
 const jd=stems(jobDescriptionText),jdAi=AI.test(jobDescriptionText);
 const scored=scenarios.map((s,i)=>{let score=0;for(const w of stems(s.approvedWording))if(jd.has(w))score++;if(!jdAi&&AI.test(s.approvedWording))score-=5;if(METRIC.test(s.approvedWording))score+=1;return {s,i,score};})
  .sort((a,b)=>b.score-a.score||a.i-b.i);
 const kept=[],dropped=[],orgs=new Set();
 for(const x of scored){const k=orgKey(x.s);if(kept.length<max&&!(k&&orgs.has(k))){kept.push(x.s);if(k)orgs.add(k);}else dropped.push(x.s);}
 const warnings=dropped.length?['Evidence limited to '+kept.length+' role-relevant scenario bullet(s), one per organisation. Not used: '+dropped.map(s=>(s.organisation?s.organisation+': ':'')+s.approvedWording.slice(0,60)+(s.approvedWording.length>60?'…':'')).join(' | ')+'. Reselect if a different choice is preferred.']:[];
 return {kept,dropped,warnings};
}
export function evidenceBulletWarnings(draft='',scenarios=[]){
 const lines=String(draft).split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 const bullets=lines.filter(l=>l.startsWith('•')),plain=lines.filter(l=>/^At [A-Z][^,]{1,80},\s*I\b/.test(l));
 const w=[];
 if(plain.length)w.push(plain.length+' evidence line(s) lack the • bullet marker.');
 const ev=[...bullets,...plain];
 if(ev.length>MAX_EVIDENCE_BULLETS)w.push(ev.length+' evidence items; the letter allows '+MAX_EVIDENCE_BULLETS+'.');
 const orgOf=l=>(/^(?:•\s*)?At ([^,]{1,80}),/.exec(l)?.[1]||'').trim().toUpperCase();
 const seen=new Map();for(const l of ev){const o=orgOf(l);if(o)seen.set(o,(seen.get(o)||0)+1);}
 for(const [o,n]of seen)if(n>1)w.push(o+' appears in '+n+' evidence items; use one per organisation.');
 for(const l of ev){const o=orgOf(l)||l.slice(0,30);if(WEAK.test(l))w.push('Weak verb in '+o+' evidence ("'+WEAK.exec(l)[0]+'"); state the owned action or outcome if the source supports it.');
  if(!METRIC.test(l)&&scenarios.some(s=>s.organisation&&orgOf(l)&&orgKey(s)===orgOf(l)&&METRIC.test(s.approvedWording)))w.push(o+' evidence is activity-only although its approved scenario states a metric.');}
 return w;
}
