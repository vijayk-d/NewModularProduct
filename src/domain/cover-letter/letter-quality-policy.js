// Shared pure policy; the browser serves this same module, not a duplicated copy.
export const QUALITY_VERSION='senior-cover-letter-quality-v1';
// A custom length travels as one mode string, e.g. "custom-450", so cost proof, confirmation and checks treat it like any mode.
export const CUSTOM_WORDS={minimum:150,maximum:700,step:25};
export const customLengthMode=words=>'custom-'+words;
function customWords(mode){const m=/^custom-(\d{3})$/.exec(mode);const n=m?Number(m[1]):NaN;return Number.isInteger(n)&&n>=CUSTOM_WORDS.minimum&&n<=CUSTOM_WORDS.maximum&&n%CUSTOM_WORDS.step===0?n:null;}
export function normalizeLengthMode(value='standard'){
 const mode=String(value||'standard').trim();
 if(!['standard','extended'].includes(mode)&&customWords(mode)===null){const e=new Error(`Choose Standard, Extended or a custom length of ${CUSTOM_WORDS.minimum}–${CUSTOM_WORDS.maximum} words in steps of ${CUSTOM_WORDS.step}.`);e.code='REFINEMENT_LENGTH_INVALID';e.statusCode=400;throw e;}return mode;
}
export function lengthPolicy(mode='standard',cap=500){
 mode=normalizeLengthMode(mode);const n=Number(cap),limit=Number.isInteger(n)?Math.max(120,n):500,custom=customWords(mode);
 if(custom!==null){const maximumWords=Math.min(custom,limit);return {version:QUALITY_VERSION,mode,label:`Custom ${maximumWords} words`,maximumWords,targetMinimum:Math.max(100,Math.round(maximumWords*0.85/5)*5)};}
 const maximumWords=Math.min(mode==='extended'?500:400,limit);
 return {version:QUALITY_VERSION,mode,label:mode==='extended'?'Extended strategic':'Standard senior',maximumWords,targetMinimum:Math.min(mode==='extended'?450:300,maximumWords)};
}
export function visibleLetterText(text='',{advertUrl=''}={}){
 let value=String(text||'').replace(/\r\n?/g,'\n'),url;
 try{const u=new URL(String(advertUrl));if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)url=u.href;}catch{}
 if(url){const m=/^I am applying for the [^\n]+ opportunity[^\n]*\nRole details:[ \t]*(https?:\/\/\S+)[ \t]*(?=\n|$)/m.exec(value);
 if(m&&m[1]===url){const start=m.index+m[0].indexOf('\nRole details:');value=value.slice(0,start)+value.slice(m.index+m[0].length);}}
 return value.trim();
}
export const letterWordCount=(text='',options={})=>visibleLetterText(text,options).split(/\s+/u).filter(Boolean).length;
export function assessLetterQuality(text='',{mode='standard',maxWords=500,advertUrl=''}={}){
 const policy=lengthPolicy(mode,maxWords),visible=visibleLetterText(text,{advertUrl}),wordCount=letterWordCount(visible);
 const paragraphs=visible.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean).filter(p=>!/^Dear\b/i.test(p)&&!/^(?:Warm regards|Kind regards|Best regards|Regards|Sincerely),?\s*\n/i.test(p)&&!/^(?:Job advert|Role details):/i.test(p));
 const warnings=[];
 if(wordCount<policy.targetMinimum)warnings.push('Below target: do not pad with filler or unsupported claims.');
 if(wordCount>policy.maximumWords)warnings.push(`Above the ${policy.maximumWords}-word ${policy.mode} limit. Revise or choose an appropriate mode explicitly; nothing is truncated.`);
 if(paragraphs.length<3||paragraphs.length>4)warnings.push('Aim for 3–4 narrative paragraphs; greeting and closing are separate.');
 return {...policy,wordCount,narrativeParagraphs:paragraphs.length,withinLimit:wordCount<=policy.maximumWords,warnings,pageFit:'not_checked'};
}
export function assertLetterLength(text,options={}){
 const q=assessLetterQuality(text,options);if(!q.withinLimit){const e=new Error(`The complete letter has ${q.wordCount} words; the selected ${q.mode} limit is ${q.maximumWords}. Retain for review; no automatic retry or truncation.`);e.code='REFINEMENT_LENGTH_EXCEEDED';e.statusCode=400;e.quality=q;throw e;}return q;
}
