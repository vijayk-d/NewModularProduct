import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createLocalServer} from '../../../src/interfaces/http/create-local-server.js';
import {createDurableReviewStore, createMemoryReviewRepository} from '../../../src/application/durable-review-store.js';
import {createWorkflowAutomationStore} from '../../../src/infrastructure/applications/sqlite-workflow-automation-store.js';
import {createOrganisationResearchService} from '../../../src/application/organisation-research-cache.js';

async function app(t) {
  const reviews = createDurableReviewStore(createMemoryReviewRepository());
  const calls = [];
  const domains = {'Example Ltd': 'example-ltd.co.uk', 'Other Org': 'other-org.com'};
  const research = async request => { calls.push(request.companyName); return {status: 'found', provider: 'Perplexity', researchedAt: '2026-11-16T10:00:00.000Z', summary: 'Synthetic organisation summary', companyValues: ['Integrity'], sources: [], emailDomainResearch: {emailDomain: domains[request.companyName] || 'fresh-find.com', confidence: 'high'}}; };
  const service = createOrganisationResearchService({store: createWorkflowAutomationStore({filePath: ':memory:'}), research});
  const cv = {role_code: 'PM', role_name: 'Project Manager', local_path: 'PM/fixture.pdf'};
  const prepared = {jobDescription: {role: 'Delivery Manager'}, coverLetter: {subject: 'S', plainText: 'Dear Hiring Manager,\n\nI led delivery.\n\nKind regards,\nTest'}, recommendation: {bestCv: cv, alternativeCv: null, ats: {score: 70}}, rankedCvs: [{cv, ats: {score: 70, matchedKeywords: [], missingKeywords: []}}]};
  const server = createLocalServer({applicationReviewStore: reviews, prepareApplication: async () => prepared, researchOrganization: research, organisationResearchService: service,
    recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = 'http://127.0.0.1:' + server.address().port;
  const create = async organisationName => {
    const r = await fetch(url + '/applications', {method: 'POST', body: new URLSearchParams({jobTitle: 'Delivery Manager', organisationName, jobDescriptionText: 'Lead delivery.', jobAdvertLink: 'https://business.test/job', advertiserRelationship: 'unknown'})});
    const html = await r.text();
    return {status: r.status, html, id: html.match(/name="reviewId"\s+value="([^"]+)"/)?.[1]};
  };
  return {url, reviews, calls, create};
}

test('creating the first application researches the organisation once; the next one reuses it', async t => {
  const a = await app(t);
  const first = await a.create('Example Ltd');
  assert.equal(first.status, 200);
  assert.deepEqual(a.calls, ['Example Ltd']);
  assert.match(first.html, /Researched automatically when this application was created/);
  assert.equal(a.reviews.get(first.id).research.status, 'found');

  const second = await a.create('Example Limited');
  assert.deepEqual(a.calls, ['Example Ltd'], 'no second paid call');
  assert.match(second.html, /Reused from an earlier application to this organisation/);

  const reload = await fetch(a.url + '/applications/' + first.id);
  assert.match(await reload.text(), /Synthetic organisation summary/);
  assert.deepEqual(a.calls, ['Example Ltd'], 'reloading makes no paid call');
});

test('a domain found by research replaces the old one and is saved on the application', async t => {
  const a = await app(t);
  const first = await a.create('Example Ltd');
  assert.equal(a.reviews.get(first.id).formData.emailDomain, 'example-ltd.co.uk');
  assert.match(first.html, /id="email-domain-input"[^>]*value="example-ltd\.co\.uk"/s);
  assert.match(first.html, /data-manual="true"/);

  const other = await a.create('Other Org');
  assert.equal(a.reviews.get(other.id).formData.emailDomain, 'other-org.com', 'a new organisation does not keep the old domain');

  const review = a.reviews.get(first.id);
  a.reviews.set(first.id, {...review, formData: {...review.formData, organisationName: 'Renamed Org', emailDomain: 'stale-old.com'}});
  const manual = await fetch(a.url + '/organisation-research', {method: 'POST', body: new URLSearchParams({reviewId: first.id})});
  const html = await manual.text();
  assert.equal(manual.status, 200);
  assert.equal(a.reviews.get(first.id).formData.emailDomain, 'fresh-find.com', 'manual research replaces the stale domain');
  assert.match(html, /value="fresh-find\.com"/);
});
