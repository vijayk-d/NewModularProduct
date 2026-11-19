// One row of facts per application, for comparing choices against outcomes (insights phase 2). Pure.
// Built only from data the app already stores; no letter, CV or note text is copied into the row.
import {currentOutcome, hasResponse} from './application-outcome.js';

const DAY = 86400000;
const ROLE_FAMILIES = [
  ['agile-coach', /\bagile coach|enterprise coach|transformation coach\b/i],
  ['release-train-engineer', /\brelease train|\brte\b/i],
  ['scrum-master', /\bscrum master\b/i],
  ['delivery', /\bdelivery (?:manager|lead|director|head)|head of delivery|agile delivery\b/i],
  ['programme', /\bprogramme|program manager|portfolio\b/i],
  ['project', /\bproject (?:manager|lead|director)|\bpm\b/i],
  ['product', /\bproduct (?:owner|manager|lead)\b/i],
  ['transformation', /\btransformation\b/i]
];
export function roleFamily(title = '') { return (ROLE_FAMILIES.find(([, re]) => re.test(String(title))) || ['other'])[0]; }
export function seniority(title = '') {
  const t = String(title);
  if (/\b(director|head of|vp|vice president|chief)\b/i.test(t)) return 'director';
  if (/\b(principal|lead|senior|sr\.?|staff)\b/i.test(t)) return 'senior';
  if (/\b(junior|associate|graduate|assistant)\b/i.test(t)) return 'junior';
  return 'mid';
}
const words = text => (String(text || '').trim().match(/\S+/g) || []).length;
const iso = ms => Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : '';
const days = (a, b) => Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.floor((b - a) / DAY) : null;

function researchState(research) {
  if (!research) return 'none';
  if (research.status === 'error') return 'failed';
  if (research.reusedFromCache) return 'reused';
  if (research.automatic) return 'automatic';
  return research.status === 'found' ? 'manual' : 'none';
}

export function buildApplicationFeatures({reviewId, review, importedJob = null, portalExports = [], sentEmails = [], tailored = null, outcomes = []}) {
  const form = review?.formData || {};
  const createdAt = Number(review?.createdAt) || 0;
  const received = Date.parse(importedJob?.receivedAt || importedJob?.extraction?.extractedAt || '');
  const sent = sentEmails.filter(e => e?.reviewId === reviewId).map(e => Date.parse(e.sentAt)).filter(Number.isFinite).sort((a, b) => a - b);
  const exported = portalExports.filter(e => e?.reviewId === reviewId).map(e => Number(e.exportedAt)).filter(Number.isFinite).sort((a, b) => a - b);
  const channel = sent.length && exported.length ? 'both' : sent.length ? 'email' : exported.length ? 'portal' : 'none';
  const appliedAt = [sent[0], exported[0]].filter(Number.isFinite).sort((a, b) => a - b)[0];
  const outcome = currentOutcome(outcomes);
  const outcomeAt = outcome ? Date.parse(outcome.occurredOn + 'T00:00:00Z') : NaN;
  const atsScore = review?.prepared?.recommendation?.ats?.score;
  const original = String(review?.originalDraftPlainText || review?.prepared?.coverLetter?.plainText || '').trim(), current = String(review?.currentDraftPlainText || '').trim();
  return {
    reviewId,
    createdAt: iso(createdAt),
    organisation: String(form.organisationName || '').slice(0, 120),
    jobTitle: String(form.jobTitle || '').slice(0, 160),
    roleFamily: roleFamily(form.jobTitle),
    seniority: seniority(form.jobTitle),
    advertSource: form.jobImportId ? 'linkedin' : 'manual',
    daysAdvertToApplication: days(received, createdAt),
    advertiserRelationship: ['direct-employer', 'recruitment-intermediary', 'unknown'].includes(form.advertiserRelationship) ? form.advertiserRelationship : 'not-set',
    cvCode: String(review?.selectedCvRoleCode || review?.prepared?.recommendation?.bestCv?.role_code || ''),
    atsScore: Number.isFinite(atsScore) ? Math.round(atsScore) : null,
    cvTailored: Boolean(tailored),
    tailoredVersions: Number(tailored?.version) || 0,
    letterTone: String(review?.letterTone || 'professional'),
    letterLength: String(review?.currentLetterLengthMode || review?.letterLengthMode || 'standard'),
    polishingModel: String(review?.polishingModel || ''),
    letterEdited: Boolean(original && current && original !== current),
    letterWords: words(current),
    achievementsSelected: Array.isArray(form.cvHighlights) ? form.cvHighlights.filter(Boolean).length : 0,
    scenariosSelected: Array.isArray(review?.polishingScenarios?.references) ? review.polishingScenarios.references.length : 0,
    research: researchState(review?.research),
    channel,
    appliedAt: iso(appliedAt),
    outcome: outcome?.outcome || '',
    outcomeOn: outcome?.occurredOn || '',
    responded: hasResponse(outcome),
    daysToOutcome: days(appliedAt ?? createdAt, outcomeAt)
  };
}

export const FEATURE_COLUMNS = Object.freeze(['createdAt', 'organisation', 'jobTitle', 'roleFamily', 'seniority', 'advertSource', 'daysAdvertToApplication', 'advertiserRelationship', 'cvCode', 'atsScore',
  'cvTailored', 'tailoredVersions', 'letterTone', 'letterLength', 'polishingModel', 'letterEdited', 'letterWords', 'achievementsSelected', 'scenariosSelected', 'research', 'channel', 'appliedAt',
  'outcome', 'outcomeOn', 'responded', 'daysToOutcome']);
