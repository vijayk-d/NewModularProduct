// The relative import resolves both on disk and via the server's matching /domain route.
import {assessLetterQuality,lengthPolicy,CUSTOM_WORDS,customLengthMode} from '../../domain/cover-letter/letter-quality-policy.js';
// Keeps the Custom radio's value ("custom-450") in step with its word box and selects it when the box is used.
export function attachCustomLengthControl(doc=document){
 const radio=doc.querySelector('input[data-custom-length]'),box=doc.querySelector('input[data-custom-length-words]'),range=doc.querySelector('[data-custom-length-range]');
 if(!radio||!box||box.dataset.customAttached==='true')return;box.dataset.customAttached='true';
 const cap=Number(box.max)||CUSTOM_WORDS.maximum;
 const apply=()=>{let n=Math.round(Number(box.value)/CUSTOM_WORDS.step)*CUSTOM_WORDS.step;if(!Number.isFinite(n)||n<CUSTOM_WORDS.minimum)n=CUSTOM_WORDS.minimum;if(n>cap)n=cap;box.value=String(n);
  const mode=customLengthMode(n),changed=radio.value!==mode||!radio.checked;radio.value=mode;radio.checked=true;
  const p=lengthPolicy(mode,cap);if(range)range.textContent=p.targetMinimum+'–'+p.maximumWords;
  if(changed)radio.dispatchEvent(new Event('change',{bubbles:true}));};
 box.addEventListener('change',apply);box.addEventListener('focus',()=>{if(!radio.checked){radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}));}});
}
export function attachLetterQualityControls(doc=document){
 for(const status of doc.querySelectorAll('[data-letter-quality-for]')){
  if(status.dataset.qualityAttached==='true')continue;const editor=doc.getElementById(status.dataset.letterQualityFor);if(!editor)continue;
  status.dataset.qualityAttached='true';
  const refresh=()=>{const q=assessLetterQuality(editor.innerText??editor.textContent,{mode:status.dataset.qualityMode,maxWords:Number(status.dataset.qualityCap),advertUrl:status.dataset.advertUrl});status.textContent=`${q.wordCount} words · ${q.label} target ${q.targetMinimum}–${q.maximumWords} · ${q.narrativeParagraphs} narrative paragraphs. ${q.warnings.join(' ')} Page fit not checked. Subject and Gmail signature excluded.`;};
  editor.addEventListener('input',refresh);const O=doc.defaultView?.MutationObserver;if(O)new O(refresh).observe(editor,{subtree:true,childList:true,characterData:true});refresh();
 }
}
if(typeof document!=='undefined'){const boot=()=>{attachLetterQualityControls(document);attachCustomLengthControl(document);};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();}
