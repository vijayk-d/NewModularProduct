import {createHash} from 'node:crypto';
import {snapshotMessage} from './outreach-message-snapshot.js';
import {currentReviewSubject,normalizeSubject} from './review-subject.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function reviewEditorState(review){return {bodyVersion:hash([review.currentDraftPlainText||'',review.currentDraftHtml||'']),subjectVersion:hash(currentReviewSubject(review)),subject:currentReviewSubject(review),revision:review._storageMeta?.revision||0};}
const bad=(m,s=400)=>{const e=new Error(m);e.statusCode=s;e.code=s===409?'REVIEW_STORE_CONFLICT':'REVIEW_SAVE_INVALID';throw e;};
export function saveApplicationReview(store,{reviewId,expectedBodyVersion,expectedSubjectVersion,bodyPlainText,bodyHtml,subject,saveSubject=true}={}){
 if(typeof reviewId!=='string'||!(/^[A-Za-z0-9_-]{1,100}$/).test(reviewId))bad('A valid saved application ID is required.');
 const review=store.get(reviewId);if(!review)bad('Saved application not found.',404);const state=reviewEditorState(review);
 if(!(/^[a-f0-9]{64}$/).test(String(expectedBodyVersion||''))||!(/^[a-f0-9]{64}$/).test(String(expectedSubjectVersion||'')))bad('Load the current saved application before editing.',409);
 const snapshot=snapshotMessage(bodyPlainText,bodyHtml,review.formData?.jobAdvertLink||'');
 const desiredSubject=saveSubject?normalizeSubject(subject):state.subject;
 if(expectedBodyVersion!==state.bodyVersion&&hash([snapshot.bodyPlainText,snapshot.bodyHtml||''])!==state.bodyVersion)bad('The letter changed in another tab. Your local edit was not saved; copy/review it before reloading.',409);
 if(saveSubject&&expectedSubjectVersion!==state.subjectVersion&&hash(desiredSubject)!==state.subjectVersion)bad('The subject changed elsewhere. Review it before saving.',409);
 store.set(reviewId,{...review,currentDraftPlainText:snapshot.bodyPlainText,currentDraftHtml:snapshot.bodyHtml,currentDraftSubject:desiredSubject});
 const saved=store.get(reviewId);return {saved:true,reviewId,durable:store.durable===true,...reviewEditorState(saved)};
}
