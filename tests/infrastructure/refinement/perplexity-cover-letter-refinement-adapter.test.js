import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPerplexityCoverLetterRefinementAdapter
} from '../../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';

const request = {
  draftPlainText: 'Original draft',
  jobDescriptionSummary: 'Delivery role',
  selectedCvHighlights: ['Led delivery programmes'],
  companyValues: ['Customer value'],
  instructions: 'Improve clarity'
};

test('requires an API key', () => {
  assert.throws(
    () => createPerplexityCoverLetterRefinementAdapter({ apiKey: '' }),
    /A Perplexity API key is required\./
  );
});

test('sends only the supplied refinement context and maps a proposed draft', async () => {
  let captured;

  const fetchImpl = async (url, options) => {
    captured = { url, options };

    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '  Proposed improved draft.  '
          }
        }]
      })
    };
  };

  const adapter = createPerplexityCoverLetterRefinementAdapter({
    apiKey: 'test-key',
    fetchImpl
  });

  const result = await adapter.refine(request);

  assert.equal(captured.url, 'https://api.perplexity.ai/chat/completions');
  assert.equal(captured.options.headers.authorization, 'Bearer test-key');

  const body = JSON.parse(captured.options.body);
  assert.equal(body.model, 'sonar');
  assert.match(body.messages[1].content, /Original draft/);
  assert.match(body.messages[1].content, /Delivery role/);
  assert.match(body.messages[1].content, /Led delivery programmes/);
  assert.match(body.messages[1].content, /Customer value/);
  assert.match(body.messages[1].content, /Improve clarity/);

  assert.equal(result.proposedDraft, 'Proposed improved draft.');
  assert.equal(result.provider, 'perplexity');
  assert.deepEqual(result.citations, []);
  assert.deepEqual(result.review, {
    strengths: [],
    risks: [],
    unsupportedClaims: [],
    suggestedChanges: []
  });
});

test('maps network failure to a controlled provider error', async () => {
  const adapter = createPerplexityCoverLetterRefinementAdapter({
    apiKey: 'test-key',
    fetchImpl: async () => {
      throw new Error('Network unavailable');
    }
  });

  await assert.rejects(
    () => adapter.refine(request),
    /Perplexity cover-letter refinement is unavailable\./
  );
});

test('maps HTTP failure to a controlled provider error', async () => {
  const adapter = createPerplexityCoverLetterRefinementAdapter({
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: false, json: async () => ({}) })
  });

  await assert.rejects(
    () => adapter.refine(request),
    /Perplexity cover-letter refinement is unavailable\./
  );
});

test('maps an unusable response to a controlled provider error', async () => {
  const adapter = createPerplexityCoverLetterRefinementAdapter({
    apiKey: 'test-key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [] })
    })
  });

  await assert.rejects(
    () => adapter.refine(request),
    /Perplexity cover-letter refinement returned no usable draft\./
  );
});