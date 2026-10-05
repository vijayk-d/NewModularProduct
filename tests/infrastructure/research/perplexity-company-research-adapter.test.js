import test from 'node:test';
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
