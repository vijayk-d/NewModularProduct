const RESEARCH_STATUSES = new Set(['found', 'not-found', 'error']);

function requireResearchPort(ports) {
  const port = ports?.companyResearchPort;

  if (!port || typeof port.research !== 'function') {
    throw new Error('A companyResearchPort with a research function is required.');
  }

  return port;
}

function normalizeResearchRequest({
  companyName,
  companyUrl = '',
  jobDescriptionSummary = '',
  forceRefresh = false
} = {}) {
  const normalizedName = String(companyName ?? '').trim();

  if (!normalizedName) {
    throw new Error('A non-empty company name is required.');
  }

  if (typeof forceRefresh !== 'boolean') {
    throw new Error('forceRefresh must be a boolean.');
  }

  return {
    companyName: normalizedName,
    companyUrl: String(companyUrl ?? '').trim(),
    jobDescriptionSummary: String(jobDescriptionSummary ?? '').trim(),
    forceRefresh
  };
}

function normalizeResearchResult(result) {
  const normalized = result ?? {};

  const status = String(normalized.status ?? '');

  if (!RESEARCH_STATUSES.has(status)) {
    throw new Error('Company research returned an unsupported status.');
  }

  const companyValues = Array.isArray(normalized.companyValues)
    ? normalized.companyValues.map((value) => String(value ?? '').trim()).filter(Boolean)
    : [];

  const sources = Array.isArray(normalized.sources)
    ? normalized.sources.map((source) => ({
        title: String(source?.title ?? '').trim(),
        url: String(source?.url ?? '').trim()
      })).filter((source) => source.title || source.url)
    : [];

  return {
    status,
    companyValues,
    summary: String(normalized.summary ?? '').trim(),
    sources,
    researchedAt: String(normalized.researchedAt ?? '').trim(),
    provider: String(normalized.provider ?? '').trim(),
    error: normalized.error === undefined ? undefined : String(normalized.error),
    ...(normalized.emailDomainResearch &&
        typeof normalized.emailDomainResearch === "object"
      ? {
          emailDomainResearch: {
            emailDomain: String(
              normalized.emailDomainResearch.emailDomain ?? ""
            ).trim(),
            confidence: String(
              normalized.emailDomainResearch.confidence ?? "low"
            ).trim(),
            reasoning: String(
              normalized.emailDomainResearch.reasoning ?? ""
            ).trim(),
            evidence: Array.isArray(
              normalized.emailDomainResearch.evidence
            )
              ? normalized.emailDomainResearch.evidence.map((source) => ({
                  title: String(source?.title ?? "").trim(),
                  url: String(source?.url ?? "").trim()
                }))
              : []
          }
        }
      : {})
  };
}

export async function researchOrganization(request = {}, ports = {}) {
  const port = requireResearchPort(ports);
  const normalizedRequest = normalizeResearchRequest(request);

try {
  try {
    const result = await port.research(normalizedRequest);

    return normalizeResearchResult(result);
  } catch (error) {
    return {
      status: 'error',
      companyValues: [],
      summary: '',
      sources: [],
      researchedAt: '',
      provider: '',
      error: 'Company research is currently unavailable.'
    };
  }
} catch (error) {
  return {
    status: 'error',
    companyValues: [],
    summary: '',
    sources: [],
    researchedAt: '',
    provider: '',
    error: error instanceof Error
      ? error.message
      : 'Company research failed.'
  };
}}

