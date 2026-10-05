from __future__ import annotations

from datetime import datetime
from pathlib import Path
import difflib
import shutil
import sys

APPLY = "--apply" in sys.argv

TARGETS = {
    Path("src/application/refine-cover-letter.js"): r'''function requireRefinementPort(ports) {
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
''',

    Path("src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js"): r'''function normalizeText(value = '') {
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
  return JSON.stringify({
    task: 'Propose a refined UK cover letter',
    jobTitle: request.jobDescriptionSummary,
    originalCoverLetter: request.draftPlainText,
    candidateEvidence: request.selectedCvHighlights,
    selectedCompanyValues: request.companyValues,
    selectedResearchPoints: request.selectedResearchPoints,
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
                      'Web search is permitted only to check official organisation pages within the configured domain filter.',
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
''',

    Path("tests/application/refine-cover-letter.test.js"): r'''import test from 'node:test';
import assert from 'node:assert/strict';

import { refineCoverLetter } from '../../src/application/refine-cover-letter.js';
import {
  createFakeCoverLetterRefinementAdapter
} from '../../src/infrastructure/refinement/fake-cover-letter-refinement-adapter.js';

test('requires a non-empty draft', async () => {
  const adapter = createFakeCoverLetterRefinementAdapter();

  await assert.rejects(
    () => refineCoverLetter({}, { coverLetterRefinementPort: adapter }),
    /A non-empty cover-letter draft is required\./
  );
});

test('requires an injected refinement port', async () => {
  await assert.rejects(
    () => refineCoverLetter({ draftPlainText: 'Draft' }, {}),
    /A coverLetterRefinementPort with a refine function is required\./
  );
});

test('normalizes manual research selections and returns a proposal without changing the draft', async () => {
  const calls = [];
  const adapter = createFakeCoverLetterRefinementAdapter({
    calls,
    result: {
      review: {
        strengths: [' Clear evidence '],
        risks: [' Unverified claim '],
        unsupportedClaims: [],
        suggestedChanges: [' Add measurable outcome ']
      },
      proposedDraft: 'Proposed draft',
      appliedResearchPointIds: [' value-excellence '],
      omittedResearchPointIds: [],
      suggestedResearchPoints: [{
        id: 'suggested-fact',
        type: 'fact',
        text: ' Official fact ',
        sourceUrl: 'https://example.test/about'
      }],
      citations: [],
      provider: 'fake-cover-letter-refinement',
      model: 'fake-model'
    }
  });

  const request = {
    draftPlainText: '  Original draft  ',
    jobDescriptionSummary: ' Delivery role ',
    selectedCvHighlights: [' Delivery ', ''],
    companyValues: [' Customer value '],
    selectedResearchPoints: [{
      id: ' value-excellence ',
      type: ' value ',
      text: ' Technical excellence ',
      sourceUrl: 'https://example.test/careers'
    }],
    organisationUrl: 'https://example.test',
    instructions: ' Improve clarity ',
    maxWords: 999
  };

  const result = await refineCoverLetter(request, {
    coverLetterRefinementPort: adapter
  });

  assert.deepEqual(calls, [{
    draftPlainText: 'Original draft',
    jobDescriptionSummary: 'Delivery role',
    selectedCvHighlights: ['Delivery'],
    companyValues: ['Customer value'],
    selectedResearchPoints: [{
      id: 'value-excellence',
      type: 'value',
      text: 'Technical excellence',
      sourceUrl: 'https://example.test/careers'
    }],
    organisationUrl: 'https://example.test/',
    instructions: 'Improve clarity',
    maxWords: 450
  }]);

  assert.equal(result.proposedDraft, 'Proposed draft');
  assert.equal(request.draftPlainText, '  Original draft  ');
  assert.deepEqual(result.review.strengths, ['Clear evidence']);
  assert.deepEqual(result.review.risks, ['Unverified claim']);
  assert.deepEqual(result.appliedResearchPointIds, ['value-excellence']);
  assert.deepEqual(result.suggestedResearchPoints, [{
    id: 'suggested-fact',
    type: 'fact',
    text: 'Official fact',
    sourceUrl: 'https://example.test/about'
  }]);
  assert.equal(result.provider, 'fake-cover-letter-refinement');
  assert.equal(result.model, 'fake-model');
});

test('converts an adapter failure into a controlled refinement error', async () => {
  const adapter = createFakeCoverLetterRefinementAdapter({
    error: new Error('Provider unavailable')
  });

  const result = await refineCoverLetter(
    { draftPlainText: 'Draft' },
    { coverLetterRefinementPort: adapter }
  );

  assert.deepEqual(result.review, {
    strengths: [],
    risks: [],
    unsupportedClaims: [],
    suggestedChanges: []
  });
  assert.equal(result.proposedDraft, '');
  assert.deepEqual(result.appliedResearchPointIds, []);
  assert.deepEqual(result.omittedResearchPointIds, []);
  assert.deepEqual(result.suggestedResearchPoints, []);
  assert.deepEqual(result.citations, []);
  assert.equal(result.provider, '');
  assert.equal(result.model, '');
  assert.equal(
    result.error,
    'Cover-letter refinement is currently unavailable.'
  );
});
''',

    Path("tests/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.test.js"): r'''import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPerplexityCoverLetterRefinementAdapter
} from '../../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';

function createJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

function createRequest(overrides = {}) {
  return {
    draftPlainText:
      'Dear Hiring Manager,\n\nI am applying for the Agile Coach role.\n\nWarm regards,\nCandidate',
    jobDescriptionSummary: 'Agile Coach / Scrum Master',
    selectedCvHighlights: [
      'Coached cross-functional delivery teams.'
    ],
    companyValues: [
      'Technical excellence'
    ],
    selectedResearchPoints: [{
      id: 'value-excellence',
      type: 'value',
      text: 'Technical excellence',
      sourceUrl: 'https://example.test/careers'
    }],
    organisationUrl: 'https://www.example.test/careers',
    instructions: 'Keep the tone direct.',
    maxWords: 450,
    ...overrides
  };
}

function createProposal(overrides = {}) {
  return {
    proposedDraft:
      'Dear Hiring Manager,\n\nI am applying for the Agile Coach role and would bring practical Agile coaching experience.\n\nWarm regards,\nCandidate',
    appliedResearchPointIds: ['value-excellence'],
    omittedResearchPointIds: [],
    suggestedResearchPoints: [],
    warnings: [],
    ...overrides
  };
}

test('requires an API key', () => {
  assert.throws(
    () => createPerplexityCoverLetterRefinementAdapter(),
    /A Perplexity API key is required\./
  );
});

test('uses the Agent API, configurable default model, structured output, and fast official-domain search', async () => {
  const calls = [];

  const adapter = createPerplexityCoverLetterRefinementAdapter({
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });

      return createJsonResponse({
        output_parsed: createProposal()
      });
    }
  });

  const result = await adapter.refine(createRequest());

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.perplexity.ai/v1/agent');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(
    calls[0].options.headers.authorization,
    'Bearer test-key'
  );

  const body = JSON.parse(calls[0].options.body);

  assert.equal(body.model, 'perplexity/glm-5.3-flash');
  assert.deepEqual(body.tools, [{
    type: 'web_search',
    search_type: 'fast',
    filters: {
      allowed_domains: ['example.test']
    }
  }]);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(
    body.response_format.json_schema.name,
    'cover_letter_refinement'
  );
  assert.match(
    body.input[1].content[0].text,
    /"selectedResearchPoints"/
  );
  assert.doesNotMatch(
    body.input[1].content[0].text,
    /unselected private claim/i
  );
  assert.equal(result.proposedDraft, createProposal().proposedDraft);
  assert.equal(result.model, 'perplexity/glm-5.3-flash');
  assert.deepEqual(result.appliedResearchPointIds, ['value-excellence']);
});

test('supports an explicitly configured refinement model', async () => {
  const adapter = createPerplexityCoverLetterRefinementAdapter({
    apiKey: 'test-key',
    model: 'perplexity/sonar',
    fetchImpl: async () => createJsonResponse({
      output_parsed: createProposal()
    })
  });

  const result = await adapter.refine(createRequest());

  assert.equal(result.model, 'perplexity/sonar');
});

test('omits domain filters when no valid organisation URL is supplied', async () => {
  const calls = [];

  const adapter = createPerplexityCoverLetterRefinementAdapter({
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });

      return createJsonResponse({
        output_parsed: createProposal()
      });
    }
  });

  await adapter.refine(createRequest({
    organisationUrl: 'not a URL'
  }));

  const body = JSON.parse(calls[0].options.body);

  assert.deepEqual(body.tools, [{
    type: 'web_search',
    search_type: 'fast'
  }]);
});

test('rejects a proposal that exceeds the configured word limit', async () => {
  const adapter = createPerplexityCoverLetterRefinementAdapter({
    apiKey: 'test-key',
    fetchImpl: async () => createJsonResponse({
      output_parsed: createProposal({
        proposedDraft: Array.from(
          { length: 451 },
          (_, index) => `word${index + 1}`
        ).join(' ')
      })
    })
  });

  await assert.rejects(
    () => adapter.refine(createRequest()),
    /exceeded the configured word limit/
  );
});

test('maps network, HTTP, and malformed responses to controlled errors', async (t) => {
  await t.test('network failure', async () => {
    const adapter = createPerplexityCoverLetterRefinementAdapter({
      apiKey: 'test-key',
      fetchImpl: async () => {
        throw new Error('offline');
      }
    });

    await assert.rejects(
      () => adapter.refine(createRequest()),
      /Perplexity cover-letter refinement is unavailable\./
    );
  });

  await t.test('HTTP failure', async () => {
    const adapter = createPerplexityCoverLetterRefinementAdapter({
      apiKey: 'test-key',
      fetchImpl: async () => createJsonResponse({}, 500)
    });

    await assert.rejects(
      () => adapter.refine(createRequest()),
      /Perplexity cover-letter refinement is unavailable\./
    );
  });

  await t.test('malformed structured response', async () => {
    const adapter = createPerplexityCoverLetterRefinementAdapter({
      apiKey: 'test-key',
      fetchImpl: async () => createJsonResponse({
        output_parsed: {
          proposedDraft: '',
          appliedResearchPointIds: [],
          omittedResearchPointIds: [],
          suggestedResearchPoints: [],
          warnings: []
        }
      })
    });

    await assert.rejects(
      () => adapter.refine(createRequest()),
      /returned no usable draft/
    );
  });
});
'''
}


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    print("No changes were made.")
    raise SystemExit(1)


