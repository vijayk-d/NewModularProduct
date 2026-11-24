// Click-saving automation rules: which contacts are ticked for you, when Find email domain starts by itself,
// and when a polished proposal may be used automatically (only when the owner ticked that choice).
import test from 'node:test';
import assert from 'node:assert/strict';
import {isSuggestedContactRole} from '../../../src/interfaces/http/contact-workflow-policy.js';
import {proposalAutoApplyEligible, renderEmailDomainResolution} from '../../../src/interfaces/http/rendering.js';

test('decision-maker and recruiter roles are suggested; juniors and former staff are not', () => {
  for (const role of ['Head of Talent Acquisition', 'Engineering Director', 'Senior Technical Recruiter', 'CTO', 'VP Delivery', 'Talent Partner', 'HR Business Partner'])
    assert.equal(isSuggestedContactRole(role), true, role);
  for (const role of ['Software Engineer', 'Graduate Recruiter', 'Assistant to the Director', 'Former Head of Delivery', '', undefined])
    assert.equal(isSuggestedContactRole(role), false, String(role));
});

test('Find email domain is marked to start by itself only after research found no domain and none is saved', () => {
  const auto = html => /data-auto-find="true"/.test(html);
  assert.equal(auto(renderEmailDomainResolution('r1', {}, {summary: 'Researched', emailDomainResearch: {emailDomain: null}})), true);
  assert.equal(auto(renderEmailDomainResolution('r1', {}, null)), false, 'not researched yet');
  assert.equal(auto(renderEmailDomainResolution('r1', {}, {emailDomainResearch: {emailDomain: 'acme.test'}})), false, 'research found one');
  assert.equal(auto(renderEmailDomainResolution('r1', {emailDomain: 'saved.test'}, {summary: 'x'})), false, 'already saved');
});

test('a proposal is eligible for automatic use only with no warnings, no length override and within the limit', () => {
  const paragraph = n => Array.from({length: n}, (_, i) => 'word' + i).join(' ') + '.';
  const draft = ['Dear Hiring Manager,', paragraph(90), paragraph(90), paragraph(90), paragraph(70), 'Kind regards,\nTest Candidate'].join('\n\n');
  const ok = {proposedDraft: draft, warnings: [], letterLengthMode: 'standard'};
  assert.equal(proposalAutoApplyEligible(ok, null, 500), true);
  assert.equal(proposalAutoApplyEligible({...ok, warnings: ['Check this figure']}, null, 500), false);
  assert.equal(proposalAutoApplyEligible(ok, {lengthCheckFailed: true}, 500), false);
  assert.equal(proposalAutoApplyEligible({...ok, proposedDraft: ['Dear Hiring Manager,', paragraph(40), 'Kind regards,'].join('\n\n')}, null, 500), false, 'quality warnings (too short)');
  assert.equal(proposalAutoApplyEligible({...ok, proposedDraft: ['Dear Hiring Manager,', paragraph(200), paragraph(200), paragraph(200), 'Kind regards,'].join('\n\n')}, null, 500), false, 'over the limit');
  assert.equal(proposalAutoApplyEligible(null, null, 500), false);
});
