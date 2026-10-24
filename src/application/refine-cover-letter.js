import {normalizeApprovedScenarioEvidence} from './scenario-polishing.js';
import {lengthPolicy,normalizeLengthMode} from '../domain/cover-letter/letter-quality-policy.js';
import { normalizeLetterTone, normalizeExcludedEmployers } from './cover-letter-controls.js';
import { normalizePolishingModel, normalizeAttemptMetadata } from './polishing-model-catalog.js';
import { describeRefinementFailure, formatRefinementFailure } from './refinement-error-details.js';
function requireRefinementPort(ports) {
  const port = ports?.coverLetterRefinementPort;

  if (!port || typeof port.refine !== 'function') {
    throw new Error('A coverLetterRefinementPort with a refine function is required.');
  }

  return port;
}

function normalizeString(value = '') {
  return String(value ?? '').trim();
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeString(item)).filter(Boolean)
    : [];
}

function normalizeUrl(value = '') {
  const text = normalizeString(value);

  if (!text) {
    return '';
  }

  try {
    const url = new URL(text);

    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : '';
  } catch {
    return '';
  }
}

function normalizeResearchPoints(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();

  return value.reduce((points, item, index) => {
    const id = normalizeString(item?.id) || `research-${index + 1}`;
    const text = normalizeString(item?.text);

    if (!text || seen.has(id)) {
      return points;
    }

    seen.add(id);

    points.push({
      id,
      type: normalizeString(item?.type) || 'fact',
      text,
      sourceUrl: normalizeUrl(item?.sourceUrl)
    });

    return points;
  }, []);
}

function normalizeMaxWords(value,mode){return lengthPolicy(mode,value??500).maximumWords;}

function normalizeRefinementRequest({
  draftPlainText,
  jobDescriptionSummary = '',
  applicationJobTitle = '',
  organisationName = '',
  advertiserRelationship = 'direct-employer',
  candidateProfessionalValues = '',
  allowUnknownOrganisation = false,
  jobAdvertLink = '',
  protectOutreachStructure = false,
  researchSources = [],
  webSearchEnabled,
  polishingModel,
  letterTone = 'professional',
  excludedEmployers = ['micro1'],
  jobDescriptionText = '',
  selectedCvText = '',
  candidateLinkedInText = '',
  candidateLinkedInUrl = '',
  candidateDisplayName = '',
  selectedCvHighlights = [],
  achievementSelectionExplicit = false,
  approvedAchievementEvidence = null,
  approvedScenarioEvidence = [],
  companyValues = [],
  selectedResearchPoints = [],
  organisationUrl = '',
  instructions = '',
  letterLengthMode = 'standard',
  maxWords = 500
} = {}) {
  const draft = normalizeString(draftPlainText);

  if (!draft) {
    throw new Error('A non-empty cover-letter draft is required.');
  }

  return {
    draftPlainText: draft,
    applicationJobTitle: normalizeString(applicationJobTitle),
    organisationName: normalizeString(organisationName),
    advertiserRelationship:normalizeString(advertiserRelationship),candidateProfessionalValues:normalizeString(candidateProfessionalValues),allowUnknownOrganisation:allowUnknownOrganisation===true,
    jobAdvertLink: normalizeUrl(jobAdvertLink),
    protectOutreachStructure: protectOutreachStructure === true,
    researchSources: Array.isArray(researchSources) ? researchSources : [],
    ...(polishingModel !== undefined ? {polishingModel:normalizePolishingModel(polishingModel)} : {}),
    ...(typeof webSearchEnabled === 'boolean' ? { webSearchEnabled } : {}),
    letterTone: normalizeLetterTone(letterTone),
    excludedEmployers: normalizeExcludedEmployers(excludedEmployers),
    jobDescriptionSummary: normalizeString(jobDescriptionSummary),
    ...(normalizeString(jobDescriptionText) ? { jobDescriptionText: normalizeString(jobDescriptionText) } : {}),
    ...(normalizeString(selectedCvText) ? { selectedCvText: normalizeString(selectedCvText) } : {}),
    ...(normalizeString(candidateLinkedInText) ? { candidateLinkedInText: normalizeString(candidateLinkedInText) } : {}),
    ...(normalizeUrl(candidateLinkedInUrl) ? { candidateLinkedInUrl: normalizeUrl(candidateLinkedInUrl) } : {}),
    ...(normalizeString(candidateDisplayName) ? { candidateDisplayName: normalizeString(candidateDisplayName) } : {}),
    selectedCvHighlights: normalizeStringArray(selectedCvHighlights),
    ...(achievementSelectionExplicit===true?{achievementSelectionExplicit:true,approvedAchievementEvidence:approvedAchievementEvidence?structuredClone(approvedAchievementEvidence):null}:{}),
    ...(approvedScenarioEvidence?.length?{approvedScenarioEvidence:normalizeApprovedScenarioEvidence(approvedScenarioEvidence)}:{}),
    companyValues: normalizeStringArray(companyValues),
    selectedResearchPoints: normalizeResearchPoints(selectedResearchPoints),
    organisationUrl: normalizeUrl(organisationUrl),
    instructions: normalizeString(instructions),
    letterLengthMode:normalizeLengthMode(letterLengthMode),
    maxWords: normalizeMaxWords(maxWords,letterLengthMode)
  };
}

