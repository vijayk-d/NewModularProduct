import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceDraftingService} from '../../src/application/evidence-drafting.js';
import {buildEvidenceDraftApiRequest, createEvidenceDraftWriter, EVIDENCE_DRAFT_INSTRUCTIONS} from '../../src/infrastructure/refinement/perplexity-evidence-draft-adapter.js';
import {createAssignmentEvidenceStore} from '../../src/infrastructure/applications/sqlite-assignment-evidence.js';

// Synthetic CV and people only; the writer is a fake, so no network call is made.
const CV = 'Delivery Lead at EXAMPLE LTD. Led a 12-person agile team through a platform migration. Introduced weekly risk reviews with suppliers and stakeholders. Coached Scrum Masters and product owners across three squads. '.repeat(2);
function setup({available = true, draft} = {}) {
  const library = createAssignmentEvidenceStore({filePath: ':memory:'});
  library.save({kind: 'assignment', id: 'a', expectedRevision: 0, data: {title: 'Platform programme', employer: 'EXAMPLE LTD', role: 'Delivery Lead'}});
  const calls = [];
  const writer = {available, buildRequest: buildEvidenceDraftApiRequest, async write(request, model) { calls.push({request, model}); return {draft: draft || {title: 'Supplier recovery', situation: 'Two suppliers slipped.', actions: 'I introduced weekly risk reviews.', outcomes: 'The migration landed, saving 40% of costs.', approvedWording: 'I led a 12-person agile team through a platform migration.'}, notes: 'Add a measure for the result', model}; }};
  const service = createEvidenceDraftingService({library, writer, cvChoices: async () => [{code: 'DL', name: 'Delivery Lead'}], cvTextFor: async code => code === 'DL' ? CV : ''});
  return {library, calls, service, close: () => library.close()};
}
const body = {assignmentId: 'a', cvCode: 'DL', scenario: {title: '', situation: 'Supplier delays', actions: '', outcomes: '', approvedWording: ''}};

test('estimate is free, then one paid draft only with the matching cost proof', async () => {
  const f = setup();
  try {
    const est = await f.service.estimate(body);
    assert.equal(f.calls.length, 0, 'the estimate makes no call');
    assert.match(est.costProof, /^[a-f0-9]{64}$/);
    await assert.rejects(f.service.write({...body, confirmedCostProof: 'stale'}), /Estimate again; nothing was sent/);
    await assert.rejects(f.service.write({...body, scenario: {...body.scenario, situation: 'changed'}, confirmedCostProof: est.costProof}), /changed since the estimate/);
    assert.equal(f.calls.length, 0);
    const r = await f.service.write({...body, confirmedCostProof: est.costProof});
    assert.equal(f.calls.length, 1);
    assert.equal(r.draft.approvedWording, 'I led a 12-person agile team through a platform migration.');
    assert.deepEqual(r.unsupportedFigures, ['40%'], 'a figure not in the CV or notes is flagged; 12 is in the CV');
    const sent = f.calls[0].request;
    assert.equal(sent.assignment.employer, 'EXAMPLE LTD');
    assert.equal(sent.scenario.situation, 'Supplier delays', 'your own notes are sent to build on');
    assert.ok(sent.cvText.startsWith('Delivery Lead'));
  } finally { f.close(); }
});

test('drafting refuses without a CV, with AI off, or for an unknown assignment, and never retries', async () => {
  const f = setup();
  try {
    await assert.rejects(f.service.estimate({...body, cvCode: ''}), /Choose the CV/);
    await assert.rejects(f.service.estimate({...body, cvCode: 'NONE'}), /no readable text/);
    await assert.rejects(f.service.estimate({...body, assignmentId: 'missing'}), e => e.statusCode === 404);
  } finally { f.close(); }
  const off = setup({available: false});
  try {
    const est = await off.service.estimate(body);
    assert.equal(est.available, false);
    assert.match(est.message, /ENABLE_COVER_LETTER_REFINEMENT/);
    await assert.rejects(off.service.write({...body, confirmedCostProof: est.costProof}), /off/);
    assert.equal(off.calls.length, 0);
  } finally { off.close(); }
  const failing = setup();
  try {
    let n = 0;
    const service = createEvidenceDraftingService({library: failing.library, writer: {available: true, buildRequest: buildEvidenceDraftApiRequest, async write() { n++; throw Object.assign(new Error('The drafting service could not be reached.'), {code: 'EVIDENCE_DRAFT_NETWORK_FAILED'}); }}, cvTextFor: async () => CV});
    const est = await service.estimate(body);
    await assert.rejects(service.write({...body, confirmedCostProof: est.costProof}), /no retry was made/);
    assert.equal(n, 1);
  } finally { failing.close(); }
});

test('the instructions keep wording creative but facts evidence-led, and the adapter makes no call when off', async () => {
  assert.match(EVIDENCE_DRAFT_INSTRUCTIONS, /creative in wording only, never in facts/);
  assert.match(EVIDENCE_DRAFT_INSTRUCTIONS, /Never add employers, clients, sectors, public-sector bodies/);
  assert.match(EVIDENCE_DRAFT_INSTRUCTIONS, /Never estimate a number/);
  const req = buildEvidenceDraftApiRequest({assignment: {title: 'A'}, scenario: {}, cvText: 'cv'}, 'm');
  assert.equal(req.response_format.json_schema.strict, true);
  assert.ok(!('tools' in req), 'no web search');
  let fetched = 0;
  const writer = createEvidenceDraftWriter({apiKey: '', enabled: true, fetchImpl: async () => { fetched++; }});
  assert.equal(writer.available, false);
  await assert.rejects(writer.write({assignment: {}, scenario: {}, cvText: ''}, 'm'), /off/);
  assert.equal(fetched, 0);
});
