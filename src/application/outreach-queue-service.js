import { snapshotMessage, prepareDraftSnapshot } from './outreach-message-snapshot.js';
import { createHash } from 'node:crypto';
import { queueSnapshotSubject } from './review-subject.js';

export function createOutreachQueueService({ repository, contactStore, getReview }) {
  function invalid(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  }
  return {
    list() { return repository.list(); },
    async add({ reviewId, recipients, bodyPlainText, bodyHtml, subject: submittedSubject } = {}) {
      if (typeof reviewId !== 'string' || !reviewId.trim()) invalid('Review ID is required.');
      const review = getReview(reviewId);
      if (!review) invalid('This review has expired. Prepare the application again.', 410);
      if (!contactStore) invalid('Contact storage is unavailable.', 503);
      if (!Array.isArray(recipients) || !recipients.length || recipients.length > 100) {
        invalid('Select between 1 and 100 linked contacts.');
      }
      if (typeof bodyPlainText !== 'string' || !bodyPlainText.trim() || bodyPlainText.length > 100000) {
        invalid('A non-empty message of at most 100000 characters is required.');
      }
      const linked = await contactStore.listByReview(reviewId);
      const byId = new Map(linked.map(contact => [contact.id, contact]));
      const form = review.formData || {};
      const advert = String(form.jobAdvertLink || '').trim();
      const identity = advert || JSON.stringify([
        form.organisationName || '', form.organisationUrl || '',
        form.jobTitle || '', form.jobReference || '', form.jobDescriptionText || ''
      ]);
      const applicationKey = createHash('sha256').update(identity).digest('hex');
      const snapshot = snapshotMessage(bodyPlainText, bodyHtml, advert);
    const selectedCode = review.selectedCvRoleCode || review.prepared?.recommendation?.bestCv?.role_code || '';
    const selectedCv = (review.prepared?.rankedCvs || []).map(item=>item.cv).find(cv=>cv?.role_code===selectedCode)
      || (review.prepared?.recommendation?.bestCv?.role_code===selectedCode ? review.prepared.recommendation.bestCv : null);
    const attachment = selectedCv?.local_path ? {relativePath:String(selectedCv.local_path),name:String(selectedCv.local_path).split(/[\\/]/).at(-1)} : null;
    const subject = queueSnapshotSubject(review, submittedSubject);
      if (!subject || /[\r\n]/.test(subject)) invalid('The application needs a valid single-line subject.');
      const items = recipients.map(recipient => {
        if (!recipient || typeof recipient.contactId !== 'string' || typeof recipient.email !== 'string') {
          invalid('Each selected contact needs an explicit recipient email.');
        }
        const contact = byId.get(recipient.contactId);
        if (!contact) invalid('A selected contact is not linked to this review. Refresh contacts.');
        const email = recipient.email.trim();
        const candidates = [contact.selectedEmail, ...(Array.isArray(contact.emailCandidates) ? contact.emailCandidates : [])]
          .filter(value => typeof value === 'string').map(value => value.trim());
        if (!email || !candidates.some(value => value.toLowerCase() === email.toLowerCase())) {
          invalid('Choose an email displayed for the linked contact.');
        }
        if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) invalid('Recipient email is invalid.');
        return {
          applicationKey, reviewId, contactId: contact.id, email,
          fullName: contact.fullName || '', role: contact.role || '',
          linkedinUrl: contact.linkedinUrl || '',
          verified: contact.verified === true && email.toLowerCase() === String(contact.selectedEmail || '').toLowerCase(),
          emailSource: email.toLowerCase() === String(contact.selectedEmail || '').toLowerCase()
            ? contact.emailSource || 'unknown' : 'inferred',
          application: {
            jobTitle: form.jobTitle || '', organisationName: form.organisationName || '',
            organisationUrl: form.organisationUrl || '', jobAdvertLink: advert,
            jobReference: form.jobReference || '', selectedCvRoleCode: review.selectedCvRoleCode || ''
          },
          subject, ...snapshot,
        ...(snapshot.bodyHtml ? {firstname:String(contact.firstName || contact.fullName?.trim().split(/\s+/)[0] || ''),
          lastname:String(contact.lastName || ''),attachment} : {})
        };
      });
      return repository.addMany(items);
    },
    prepareDrafts({ ids } = {}) {
      if (!Array.isArray(ids) || !ids.length || ids.length>100 || ids.some(id=>typeof id!=='string' || !id)) invalid('Select between 1 and 100 explicit queue IDs.');
      const byId=new Map(repository.list().map(item=>[item.id,item]));
      const drafts=[...new Set(ids)].map(id=>{const item=byId.get(id);if(!item)invalid('A selected queue item no longer exists. Refresh the queue.');return prepareDraftSnapshot(item);});
      return {prepared:drafts.length,action:'draft',liveDraftingEnabled:false,drafts};
    },
    deleteSelected({ ids } = {}) {
      if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some(id => typeof id !== 'string' || !id.trim())) {
        invalid('Select explicit queue items to remove.');
      }
      return { deleted: repository.deleteSelected(ids) };
    },
    clear({ confirmed } = {}) {
      if (confirmed !== true) invalid('Confirm clearing the queue.');
      return { deleted: repository.clearQueue() };
    }
  };
}