function normalizeReview(value = {}) {
  return {
    strengths: normalizeStringArray(value.strengths),
    risks: normalizeStringArray(value.risks),
    unsupportedClaims: normalizeStringArray(value.unsupportedClaims),
    suggestedChanges: normalizeStringArray(value.suggestedChanges)
  };
}

function normalizeSuggestedResearchPoints(value) {
  return normalizeResearchPoints(value);
}

function normalizeRefinementResult(result) {
  const normalized = result ?? {};

  return {
    review: normalizeReview(normalized.review),
    proposedDraft: normalizeString(normalized.proposedDraft),
    ...(normalized.quality?{quality:normalized.quality,letterLengthMode:normalized.letterLengthMode,qualityAdvertUrl:normalized.qualityAdvertUrl||''}:{}),
    highlightSelections:Array.isArray(normalized.highlightSelections)?normalized.highlightSelections.filter(s=>Number.isInteger(s?.start)&&Number.isInteger(s?.end)&&s.start>=0&&s.end>s.start&&String(normalized.proposedDraft||'').slice(s.start,s.end)===s.text).slice(0,8):[],
    highlightPhrases: normalizeStringArray(normalized.highlightPhrases).filter(phrase => normalizeString(normalized.proposedDraft).toLowerCase().includes(phrase.toLowerCase())).slice(0, 16),
    warnings: normalizeStringArray(normalized.warnings),
    appliedResearchPointIds: normalizeStringArray(
      normalized.appliedResearchPointIds
    ),
    omittedResearchPointIds: normalizeStringArray(
      normalized.omittedResearchPointIds
    ),
    suggestedResearchPoints: normalizeSuggestedResearchPoints(
      normalized.suggestedResearchPoints
    ),
    citations: Array.isArray(normalized.citations)
      ? normalized.citations
      : [],
    provider: normalizeString(normalized.provider),
    ...(normalized.attemptMetadata ? {attemptMetadata:normalizeAttemptMetadata(normalized.attemptMetadata)} : {}),
    model: normalizeString(normalized.model)
  };
}

export async function refineCoverLetter(request = {}, ports = {}) {
  const port = requireRefinementPort(ports);
  const normalizedRequest = normalizeRefinementRequest(request);

  try {
    const result = await port.refine(normalizedRequest);
    return normalizeRefinementResult(result);
  } catch (error) {
    return {
      review: normalizeReview(),
      proposedDraft: '',
      appliedResearchPointIds: [],
      omittedResearchPointIds: [],
      suggestedResearchPoints: [],
      citations: [],
      provider: '',
      model: '',
      ...(error.attemptMetadata ? {attemptMetadata:normalizeAttemptMetadata(error.attemptMetadata)} : {}),
      errorCode: describeRefinementFailure(error).errorCode,
      ...(error.rejectedProposal?{rejectedProposal:error.rejectedProposal}:{}),
      failureDetails: describeRefinementFailure(error),
      error: formatRefinementFailure(error)
    };
  }
}
