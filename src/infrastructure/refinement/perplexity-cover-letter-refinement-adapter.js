function normalizeText(value = '') {
  return String(value ?? '').trim();
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean)
    : [];
}

function wordCount(value = '') {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function allowedDomainsFromUrl(value = '') {
  try {
    const hostname = new URL(normalizeText(value)).hostname
      .replace(/^www\./i, '')
      .toLowerCase();

    return hostname ? [hostname] : [];
  } catch {
    return [];
  }
}

function researchPointSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'text', 'sourceUrl', 'reason'],
    properties: {
      id: {
        type: 'string'
      },
      text: {
        type: 'string'
      },
      sourceUrl: {
        type: 'string'
      },
      reason: {
        type: 'string'
      }
    }
  };
}

function responseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'proposedDraft',
      'appliedResearchPointIds',
      'omittedResearchPointIds',
      'suggestedResearchPoints',
      'warnings'
    ],
    properties: {
      proposedDraft: {
        type: 'string'
      },
      appliedResearchPointIds: {
        type: 'array',
        items: {
          type: 'string'
        }
      },
      omittedResearchPointIds: {
        type: 'array',
        items: {
          type: 'string'
        }
      },
      suggestedResearchPoints: {
        type: 'array',
        items: researchPointSchema()
      },
      warnings: {
        type: 'array',
        items: {
          type: 'string'
        }
      }
    }
  };
}

function buildPrompt(request) {
  const researchSources = Array.isArray(request.researchSources)
    ? request.researchSources.slice(0, 5)
    : [];

  const researchContext = researchSources
    .map((source) => {
      const title = normalizeText(source?.title) || "Source";
      const url = normalizeText(source?.url);

      return url ? `- ${title}: ${url}` : `- ${title}`;
    })
    .join("\n");

  return JSON.stringify({
    task: "Propose a refined UK cover letter",
    jobTitle: request.jobDescriptionSummary,
    organisationName: normalizeText(request.organisationName),
    organisationUrl: normalizeText(request.organisationUrl),
    originalCoverLetter: request.draftPlainText,
    candidateEvidence: request.selectedCvHighlights,
    selectedCompanyValues: request.companyValues,
    selectedResearchPoints: request.selectedResearchPoints,
    publicResearchSources: researchSources,
    researchContext,
    instructions: request.instructions,
    constraints: {
      maxWords: request.maxWords,
      preserveGreetingAndSignoff: true,
      noInventedCandidateClaims: true,
      citationsInLetter: false,
      urlsInLetter: false,
      markdownInLetter: false
    }
  });
}

function extractStructuredOutput(payload) {
  const output =
    payload?.output_parsed ||
    payload?.output?.[0]?.content?.[0]?.json ||
    payload?.output?.[0]?.content?.[0]?.text ||
    payload?.choices?.[0]?.message?.content;

  if (output && typeof output === 'object') {
    return output;
  }

  if (typeof output !== 'string' || !output.trim()) {
    throw new Error(
      'Perplexity cover-letter refinement returned no usable draft.'
    );
  }

  try {
    return JSON.parse(output);
  } catch {
    throw new Error(
      'Perplexity cover-letter refinement returned an invalid response.'
    );
  }
}

function validateProposal(result, request) {
  const proposedDraft = normalizeText(result?.proposedDraft);

  if (!proposedDraft) {
    throw new Error(
      'Perplexity cover-letter refinement returned no usable draft.'
    );
  }

  if (wordCount(proposedDraft) > request.maxWords) {
    throw new Error(
      'Perplexity cover-letter refinement exceeded the configured word limit.'
    );
  }

  return {
    review: {
      strengths: [],
      risks: [],
      unsupportedClaims: [],
      suggestedChanges: normalizeStringArray(result?.warnings)
    },
    proposedDraft,
    appliedResearchPointIds: normalizeStringArray(
      result?.appliedResearchPointIds
    ),
    omittedResearchPointIds: normalizeStringArray(
      result?.omittedResearchPointIds
    ),
    suggestedResearchPoints: Array.isArray(result?.suggestedResearchPoints)
      ? result.suggestedResearchPoints
      : [],
    citations: [],
    provider: 'perplexity'
  };
}

export function createPerplexityCoverLetterRefinementAdapter({
  apiKey,
  model = 'perplexity/glm-5.3-flash',
  fetchImpl = fetch
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('A Perplexity API key is required.');
  }

  return {
    async refine(request) {
      const allowedDomains = allowedDomainsFromUrl(request.organisationUrl);

      const webSearchTool = {
        type: 'web_search',
        search_type: 'fast'
      };

      if (allowedDomains.length) {
        webSearchTool.filters = {
          allowed_domains: allowedDomains
        };
      }

      let response;

      try {
        response = await fetchImpl('https://api.perplexity.ai/v1/agent', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model,
            input: [
              {
                role: 'system',
                content: [
                  {
                    type: 'input_text',
                    text: [
                      'You are a careful editor for UK job-application cover letters.',
                      'Return a proposal only; never mutate the original draft.',
                      'Use candidate evidence and manually selected research points supplied in the request.',
                      'When no selected research points are supplied, use only the supplied organisation details and public research sources as background context.',
                      'Do not treat public research sources as verified organisational values.','Web search is permitted only to check official organisation pages within the configured domain filter.',
                      'Do not invent candidate achievements, metrics, employers, qualifications, certifications, tools, clearances, or company facts.',
                      'Do not claim the candidate has direct experience with the organisation.',
                      'Do not put citations, URLs, Markdown, headings, or commentary inside proposedDraft.',
                      'If a search result yields a potentially useful fact not included in selectedResearchPoints, return it only in suggestedResearchPoints.',
                      'Return only schema-valid JSON.'
                    ].join(' ')
                  }
                ]
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: buildPrompt(request)
                  }
                ]
              }
            ],
            tools: [webSearchTool],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'cover_letter_refinement',
                strict: true,
                schema: responseSchema()
              }
            }
          })
        });
      } catch {
        throw new Error('Perplexity cover-letter refinement is unavailable.');
      }

      if (!response.ok) {
        throw new Error('Perplexity cover-letter refinement is unavailable.');
      }

      let payload;

      try {
        payload = await response.json();
      } catch {
        throw new Error(
          'Perplexity cover-letter refinement returned an invalid response.'
        );
      }

      const proposal = validateProposal(
        extractStructuredOutput(payload),
        request
      );

      return {
        ...proposal,
        model
      };
    }
  };
}
