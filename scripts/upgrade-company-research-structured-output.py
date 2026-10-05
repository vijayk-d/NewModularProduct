from __future__ import annotations

from datetime import datetime
from pathlib import Path
import difflib
import shutil
import sys

APPLY = "--apply" in sys.argv

ADAPTER = Path(
    "src/infrastructure/research/perplexity-company-research-adapter.js"
)

TESTS = Path(
    "tests/infrastructure/research/perplexity-company-research-adapter.test.js"
)


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    print("No changes were made.")
    raise SystemExit(1)


def main() -> None:
    for target in (ADAPTER, TESTS):
        if not target.is_file():
            fail(f"Missing target file: {target}")

    original_adapter = ADAPTER.read_text(encoding="utf-8")
    original_tests = TESTS.read_text(encoding="utf-8")

    if "https://api.perplexity.ai/v1/agent" in original_adapter:
        fail(
            "Company research adapter already appears to use the Agent API. "
            "No changes were made."
        )

    adapter = r'''function normalizeText(value = '') {
  return String(value ?? '').trim();
}

function normalizeCompanyValues(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();

  return value.reduce((values, item) => {
    const normalized = normalizeText(item);

    if (!normalized) {
      return values;
    }

    const key = normalized.toLowerCase();

    if (seen.has(key)) {
      return values;
    }

    seen.add(key);
    values.push(normalized);

    return values;
  }, []);
}

function normalizeSource(source) {
  const title = normalizeText(source?.title || source?.url);
  const url = normalizeText(source?.url || source?.link);

  if (!title && !url) {
    return null;
  }

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { title, url: '' };
    }

    return {
      title: title || parsed.href,
      url: parsed.href
    };
  } catch {
    return {
      title,
      url: ''
    };
  }
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

function responseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'summary',
      'companyValues',
      'sources',
      'caveats'
    ],
    properties: {
      summary: {
        type: 'string'
      },
      companyValues: {
        type: 'array',
        items: {
          type: 'string'
        },
        maxItems: 8
      },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'url'],
          properties: {
            title: {
              type: 'string'
            },
            url: {
              type: 'string'
            }
          }
        },
        maxItems: 12
      },
      caveats: {
        type: 'array',
        items: {
          type: 'string'
        },
        maxItems: 5
      }
    }
  };
}

function buildPrompt(request) {
  return JSON.stringify({
    task: 'Research an organisation for a job-application review',
    organisationName: request.companyName,
    organisationUrl: request.companyUrl || '',
    jobRoleContext: request.jobDescriptionSummary || '',
    requirements: [
      'Return 2 to 8 concise, explicitly stated organisation values when official sources identify them.',
      'Do not infer values from marketing language. If no explicit values are available, return an empty companyValues array.',
      'Write a short factual summary relevant to the role context.',
      'Prefer official organisation sources and include only sources actually used.',
      'Do not make claims about the candidate or any individual.',
      'Return only valid JSON matching the response schema.'
    ]
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
      'Perplexity organisation research returned no usable summary.'
    );
  }

  try {
    return JSON.parse(output);
  } catch {
    throw new Error(
      'Perplexity organisation research returned an invalid response.'
    );
  }
}

function normalizeResult(result, now) {
  const summary = normalizeText(result?.summary);

  if (!summary) {
    throw new Error(
      'Perplexity organisation research returned no usable summary.'
    );
  }

  const values = normalizeCompanyValues(result?.companyValues);

  const sources = Array.isArray(result?.sources)
    ? result.sources.map(normalizeSource).filter(Boolean)
    : [];

  return {
    status: 'found',
    companyValues: values,
    summary,
    sources,
    caveats: Array.isArray(result?.caveats)
      ? result.caveats.map(normalizeText).filter(Boolean)
      : [],
    researchedAt: now(),
    provider: 'perplexity'
  };
}

export function createPerplexityCompanyResearchAdapter({
  apiKey,
  model = 'perplexity/sonar',
  fetchImpl = fetch,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('A Perplexity API key is required.');
  }

  return {
    async research(request) {
      const allowedDomains = allowedDomainsFromUrl(request.companyUrl);

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
                      'You research organisations using factual, source-backed information.',
                      'Prefer official organisation sources.',
                      'Extract only explicitly stated company values.',
                      'Do not infer candidate information or fabricate facts.',
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
                name: 'organisation_research',
                strict: true,
                schema: responseSchema()
              }
            }
          })
        });
      } catch {
        throw new Error('Perplexity organisation research is unavailable.');
      }

      if (!response.ok) {
        throw new Error('Perplexity organisation research is unavailable.');
      }

      let payload;

      try {
        payload = await response.json();
      } catch {
        throw new Error(
          'Perplexity organisation research returned an invalid response.'
        );
      }

      return normalizeResult(
        extractStructuredOutput(payload),
        now
      );
    }
  };
}
'''

    tests = r'''import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPerplexityCompanyResearchAdapter
} from '../../../src/infrastructure/research/perplexity-company-research-adapter.js';

const request = {
  companyName: 'Example Ltd',
  companyUrl: 'https://www.example.com/careers',
  jobDescriptionSummary: 'Delivery role',
  forceRefresh: false
};

function createJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

function createResearchResult(overrides = {}) {
  return {
    summary: 'Example Ltd is a delivery-focused organisation.',
    companyValues: [
      'Customer outcomes',
      'Continuous improvement'
    ],
    sources: [
      {
        title: 'Example careers',
        url: 'https://example.com/careers'
      }
    ],
    caveats: [],
    ...overrides
  };
}

test('requires an API key', () => {
  assert.throws(
    () => createPerplexityCompanyResearchAdapter({ apiKey: '' }),
    /A Perplexity API key is required\./
  );
});

test('uses the Agent API with fast official-domain search and maps structured values', async () => {
  let captured;

  const adapter = createPerplexityCompanyResearchAdapter({
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      captured = { url, options };

      return createJsonResponse({
        output_parsed: createResearchResult()
      });
    },
    now: () => '2026-10-04T12:00:00.000Z'
  });

  const result = await adapter.research(request);

  assert.equal(captured.url, 'https://api.perplexity.ai/v1/agent');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.authorization, 'Bearer test-key');

  const body = JSON.parse(captured.options.body);

  assert.equal(body.model, 'perplexity/sonar');
  assert.deepEqual(body.tools, [{
    type: 'web_search',
    search_type: 'fast',
    filters: {
      allowed_domains: ['example.com']
    }
  }]);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(
    body.response_format.json_schema.name,
    'organisation_research'
  );
  assert.match(
    body.input[1].content[0].text,
    /Example Ltd/
  );
  assert.match(
    body.input[1].content[0].text,
    /https:\/\/www\.example\.com\/careers/
  );
  assert.match(
    body.input[1].content[0].text,
    /Delivery role/
  );

  assert.equal(result.status, 'found');
  assert.equal(
    result.summary,
    'Example Ltd is a delivery-focused organisation.'
  );
  assert.deepEqual(result.companyValues, [
    'Customer outcomes',
    'Continuous improvement'
  ]);
  assert.equal(result.provider, 'perplexity');
  assert.equal(result.researchedAt, '2026-10-04T12:00:00.000Z');
  assert.deepEqual(result.sources, [
    {
      title: 'Example careers',
      url: 'https://example.com/careers'
    }
  ]);
  assert.deepEqual(result.caveats, []);
});

test('deduplicates and trims structured organisation values', async () => {
  const adapter = createPerplexityCompanyResearchAdapter({
    apiKey: 'test-key',
    fetchImpl: async () => createJsonResponse({
      output_parsed: createResearchResult({
        companyValues: [
          ' Customer outcomes ',
          'customer outcomes',
          '',
          'Continuous improvement'
        ]
      })
    })
  });

  const result = await adapter.research(request);

  assert.deepEqual(result.companyValues, [
    'Customer outcomes',
    'Continuous improvement'
  ]);
});

test('omits domain filters when no valid organisation URL is supplied', async () => {
  let captured;

  const adapter = createPerplexityCompanyResearchAdapter({
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      captured = { url, options };

      return createJsonResponse({
        output_parsed: createResearchResult()
      });
    }
  });

  await adapter.research({
    ...request,
    companyUrl: 'not a URL'
  });

  const body = JSON.parse(captured.options.body);

  assert.deepEqual(body.tools, [{
    type: 'web_search',
    search_type: 'fast'
  }]);
});

test('maps network, HTTP, malformed, and empty responses to controlled errors', async (t) => {
  await t.test('network failure', async () => {
    const adapter = createPerplexityCompanyResearchAdapter({
      apiKey: 'test-key',
      fetchImpl: async () => {
        throw new Error('offline');
      }
    });

    await assert.rejects(
      () => adapter.research(request),
      /Perplexity organisation research is unavailable\./
    );
  });

  await t.test('HTTP failure', async () => {
    const adapter = createPerplexityCompanyResearchAdapter({
      apiKey: 'test-key',
      fetchImpl: async () => createJsonResponse({}, 500)
    });

    await assert.rejects(
      () => adapter.research(request),
      /Perplexity organisation research is unavailable\./
    );
  });

  await t.test('malformed structured response', async () => {
    const adapter = createPerplexityCompanyResearchAdapter({
      apiKey: 'test-key',
      fetchImpl: async () => createJsonResponse({
        output_parsed: {
          summary: '',
          companyValues: [],
          sources: [],
          caveats: []
        }
      })
    });

    await assert.rejects(
      () => adapter.research(request),
      /returned no usable summary/
    );
  });
});
'''

    updated_adapter = adapter.rstrip() + "\n"
    updated_tests = tests.rstrip() + "\n"

    diffs = {
        ADAPTER: ''.join(
            difflib.unified_diff(
                original_adapter.splitlines(keepends=True),
                updated_adapter.splitlines(keepends=True),
                fromfile=str(ADAPTER),
                tofile=f'{ADAPTER} (structured research)',
                n=2
            )
        ),
        TESTS: ''.join(
            difflib.unified_diff(
                original_tests.splitlines(keepends=True),
                updated_tests.splitlines(keepends=True),
                fromfile=str(TESTS),
                tofile=f'{TESTS} (structured research tests)',
                n=2
            )
        )
    }

    if not APPLY:
        print("Preview only: no files were changed.\n")
        print(diffs[ADAPTER])
        print(diffs[TESTS])
        print("\nApply with:")
        print(
            "  py .\\scripts\\upgrade-company-research-structured-output.py --apply"
        )
        return

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    for target, updated in (
        (ADAPTER, updated_adapter),
        (TESTS, updated_tests)
    ):
        backup = target.with_name(
            f"{target.name}.{timestamp}.before-structured-research.bak"
        )

        shutil.copy2(target, backup)
        target.write_text(updated, encoding="utf-8")

        print(f"Updated: {target}")
        print(f"Backup:  {backup}")

    print("Structured organisation research upgrade applied.")


if __name__ == "__main__":
    main()