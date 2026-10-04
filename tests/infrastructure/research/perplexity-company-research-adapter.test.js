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

test('requires an API key', () => {
  assert.throws(
    () => createPerplexityCompanyResearchAdapter({ apiKey: '' }),
    /A Perplexity API key is required\./
  );
});

test('sends a minimised request and maps a successful response', async () => {
  let captured;

  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: ' Example Ltd values customer outcomes. '
          }
        }],
        citations: [
          { title: 'About Example', url: 'https://example.com/about' },
          'https://example.com/news'
        ]
      })
    };
  };

  const adapter = createPerplexityCompanyResearchAdapter({
    apiKey: 'test-key',
    fetchImpl,
    now: () => '2026-10-04T12:00:00.000Z'
  });

  const result = await adapter.research(request);

  assert.equal(captured.url, 'https://api.perplexity.ai/chat/completions');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.authorization, 'Bearer test-key');

  const body = JSON.parse(captured.options.body);
  assert.equal(body.model, 'sonar');
  assert.match(body.messages[1].content, /Example Ltd/);
  assert.match(body.messages[1].content, /https:\/\/example\.com/);
  assert.match(body.messages[1].content, /Delivery role/);

  assert.equal(result.status, 'found');
  assert.equal(result.summary, 'Example Ltd values customer outcomes.');
  assert.equal(result.provider, 'perplexity');
  assert.equal(result.researchedAt, '2026-10-04T12:00:00.000Z');
  assert.deepEqual(result.sources, [
    { title: 'About Example', url: 'https://example.com/about' },
    { title: 'https://example.com/news', url: 'https://example.com/news' }
  ]);
});

test('maps network failure to a controlled provider error', async () => {
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

test('maps HTTP failure to a controlled provider error', async () => {
  const adapter = createPerplexityCompanyResearchAdapter({
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: false, json: async () => ({}) })
  });

  await assert.rejects(
    () => adapter.research(request),
    /Perplexity organisation research is unavailable\./
  );
});

test('maps an empty response to a controlled provider error', async () => {
  const adapter = createPerplexityCompanyResearchAdapter({
    apiKey: 'test-key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [] })
    })
  });

  await assert.rejects(
    () => adapter.research(request),
    /Perplexity organisation research returned no usable summary\./
  );
});