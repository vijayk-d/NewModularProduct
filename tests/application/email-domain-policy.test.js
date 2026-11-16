import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseBusinessDomain, adoptResearchedDomain} from '../../src/application/email-domain-policy.js';

test('normaliseBusinessDomain accepts business domains and rejects the rest', () => {
  assert.equal(normaliseBusinessDomain(' Twinstream.COM '), 'twinstream.com');
  for (const bad of ['', 'https://a.com', 'me@a.com', 'gmail.com', 'linkedin.com', 'nodot', 'a.c0m']) assert.equal(normaliseBusinessDomain(bad), '', bad);
});

test('a newly found domain replaces the old one', () => {
  const r = adoptResearchedDomain({organisationName: 'New Co', emailDomain: 'old.co.uk'}, {emailDomainResearch: {emailDomain: 'NewCo.com'}});
  assert.equal(r.changed, true);
  assert.equal(r.formData.emailDomain, 'newco.com');
  assert.equal(r.formData.organisationName, 'New Co');
});

test('no usable or no new domain leaves the form untouched', () => {
  const form = {emailDomain: 'same.com'};
  assert.equal(adoptResearchedDomain(form, {emailDomainResearch: {emailDomain: 'same.com'}}).changed, false);
  assert.equal(adoptResearchedDomain(form, {emailDomainResearch: {emailDomain: 'gmail.com'}}).changed, false);
  assert.equal(adoptResearchedDomain(form, {status: 'error'}).formData, form);
  assert.equal(adoptResearchedDomain(form, null).changed, false);
});
