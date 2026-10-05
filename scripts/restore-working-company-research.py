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
            fail(f"Missing target: {target}")

    original_adapter = ADAPTER.read_text(encoding="utf-8")
    original_tests = TESTS.read_text(encoding="utf-8")

    if "https://api.perplexity.ai/chat/completions" in original_adapter:
        print("The company research adapter already uses Chat Completions.")
        print("No changes were made.")
        return

    if "https://api.perplexity.ai/v1/agent" not in original_adapter:
        fail(
            "Expected Agent API endpoint was not found. "
            "Refusing to overwrite an unknown adapter version."
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
      return {
        title,
        url: ''
      };
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

function parseStructuredResearch(text = '') {
  const content = normalizeText(text);

  const match = content.match(
    /<organisation-research>\s*([\s\S]*?)\s*<\/organisation-research>/i
  );

  if (!match) {
    return {
      summary: content,
      companyValues: []
    };
  }

  try {
    const parsed = JSON.parse(match[1]);

    return {
      summary: normalizeText(parsed?.summary) || content,
      companyValues: normalizeCompanyValues(parsed?.companyValues)
    };
  } catch {
    return {
      summary: content,
      companyValues: []
    };
  }
}

export function createPerplexityCompanyResearchAdapter({
  apiKey,
  model = 'sonar',
  fetchImpl = fetch,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('A Perplexity API key is required.');
  }

  return {
    async research(request) {
      const prompt = [
        `Research the organisation "${request.companyName}".`,
        request.companyUrl
          ? `Official website: ${request.companyUrl}.`
          : '',
        request.jobDescriptionSummary
          ? `Relevant role context: ${request.jobDescriptionSummary}.`
          : '',
        'Use web sources and prefer the official organisation website.',
        'Identify only explicitly stated organisation values.',
        'Do not infer values from marketing language.',
        'Return a short factual summary plus values in exactly this tagged JSON block:',
        '<organisation-research>',
        '{"summary":"short factual summary","companyValues":["Value 1","Value 2"]}',
        '</organisation-research>',
        'The companyValues array must contain 0 to 8 concise values.',
        'If no explicit values are found, return an empty companyValues array.',
        'After the tagged block, list only sources actually used.',
        'Do not make claims about candidates or individuals.'
      ].filter(Boolean).join('\n\n');

      let response;

      try {
        response = await fetchImpl(
          'https://api.perplexity.ai/chat/completions',
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${apiKey}`,
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: 'system',
                  content:
                    'You research organisations and return factual, ' +
                    'source-backed information. Never invent facts or ' +
                    'make claims about candidates.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ]
            })
          }
        );
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

      const message = payload?.choices?.[0]?.message?.content;

      if (typeof message !== 'string' || !message.trim()) {
        throw new Error(
          'Perplexity organisation research returned no usable summary.'
        );
      }

      const citations = Array.isArray(payload.citations)
        ? payload.citations
        : Array.isArray(payload.search_results)
          ? payload.search_results
          : [];

      const sources = citations
        .map((citation) => {
          if (typeof citation === 'string') {
            return {
              title: citation,
              url: citation
            };
          }

          return normalizeSource(citation);
        })
        .filter(Boolean);

      const research = parseStructuredResearch(message);

      return {
        status: 'found',
        companyValues: research.companyValues,
        summary: research.summary,
        sources,
        researchedAt: now(),
        provider: 'perplexity'
      };
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
  companyUrl: 'https://example.com',
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

test('requires an API key', () => {
  assert.throws(
    () => createPerplexityCompanyResearchAdapter({ apiKey: '' }),
    /A Perplexity API key is required\./
  );
});

test('uses working Chat Completions and maps structured company values', async () => {
  let captured;

  const adapter = createPerplexityCompanyResearchAdapter({
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      captured = { url, options };

      return createJsonResponse({
        choices: [{
          message: {
            content: [
              '<organisation-research>',
              '{"summary":"Example Ltd is delivery-focused.","companyValues":["Customer outcomes","Continuous improvement"]}',
              '</organisation-research>',
              '',
              'Sources used: https://example.com/about'
            ].join('\n')
          }
        }],
        citations: [
          {
            title: 'About Example',
            url: 'https://example.com/about'
          },
          'https://example.com/news'
        ]
      });
    },
    now: () => '2026-10-04T12:00:00.000Z'
  });

  const result = await adapter.research(request);

  assert.equal(
    captured.url,
    'https://api.perplexity.ai/chat/completions'
  );
  assert.equal(captured.options.method, 'POST');
  assert.equal(
    captured.options.headers.authorization,
    'Bearer test-key'
  );

  const body = JSON.parse(captured.options.body);

  assert.equal(body.model, 'sonar');
  assert.match(body.messages[1].content, /Example Ltd/);
  assert.match(body.messages[1].content, /https:\/\/example\.com/);
  assert.match(body.messages[1].content, /Delivery role/);
  assert.match(
    body.messages[1].content,
    /<organisation-research>/
  );

  assert.equal(result.status, 'found');
  assert.equal(result.summary, 'Example Ltd is delivery-focused.');
  assert.deepEqual(result.companyValues, [
    'Customer outcomes',
    'Continuous improvement'
  ]);
  assert.equal(result.provider, 'perplexity');
  assert.equal(result.researchedAt, '2026-10-04T12:00:00.000Z');
  assert.deepEqual(result.sources, [
    {
      title: 'About Example',
      url: 'https://example.com/about'
    },
    {
      title: 'https://example.com/news',
      url: 'https://example.com/news'
    }
  ]);
});

test('falls back safely when structured values are absent or invalid', async (t) => {
  await t.test('no tagged JSON block', async () => {
    const adapter = createPerplexityCompanyResearchAdapter({
      apiKey: 'test-key',
      fetchImpl: async () => createJsonResponse({
        choices: [{
          message: {
            content: 'Example Ltd values customer outcomes.'
          }
        }]
      })
    });

    const result = await adapter.research(request);

    assert.equal(
      result.summary,
      'Example Ltd values customer outcomes.'
    );
    assert.deepEqual(result.companyValues, []);
  });

  await t.test('invalid tagged JSON', async () => {
    const adapter = createPerplexityCompanyResearchAdapter({
      apiKey: 'test-key',
      fetchImpl: async () => createJsonResponse({
        choices: [{
          message: {
            content:
              '<organisation-research>{not-json}</organisation-research>'
          }
        }]
      })
    });

    const result = await adapter.research(request);

    assert.deepEqual(result.companyValues, []);
  });
});

test('deduplicates and trims parsed company values', async () => {
  const adapter = createPerplexityCompanyResearchAdapter({
    apiKey: 'test-key',
    fetchImpl: async () => createJsonResponse({
      choices: [{
        message: {
          content: [
            '<organisation-research>',
            '{"summary":"Example summary.","companyValues":[" Customer outcomes ","customer outcomes","","Continuous improvement"]}',
            '</organisation-research>'
          ].join('\n')
        }
      }]
    })
  });

  const result = await adapter.research(request);

  assert.deepEqual(result.companyValues, [
    'Customer outcomes',
    'Continuous improvement'
  ]);
});

test('maps network, HTTP, and empty responses to controlled errors', async (t) => {
  await t.test('network failure', async () => {
    const adapter = createPerplexityCompanyResearchAdapter({
      apiKey: 'test-key',
      fetchImpl: async () => {
        throw new Error('Network unavailable');
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

  await t.test('empty response', async () => {
    const adapter = createPerplexityCompanyResearchAdapter({
      apiKey: 'test-key',
      fetchImpl: async () => createJsonResponse({
        choices: []
      })
    });

    await assert.rejects(
      () => adapter.research(request),
      /Perplexity organisation research returned no usable summary\./
    );
  });
});
'''

    updated_adapter = adapter.rstrip() + "\n"
    updated_tests = tests.rstrip() + "\n"

    diffs = [
        ''.join(
            difflib.unified_diff(
                original_adapter.splitlines(keepends=True),
                updated_adapter.splitlines(keepends=True),
                fromfile=str(ADAPTER),
                tofile=f'{ADAPTER} (restored Chat Completions)',
                n=2
            )
        ),
        ''.join(
            difflib.unified_diff(
                original_tests.splitlines(keepends=True),
                updated_tests.splitlines(keepends=True),
                fromfile=str(TESTS),
                tofile=f'{TESTS} (restored research tests)',
                n=2
            )
        )
    ]

    if not APPLY:
        print("Preview only: no files were changed.\n")
        print('\n'.join(diffs))
        print("\nApply with:")
        print(
            "  py .\\scripts\\restore-working-company-research.py --apply"
        )
        return

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    for target, updated in (
        (ADAPTER, updated_adapter),
        (TESTS, updated_tests)
    ):
        backup = target.with_name(
            f"{target.name}.{timestamp}.before-research-restore.bak"
        )

        shutil.copy2(target, backup)
        target.write_text(updated, encoding="utf-8")

        print(f"Updated: {target}")
        print(f"Backup:  {backup}")

    print("Working organisation research restored with structured-value parsing.")


if __name__ == "__main__":
    main()