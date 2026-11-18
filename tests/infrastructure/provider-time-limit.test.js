import test from 'node:test';
import assert from 'node:assert/strict';
import {providerTimeLimitMs, isTimeLimitError, timeLimitMessage, DEFAULT_PROVIDER_SECONDS} from '../../src/infrastructure/provider-time-limit.js';
import {createPerplexityCompanyResearchAdapter} from '../../src/infrastructure/research/perplexity-company-research-adapter.js';
import {createPerplexityCoverLetterRefinementAdapter} from '../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
import {createCvPolisher} from '../../src/infrastructure/refinement/perplexity-cv-polishing-adapter.js';
import {createPerplexityClient} from '../../src/infrastructure/perplexity-client.js';

// A provider that never answers: it only settles when the request's time limit fires.
function silentProvider() {
  const calls = [];
  const fetchImpl = (url, init = {}) => {
    calls.push(url);
    assert.ok(init.signal, 'every paid call carries a time-limit signal');
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), {once: true}));
  };
  return {calls, fetchImpl};
}

test('time limit comes from PERPLEXITY_TIMEOUT_SECONDS within 10–600 seconds, otherwise the default', () => {
  assert.equal(providerTimeLimitMs({}), DEFAULT_PROVIDER_SECONDS * 1000);
  assert.equal(providerTimeLimitMs({PERPLEXITY_TIMEOUT_SECONDS: '120'}), 120000);
  for (const bad of ['5', '601', 'abc', '']) assert.equal(providerTimeLimitMs({PERPLEXITY_TIMEOUT_SECONDS: bad}), DEFAULT_PROVIDER_SECONDS * 1000, bad);
  assert.match(timeLimitMessage('X', 90000), /within 90 seconds.*not retried.*may still charge/);
  assert.equal(isTimeLimitError(Object.assign(new Error('t'), {name: 'TimeoutError'})), true);
  assert.equal(isTimeLimitError(new Error('other')), false);
});

test('organisation research stops at the time limit, once, without retry', async () => {
  const p = silentProvider();
  const adapter = createPerplexityCompanyResearchAdapter({apiKey: 'synthetic', fetchImpl: p.fetchImpl, timeoutMs: 30});
  await assert.rejects(adapter.research({companyName: 'Example'}), e => e.code === 'PROVIDER_TIMEOUT' && /did not answer within/.test(e.message));
  assert.equal(p.calls.length, 1);
});

test('cover-letter polishing stops at the time limit with a REFINEMENT_TIMEOUT code', async () => {
  const p = silentProvider();
  const adapter = createPerplexityCoverLetterRefinementAdapter({apiKey: 'synthetic', fetchImpl: p.fetchImpl, timeoutMs: 30});
  await assert.rejects(adapter.refine({draftPlainText: 'Original', letterTone: 'consultative', jobAdvertLink: 'https://example.test/job', applicationJobTitle: 'Delivery Manager', organisationName: 'Example', candidateDisplayName: 'Test Person', maxWords: 400, jobDescriptionText: 'Delivery.'}),
    e => e.code === 'REFINEMENT_TIMEOUT' && /may still charge/.test(e.message));
  assert.equal(p.calls.length, 1);
});

test('CV polishing stops at the time limit with a CV_POLISH_TIMEOUT code', async () => {
  const p = silentProvider();
  const polisher = createCvPolisher({apiKey: 'synthetic', enabled: true, fetchImpl: p.fetchImpl, timeoutMs: 30});
  await assert.rejects(polisher.polish({jobTitle: '', organisationName: '', keywords: [], jobDescriptionText: '', profile: ['P'], achievements: null, roles: [], originalProfile: [], originalAchievements: null, selectedEvidence: []}, 'anthropic/claude-haiku-5-5'),
    e => e.code === 'CV_POLISH_TIMEOUT');
  assert.equal(p.calls.length, 1);
});

test('email-domain lookup stops at the time limit', async () => {
  const p = silentProvider();
  const client = createPerplexityClient({apiKey: 'synthetic', fetchImpl: p.fetchImpl, timeoutMs: 30});
  await assert.rejects(client.resolveEmailDomain({organisationName: 'Example', organisationUrl: '', linkedinUrl: ''}), e => e.code === 'PROVIDER_TIMEOUT');
  assert.equal(p.calls.length, 1);
});

test('a slow response body also stops at the time limit', async () => {
  const fetchImpl = async (url, init) => ({ok: true, status: 200, json: () => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), {once: true}))});
  const adapter = createPerplexityCompanyResearchAdapter({apiKey: 'synthetic', fetchImpl, timeoutMs: 30});
  await assert.rejects(adapter.research({companyName: 'Example'}), e => e.code === 'PROVIDER_TIMEOUT');
});
