import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestAdvertiserRelationship, effectiveRelationship, advertiserKey} from '../../../src/domain/cover-letter/advertiser-relationship-evidence.js';

test('agency wording and an agency poster point to a recruitment intermediary with high confidence', () => {
  const s = suggestAdvertiserRelationship({organisationName: 'Example Bank', advertiserName: 'Harvey Nash', jobDescriptionText: 'Our client, a leading bank, is looking for a Delivery Lead.'});
  assert.equal(s.relationship, 'recruitment-intermediary');
  assert.equal(s.confidence, 'high');
  assert.ok(s.reasons.some(r => /our client/.test(r.text)));
  assert.ok(s.reasons.some(r => /looks like a recruitment agency/.test(r.text)));
});

test('the organisation posting its own advert with in-house talent points to the direct employer', () => {
  const s = suggestAdvertiserRelationship({organisationName: 'Example Insurance Ltd', advertiserName: 'Example Insurance', jobDescriptionText: 'Join our team and live our values.',
    posters: [{name: 'A Person', headline: 'Talent Acquisition Partner at Example Insurance'}]});
  assert.equal(s.relationship, 'direct-employer');
  assert.equal(s.confidence, 'high');
});

test('weak or conflicting evidence stays unknown, and an earlier choice for the advertiser counts strongly', () => {
  assert.equal(suggestAdvertiserRelationship({organisationName: 'Acme', jobDescriptionText: 'Deliver programmes.'}).relationship, 'unknown');
  const mixed = suggestAdvertiserRelationship({organisationName: 'Acme', advertiserName: 'Other Co', jobDescriptionText: 'Join our team.'});
  assert.equal(mixed.confidence, 'low');
  const remembered = suggestAdvertiserRelationship({organisationName: 'Acme', advertiserName: 'Other Co', pastChoice: {relationship: 'recruitment-intermediary', name: 'Other Co'}});
  assert.equal(remembered.relationship, 'recruitment-intermediary');
  assert.ok(remembered.reasons.some(r => /You chose/.test(r.text)));
  assert.equal(advertiserKey('Example Insurance Ltd'), advertiserKey('example insurance'));
});

test('an explicit choice always wins; otherwise only a confident suggestion is preselected', () => {
  const agency = {relationship: 'recruitment-intermediary', confidence: 'high'};
  assert.deepEqual(effectiveRelationship({advertiserRelationship: 'unknown', advertiserRelationshipChosen: true}, agency), {relationship: 'unknown', source: 'chosen'});
  assert.deepEqual(effectiveRelationship({advertiserRelationship: 'direct-employer'}, agency), {relationship: 'direct-employer', source: 'saved'});
  assert.deepEqual(effectiveRelationship({advertiserRelationship: 'unknown'}, agency), {relationship: 'recruitment-intermediary', source: 'suggested'});
  assert.deepEqual(effectiveRelationship({advertiserRelationship: 'unknown'}, {relationship: 'direct-employer', confidence: 'low'}), {relationship: 'unknown', source: 'default'});
  assert.deepEqual(effectiveRelationship({}, null), {relationship: 'direct-employer', source: 'default'}, 'unchanged legacy default');
});
