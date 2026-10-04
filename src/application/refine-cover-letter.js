function requireRefinementPort(ports) {
  const port = ports?.coverLetterRefinementPort;

  if (!port || typeof port.refine !== 'function') {
    throw new Error('A coverLetterRefinementPort with a refine function is required.');
  }

  return port;
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
}

function normalizeRefinementRequest({
  draftPlainText,
  jobDescriptionSummary = '',
  selectedCvHighlights = [],
  companyValues = [],
  instructions = ''
} = {}) {
  const draft = String(draftPlainText ?? '').trim();

  if (!draft) {
    throw new Error('A non-empty cover-letter draft is required.');
  }

  return {
    draftPlainText: draft,
    jobDescriptionSummary: String(jobDescriptionSummary ?? '').trim(),
    selectedCvHighlights: normalizeStringArray(selectedCvHighlights),
    companyValues: normalizeStringArray(companyValues),
    instructions: String(instructions ?? '').trim()
  };
}

function normalizeRefinementResult(result) {
  const normalized = result ?? {};
  const review = normalized.review ?? {};

  return {
    review: {
      strengths: normalizeStringArray(review.strengths),
      risks: normalizeStringArray(review.risks),
      unsupportedClaims: normalizeStringArray(review.unsupportedClaims),
      suggestedChanges: normalizeStringArray(review.suggestedChanges)
    },
    proposedDraft: String(normalized.proposedDraft ?? ''),
    citations: Array.isArray(normalized.citations) ? normalized.citations : [],
    provider: String(normalized.provider ?? '').trim()
  };
}

export async function refineCoverLetter(request = {}, ports = {}) {
  const port = requireRefinementPort(ports);
  const normalizedRequest = normalizeRefinementRequest(request);

try {
  try {
    const result = await port.refine(normalizedRequest);

    return normalizeRefinementResult(result);
  } catch (error) {
    return {
      review: {
        strengths: [],
        risks: [],
        unsupportedClaims: [],
        suggestedChanges: []
      },
      proposedDraft: '',
      citations: [],
      provider: '',
      error: 'Cover-letter refinement is currently unavailable.'
    };
  }
} catch (error) {
  return {
    review: {
      strengths: [],
      risks: [],
      unsupportedClaims: [],
      suggestedChanges: []
    },
    proposedDraft: '',
    citations: [],
    provider: '',
    error: error instanceof Error
      ? error.message
      : 'Cover-letter refinement failed.'
  };
}}

