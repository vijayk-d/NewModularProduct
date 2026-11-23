// Reply assistant: drafts a polite, evidence-led reply to a recruiter's answer (for example "please apply online"),
// for the owner to copy into Gmail. It never sends anything. Writing uses the same AI setting as letter polishing:
// estimate first (free), then one paid request per confirmed click, no retries.
import {createHash} from 'node:crypto';
import {checkAnswer} from '../domain/questions/answer-policy.js';
import {DEFAULT_POLISHING_MODEL, normalizePolishingModel} from './polishing-model-catalog.js';
import {estimatePolishingApiRequest} from './polishing-cost-estimator.js';

export const REPLY_STATUSES = Object.freeze({
  applied: 'I have already applied online',
  'will-apply': 'I will complete the online application today',
  'not-yet': 'I have not applied online yet; ask how they prefer to receive it'
});
const OFF = 'Writing replies with AI is off. It uses the same setting as letter polishing: ENABLE_COVER_LETTER_REFINEMENT=true and PERPLEXITY_API_KEY in .env, then restart.';
const fail = (message, statusCode = 400, code = 'REPLY_BLOCKED') => { throw Object.assign(new Error(message), {statusCode, code}); };
const sha = v => createHash('sha256').update(v).digest('hex');
const text = (v, max, label, {required = false, min = 0} = {}) => {
  if (v !== undefined && v !== null && typeof v !== 'string') fail(label + ' must be text.');
  const s = String(v ?? '').replace(/\r\n/g, '\n').trim();
  if (required && !s) fail(label + ' is required.');
  if (s && s.length < min) fail(`${label} is too short to reply to (at least ${min} characters).`);
  if (s.length > max) fail(`${label} is too long (at most ${max} characters).`);
  return s;
};

// Addresses the owner types in (the person who replied): up to five, separated by commas, semicolons or spaces.
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;
export function respondentAddresses(value) {
  if (value !== undefined && value !== null && typeof value !== 'string') fail('Their email address must be text.');
  const parts = String(value ?? '').split(/[\s,;]+/).map(s => s.trim().replace(/^<|>$/g, '').toLowerCase()).filter(Boolean);
  for (const p of parts) if (!EMAIL.test(p) || p.length > 254) fail(`"${p.slice(0, 60)}" is not an email address. Check it and try again; nothing was searched.`, 400, 'REPLY_ADDRESS_INVALID');
  const unique = [...new Set(parts)];
  if (unique.length > 5) fail('Give at most five email addresses.', 400, 'REPLY_ADDRESS_INVALID');
  return unique;
}

export function validateReplyRequest(body = {}) {
  const status = String(body.applicationStatus || '');
  if (!REPLY_STATUSES[status]) fail('Choose where your online application stands.');
  return {theirMessage: text(body.theirMessage, 8000, 'Their message', {required: true, min: 20}), applicationStatus: status,
    recipientName: text(body.recipientName, 80, 'Their name'), ownerNote: text(body.ownerNote, 1000, 'Your note')};
}

