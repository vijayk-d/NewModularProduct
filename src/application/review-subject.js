export const MAX_SUBJECT_LENGTH = 300;
export function normalizeSubject(value) {
  if(typeof value!=='string' || /[\u0000-\u001f\u007f]/.test(value) || !value.trim() || value.trim().length>MAX_SUBJECT_LENGTH) {
    const error=new Error('The application needs a valid single-line subject of at most 300 characters.');
    error.code='SUBJECT_INVALID';error.statusCode=400;throw error;
  }
  return value.trim();
}
export function currentReviewSubject(review={}) {
  if(Object.hasOwn(review,'currentDraftSubject') && review.currentDraftSubject!==undefined) return normalizeSubject(review.currentDraftSubject);
  const raw=String(review.prepared?.coverLetter?.subject || '');
  const candidate=()=>normalizeSubject(String(review.candidateDisplayName || review.prepared?.candidateProfile?.displayName || process.env.CANDIDATE_DISPLAY_NAME || 'Vijay DAFAL'));
  if(/\|\s*Candidate\s*$/i.test(raw)) return normalizeSubject(raw.replace(/\|\s*Candidate\s*$/i,()=>`| ${candidate()}`));
  if(raw.trim() && !/^\s*Candidate\s*$/i.test(raw))return normalizeSubject(raw);
  const title=String(review.formData?.jobTitle || review.prepared?.jobDescription?.role || '').trim();
  const reference=String(review.formData?.jobReference || '').trim();
  return normalizeSubject(`Application${title?' for '+title:''}${reference?' (Ref: '+reference+')':''} | ${candidate()}`);
}
export function queueSnapshotSubject(review,submittedSubject) {
  return submittedSubject===undefined?currentReviewSubject(review):normalizeSubject(submittedSubject);
}
export function reviewWithSavedSubject(review,subject) {
  return {...review,currentDraftSubject:normalizeSubject(subject)};
}
