// The relative import resolves both on disk and via the server's matching /domain route.
import {assessLetterQuality} from '../../domain/cover-letter/letter-quality-policy.js';
export function attachLetterQualityControls(doc=document){
 for(const status of doc.querySelectorAll('[data-letter-quality-for]')){
  if(status.dataset.qualityAttached==='true')continue;const editor=doc.getElementById(status.dataset.letterQualityFor);if(!editor)continue;
  status.dataset.qualityAttached='true';
  const refresh=()=>{const q=assessLetterQuality(editor.innerText??editor.textContent,{mode:status.dataset.qualityMode,maxWords:Number(status.dataset.qualityCap),advertUrl:status.dataset.advertUrl});status.textContent=`${q.wordCount} words · ${q.mode} target ${q.targetMinimum}–${q.maximumWords} · ${q.narrativeParagraphs} narrative paragraphs. ${q.warnings.join(' ')} Page fit not checked. Subject and Gmail signature excluded.`;};
  editor.addEventListener('input',refresh);const O=doc.defaultView?.MutationObserver;if(O)new O(refresh).observe(editor,{subtree:true,childList:true,characterData:true});refresh();
 }
}
if(typeof document!=='undefined'){const boot=()=>attachLetterQualityControls(document);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();}