def main() -> None:
    originals = {}

    for target, replacement in TARGETS.items():
        if not target.is_file():
            fail(f"Missing target file: {target}")

        original = target.read_text(encoding="utf-8")

        if target.name == "perplexity-cover-letter-refinement-adapter.js" and (
            "https://api.perplexity.ai/v1/agent" in original
        ):
            fail(
                "The refinement adapter already appears upgraded. "
                "Review it manually before running a replacement script."
            )

        originals[target] = original

    diffs = []

    for target, replacement in TARGETS.items():
        original = originals[target]
        updated = replacement.rstrip() + "\n"

        diffs.append(
            "".join(
                difflib.unified_diff(
                    original.splitlines(keepends=True),
                    updated.splitlines(keepends=True),
                    fromfile=str(target),
                    tofile=f"{target} (upgraded refinement)",
                    n=2
                )
            )
        )

    if not APPLY:
        print("Preview only: no files were changed.\n")
        print("\n".join(diffs))
        print("\nApply with:")
        print(
            "  py .\\scripts\\upgrade-cover-letter-refinement-contract.py --apply"
        )
        return

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    for target, replacement in TARGETS.items():
        backup = target.with_name(
            f"{target.name}.{timestamp}.before-refinement-upgrade.bak"
        )

        shutil.copy2(target, backup)
        target.write_text(replacement.rstrip() + "\n", encoding="utf-8")

        print(f"Updated: {target}")
        print(f"Backup:  {backup}")

    print("Cover-letter refinement contract upgrade applied.")


if __name__ == "__main__":
    main()