// sentEmails(reviewId): the confirmed sends for this application; replyReader: read-only Gmail thread reader (optional).
export function createRecruiterReplyService({reviews, evidence = async () => [], writer = null, candidateName = '', sentEmails = () => [], queueItems = () => [], replyReader = null, replyStore = null, draftWriter = null, mailbox = '', now = () => Date.now()}) {
  if (!reviews) throw new Error('The reply assistant needs saved applications.');
  let writing = false, drafting = false;
  const review = id => { const r = reviews.get(id); if (!r) fail('Saved application not found.', 404); return r; };
  // Contact addresses of this application (queued or sent), and the search start: a day before the earliest, at most 120 days back.
  const contacts = (reviewId, sent) => {
    let queued = []; try { queued = (queueItems() || []).filter(q => q && q.reviewId === reviewId); } catch { queued = []; }
    const rows = [...queued, ...sent], addresses = [...new Set(rows.map(x => String(x.email || '').trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)))].slice(0, 20);
    const dates = rows.map(x => Date.parse(x.sentAt || x.createdAt || x.updatedAt || '')).filter(Number.isFinite);
    const start = Math.max(dates.length ? Math.min(...dates) - 864e5 : now() - 90 * 864e5, now() - 120 * 864e5);
    return {addresses, since: new Date(start).toISOString().slice(0, 10).replaceAll('-', '/')};
  };
  const sends = reviewId => { try { return (sentEmails() || []).filter(s => s && s.reviewId === reviewId && s.status === 'sent').sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || ''))); } catch { return []; } };

  async function target(reviewId, body) {
    if (!writer || typeof writer.buildRequest !== 'function') fail(OFF, 503, 'REPLY_DISABLED');
    const r = review(reviewId), v = validateReplyRequest(body), ev = await evidence(reviewId), form = r.formData || {};
    const request = {...v, applicationStatusText: REPLY_STATUSES[v.applicationStatus], candidateName: String(candidateName || ''),
      jobTitle: String(form.jobTitle || ''), organisationName: String(form.organisationName || ''), evidence: ev.slice(0, 40)};
    const model = normalizePolishingModel(body.model || r.polishingModel || DEFAULT_POLISHING_MODEL);
    const apiBody = writer.buildRequest(request, model);
    return {request, ev, model, apiBody, costProof: sha(JSON.stringify(apiBody))};
  }

  return {
    async overview(reviewId) {
      review(reviewId); const ev = await evidence(reviewId);
      const sent = sends(reviewId), {addresses} = contacts(reviewId, sent);
      return {evidenceCount: ev.length, aiAvailable: Boolean(writer?.available), statuses: REPLY_STATUSES, gmailReadAvailable: Boolean(replyReader), gmailDraftAvailable: Boolean(draftWriter && replyStore), savedReplies: replyStore ? replyStore.list(reviewId) : [], sentCount: sent.length, contactCount: addresses.length, contactAddresses: addresses};
    },
    // Read-only: their replies in the Gmail threads of emails sent for this application, and recent messages from its contacts.
    // Saves the reply drafted for one of their messages (local only).
    saveDraft(reviewId, body = {}) {
      review(reviewId);
      if (!replyStore) fail('Saving replies is unavailable in this configuration.', 503, 'REPLY_STORE_OFF');
      const saved = replyStore.saveDraft(reviewId, String(body.messageId || ''), {draftText: text(body.draftText, 20000, 'The reply'), draftHtml: String(body.draftHtml || '').slice(0, 60000),
        recipientName: text(body.recipientName, 80, 'Their name'), applicationStatus: REPLY_STATUSES[body.applicationStatus] ? body.applicationStatus : '', ownerNote: text(body.ownerNote, 1000, 'Your note')});
      if (!saved) fail('That reply is not saved with this application. Find it in Gmail first.', 404, 'REPLY_NOT_FOUND');
      return {reply: saved};
    },
    // Creates (or updates) a Gmail DRAFT in their thread with your reply. Never sends: you send it from Gmail.
    async createGmailDraft(reviewId, body = {}) {
      review(reviewId);
      if (!draftWriter || !replyStore) fail('Creating Gmail drafts is off: it needs Gmail switched on.', 503, 'REPLY_DRAFT_DISABLED');
      const item = replyStore.get(reviewId, String(body.messageId || ''));
      if (!item) fail('That reply is not saved with this application. Find it in Gmail first.', 404, 'REPLY_NOT_FOUND');
      if (!item.threadId || !item.fromAddress) fail('This reply has no Gmail thread or address, so it cannot be drafted there. Copy the reply instead.', 409, 'REPLY_NO_THREAD');
      const plain = text(body.bodyPlainText, 20000, 'The reply', {required: true}), html = String(body.bodyHtml || '').slice(0, 60000) || plain.split(/\n\s*\n/).map(p => '<p>' + p.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c])).replace(/\n/g, '<br>') + '</p>').join('');
      if (drafting) fail('A Gmail draft is already being created. Wait for it to finish.', 409, 'REPLY_DRAFT_BUSY');
      drafting = true;
      try {
        replyStore.saveDraft(reviewId, item.messageId, {...item, draftText: plain, draftHtml: html});
        const r = await draftWriter({threadId: item.threadId, replyToMessageId: item.messageId, to: item.fromAddress, bodyPlainText: plain, bodyHtml: html, draftId: item.gmailDraftId, expectedAddress: mailbox});
        if (!r.ok) fail(r.code === 'SCOPE_MISSING' ? 'Gmail has not granted the access needed. Run the Maintenance card "Gmail read access: add", restart the app, then try again.' : r.error, r.code === 'SCOPE_MISSING' ? 403 : 502, 'REPLY_' + r.code);
        return {reply: replyStore.markGmailDraft(reviewId, item.messageId, r.draftId), updated: r.updated === true, subject: r.subject || '', gmailDraftsUrl: 'https://mail.google.com/mail/u/0/#drafts'};
      } finally { drafting = false; }
    },
    // body.theirEmail (optional): the respondent's own address(es), searched first, in addition to this application's contacts.
    async findReplies(reviewId, body = {}) {
      review(reviewId);
      if (!replyReader) fail('Finding replies in Gmail is off: it needs Gmail switched on (ENABLE_GMAIL=true). Paste their reply instead.', 503, 'REPLY_READ_DISABLED');
      const extra = respondentAddresses(body?.theirEmail);
      const sent = sends(reviewId), known = contacts(reviewId, sent), since = known.since;
      const addresses = [...new Set([...extra, ...known.addresses])].slice(0, 20);
      const threads = sent.filter(s => s.threadId || s.messageId).slice(0, 5).map(s => ({threadId: s.threadId || '', sentMessageId: s.messageId || ''}));
      if (!threads.length && !addresses.length) fail('This application has no sent email or contact address to look for. Enter their email address, or paste their reply instead.', 409, 'REPLY_NOTHING_TO_SEARCH');
      const r = await replyReader({threads, fromAddresses: addresses, after: since, expectedAddress: mailbox});
      if (!r.ok) fail(r.code === 'SCOPE_MISSING' ? 'Gmail has not granted read access yet. Run the Maintenance card "Gmail read access: add" once, restart the app, then try again. Nothing was changed.' : r.error, r.code === 'SCOPE_MISSING' ? 403 : 502, 'REPLY_' + r.code);
      // Found replies are kept with this application, each with its own draft; finding again never overwrites a draft.
      const searched = {sentEmails: threads.length, contacts: addresses.length, enteredAddresses: extra.length};
      if (replyStore) { replyStore.addFound(reviewId, r.replies); return {searched, replies: replyStore.list(reviewId)}; }
      return {searched, replies: r.replies};
    },
    // Cost estimate only: nothing is sent anywhere.
    async estimate(reviewId, body) {
      const t = await target(reviewId, body), e = estimatePolishingApiRequest(t.apiBody);
      return {available: Boolean(writer.available), model: t.model, costProof: t.costProof, evidenceCount: t.ev.length,
        models: e.models.map(m => ({id: m.id, label: m.label, estimatedTokenCostUsd: m.estimatedTokenCostUsd})), ...(writer.available ? {} : {message: OFF})};
    },
    // One paid request after the owner confirmed this exact estimate. The reply only fills the editor.
    async write(reviewId, body) {
      if (writing) fail('A reply is already being written. Wait for it to finish.', 409, 'REPLY_BUSY');
      writing = true;
      try {
        const t = await target(reviewId, body);
        if (!writer.available) fail(OFF, 503, 'REPLY_DISABLED');
        if (body.confirmedCostProof !== t.costProof) fail('Their message, your choices or the model changed since the estimate. Estimate again; nothing was sent.', 409, 'REPLY_ESTIMATE_STALE');
        let out;
        try { out = await writer.write(t.request, t.model); }
        catch (error) { fail(`${String(error.code || '').startsWith('REPLY_') ? error.message : 'The reply service failed.'} Nothing changed and no retry was made.`, 503, error.code || 'REPLY_FAILED'); }
        if (!out.reply) fail('The reply service returned an empty reply, so nothing changed.', 502, 'REPLY_INVALID_RESPONSE');
        const check = checkAnswer({answer: out.reply, unit: 'words', limit: 1000, evidence: t.ev});
        return {reply: out.reply, notes: out.notes, model: out.model, unsupportedFigures: check.unsupportedFigures || []};
      } finally { writing = false; }
    }
  };
}
