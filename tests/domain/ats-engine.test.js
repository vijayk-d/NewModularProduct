import test from 'node:test';
import assert from 'node:assert/strict';
import {extractAtsTerms, matchAtsTerms, eligibilityChecks, advertSections, stem} from '../../src/domain/ats/ats-engine.js';
import {parseJobDescription} from '../../src/domain/job-description/parse-job-description.js';
import {scoreCvAgainstJd} from '../../src/domain/cv/score-cv-against-jd.js';
import {compareTailoredAts} from '../../src/domain/cv/tailored-cv-ats.js';

// Synthetic advert modelled on a real engineering project manager vacancy (invented organisation).
const JD = `About the job
Seaton, Northshire

Permanent, Hybrid

You will need to be able to pass security clearance for this role and have the right to work and reside in the UK.

The Role

The Senior Project Manager will lead complex projects through the full NPD lifecycle, ensuring delivery in line with the EML Project Delivery Process. You will apply strong governance, financial control, stakeholder engagement, and risk management.

What You’ll Be Doing

* Manage project budgets, forecasts, and cashflow, ensuring invoicing is completed in line with contract terms.
* Carry out risk and opportunity assessments, implementing contingency plans and benefits‑realisation actions where needed.
* Manage the change control process, including reviewing scope changes.
* Capture lessons learned and use them to support continuous improvement across future projects.

What We’re Looking For

* Experienced in taking NPD projects from concept through gated processes to market launch.
* Strong mechanical engineering background, with a focus on Design for Manufacture.
* Confident in developing and managing project plans, including timelines, budgets, and resources.
* Project Management Qualification, APM, Prince2. Why join us?
* Early finish on Fridays
* Competitive salary, Private Medical Insurance, Company Pension

About Us

Example Marine is a global engineering services company. We are a Disability Confident employer; click 'apply' now!`;

const terms = extractAtsTerms(JD, {organisationName: 'Example Marine Ltd'});
const names = terms.map(t => t.term);

test('location, contract, filler and company words are not job terms', () => {
  for (const noise of ['seaton', 'northshire', 'permanent', 'hybrid', 'need', 'able', 'pass', 'right', 'reside', 'full', 'strong', 'apply', 'ensuring', 'salary', 'pension', 'fridays', 'marine', 'EML', 'security', 'clearance'])
    assert.ok(!names.includes(noise), `${noise} should not be a job term`);
});

test('requirements and skill phrases become weighted terms', () => {
  for (const phrase of ['change control', 'lessons learned', 'continuous improvement', 'financial control', 'stakeholder engagement', 'risk management', 'design for manufacture', 'contingency plans', 'NPD'])
    assert.ok(names.includes(phrase), `${phrase} should be a job term`);
  const weight = name => terms.find(t => t.term === name).weight;
  assert.ok(weight('design for manufacture') > weight('governance'), 'a requirement phrase outranks an intro word');
  assert.ok(terms.length <= 40);
});

test('company and benefits sections carry no weight', () => {
  const lines = advertSections(JD).map(l => l.text);
  assert.ok(!lines.some(l => /Early finish|Pension|global engineering services|Disability Confident/.test(l)));
});

test('eligibility is reported separately and notes qualifications already shown in the CV', () => {
  const checks = eligibilityChecks(JD, 'PRINCE2 Practitioner since 2019.');
  assert.deepEqual(checks.map(c => c.id), ['security-clearance', 'right-to-work', 'qualification']);
  const qualification = checks.find(c => c.id === 'qualification');
  assert.equal(qualification.label, 'Project management qualification (APM, PRINCE2)');
  assert.deepEqual(qualification.inCv, ['PRINCE2']);
});

test('whole words with word forms: no part-word hits', () => {
  const list = [{term: 'hold', stems: [stem('hold')], weight: 1}, {term: 'cross', stems: [stem('cross')], weight: 1}, {term: 'budget', stems: [stem('budget')], weight: 1}, {term: 'manage', stems: [stem('manage')], weight: 1}];
  const r = matchAtsTerms(list, 'Engaged stakeholders across the business, managing budgets.');
  assert.deepEqual(r.matched, ['budget', 'manage']);
  assert.deepEqual(r.missing, ['hold', 'cross']);
});

test('a phrase found only as separate words gets half credit', () => {
  const list = [{term: 'risk management', stems: ['risk', stem('management')], weight: 2}];
  assert.equal(matchAtsTerms(list, 'Led risk management for the board.').score, 100);
  const apart = matchAtsTerms(list, 'Owned the risk log; management reporting.');
  assert.equal(apart.score, 50);
  assert.deepEqual(apart.partial, ['risk management']);
});

test('CV selection and the tailored CV check give the same keyword match for the same CV text', () => {
  const cvText = 'Senior Project Manager. Strong governance, risk management and stakeholder engagement. Managed project budgets and forecasts, change control and lessons learned. PRINCE2.';
  const parsed = parseJobDescription(JD, {role: 'Senior Project Manager', organisationName: 'Example Marine Ltd'});
  const selection = scoreCvAgainstJd(parsed, {role_code: 'PM', role_name: 'Project Manager', text: cvText});
  const tailored = compareTailoredAts({terms: parsed.atsTerms, baseLines: [cvText], originalLines: [], tailoredLines: []});
  assert.equal(selection.basis, 'cv-text');
  assert.ok(selection.keywordScore > 0);
  assert.equal(tailored.before.score, matchAtsTerms(parsed.atsTerms, cvText).score);
  assert.ok(selection.matchedKeywords.includes('change control'));
  assert.ok(selection.eligibility.some(e => e.id === 'security-clearance'));
});
