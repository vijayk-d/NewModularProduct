import test from 'node:test';
import assert from 'node:assert/strict';

import { researchOrganization } from '../../src/application/research-organization.js';
import {
  createFakeCompanyResearchAdapter
} from '../../src/infrastructure/research/fake-company-research-adapter.js';

test('requires a company name', async () => {
  const adapter = createFakeCompanyResearchAdapter();

  await assert.rejects(
    () => researchOrganization({}, { companyResearchPort: adapter }),
    /A non-empty company name is required\./
  );
});

test('requires an injected company research port', async () => {
  await assert.rejects(
    () => researchOrganization({ companyName: 'Example Ltd' }, {}),
    /A companyResearchPort with a research function is required\./
  );
});

test('sends a normalized research request and returns a normalized result', async () => {
  const calls = [];
  const adapter = createFakeCompanyResearchAdapter({
    calls,
    result: {
      status: 'found',
      companyValues: [' Customer value ', '', 'continuous improvement'],
      summary: ' Customer-focused organisation. ',
      sources: [{ title: ' About ', url: ' https://example.com/about ' }],
      researchedAt: '2026-10-04T12:00:00.000Z',
      provider: 'fake-company-research'
    }
  });

  const result = await researchOrganization({
    companyName: ' Example Ltd ',
    companyUrl: ' https://example.com ',
    jobDescriptionSummary: ' Project delivery role. ',
    forceRefresh: true
  }, { companyResearchPort: adapter });

  assert.deepEqual(calls, [{
    companyName: 'Example Ltd',
    companyUrl: 'https://example.com',
    jobDescriptionSummary: 'Project delivery role.',
    forceRefresh: true
  }]);

  assert.equal(result.status, 'found');
  assert.deepEqual(result.companyValues, ['Customer value', 'continuous improvement']);
  assert.equal(result.summary, 'Customer-focused organisation.');
  assert.deepEqual(result.sources, [{
    title: 'About',
    url: 'https://example.com/about'
  }]);
  assert.equal(result.provider, 'fake-company-research');
});

test('rejects a non-boolean forceRefresh value', async () => {
  const adapter = createFakeCompanyResearchAdapter();

  await assert.rejects(
    () => researchOrganization({
      companyName: 'Example Ltd',
      forceRefresh: 'yes'
    }, { companyResearchPort: adapter }),
    /forceRefresh must be a boolean\./
  );
});

test('converts an adapter failure into a controlled research error', async () => {
  const adapter = createFakeCompanyResearchAdapter({
    error: new Error('Provider unavailable')
  });

  const result = await researchOrganization(
    { companyName: 'Example Ltd' },
    { companyResearchPort: adapter }
  );

  assert.equal(result.status, 'error');
  assert.equal(
    result.error,
    'Company research is currently unavailable.'
  );
  assert.deepEqual(result.companyValues, []);
});
