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

function normalizeMaxWords(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return 450;
  }

  return Math.min(Math.max(parsed, 120), 450);
}

function normalizeRefinementRequest({
  draftPlainText,
  jobDescriptionSummary = '',
  selectedCvHighlights = [],
  companyValues = [],
  selectedResearchPoints = [],
  organisationUrl = '',
  instructions = '',
  maxWords = 450
} = {}) {
  const draft = normalizeString(draftPlainText);

  if (!draft) {
    throw new Error('A non-empty cover-letter draft is required.');
  }

  return {
    draftPlainText: draft,
    jobDescriptionSummary: normalizeString(jobDescriptionSummary),
    selectedCvHighlights: normalizeStringArray(selectedCvHighlights),
    companyValues: normalizeStringArray(companyValues),
    selectedResearchPoints: normalizeResearchPoints(selectedResearchPoints),
    organisationUrl: normalizeUrl(organisationUrl),
    instructions: normalizeString(instructions),
    maxWords: normalizeMaxWords(maxWords)
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
    model: normalizeString(normalized.model)
  };
}

export async function refineCoverLetter(request = {}, ports = {}) {
  const port = requireRefinementPort(ports);
  const normalizedRequest = normalizeRefinementRequest(request);

  try {
    const result = await port.refine(normalizedRequest);
    return normalizeRefinementResult(result);
  } catch {
    return {
      review: normalizeReview(),
      proposedDraft: '',
      appliedResearchPointIds: [],
      omittedResearchPointIds: [],
      suggestedResearchPoints: [],
      citations: [],
      provider: '',
      model: '',
      error: 'Cover-letter refinement is currently unavailable.'
    };
  }
}
