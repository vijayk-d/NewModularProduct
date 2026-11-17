// Synthetic tailored-CV fixtures: a fake document worker and one saved application. No real CV data.
import {createDurableReviewStore, createMemoryReviewRepository} from '../../src/application/durable-review-store.js';

export const SHA = 'a'.repeat(64);

export function fakeWorker(calls = [], {sha = () => SHA, sections} = {}) {
  return async payload => {
    calls.push(payload);
    if (payload.action === 'sections') return {ok: true, name: 'PM_CV.docx', sha256: sha(), sections: sections || {
      profile: {heading: 'Profile', paragraphs: ['Delivery leader across programmes.'], bullets: 0, supported: true},
      achievements: {heading: 'Key Achievements', paragraphs: ['Cut costs by 10% through vendor consolidation.', 'Led a 40-person Agile programme.'], bullets: 2, supported: true}}};
    if (payload.action === 'tailor') return {ok: true, name: 'PM_CV.docx', sha256: sha(), data: Buffer.from('PK' + JSON.stringify([payload.profile, payload.achievements])).toString('base64')};
    throw new Error('Unexpected document action.');
  };
}

export function reviewFixture() {
  const reviews = createDurableReviewStore(createMemoryReviewRepository());
  const cv = {role_code: 'PM', role_name: 'Project Manager', local_path: 'PM/PM_CV.pdf'};
  const body = 'Dear Hiring Manager,\n\nI led delivery.\n\nKind regards,\nTest Candidate';
  reviews.set('r1', {formData: {jobTitle: 'Delivery Manager', organisationName: 'Example', jobDescriptionText: 'Agile delivery and risk management.', jobAdvertLink: 'https://business.test/job', advertiserRelationship: 'unknown', cvHighlights: ['Introduced risk reporting for the board.']},
    prepared: {jobDescription: {role: 'Delivery Manager', keywords: ['agile', 'risk']}, coverLetter: {subject: 'S', plainText: body}, recommendation: {bestCv: cv, alternativeCv: null, ats: {score: 70}}, rankedCvs: [{cv, ats: {score: 70, matchedKeywords: [], missingKeywords: []}}]},
    selectedCvRoleCode: 'PM', currentDraftPlainText: body, currentDraftSubject: 'S', createdAt: Date.now()});
  return reviews;
}
