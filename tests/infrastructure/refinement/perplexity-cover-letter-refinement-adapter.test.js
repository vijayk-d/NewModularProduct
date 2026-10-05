import test from 'node:test';
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
