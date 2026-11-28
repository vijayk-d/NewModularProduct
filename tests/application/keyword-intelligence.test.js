import test from 'node:test';
import assert from 'node:assert/strict';
import {keywordReport, priorityKeywordsFrom, createLetterKeywordService} from '../../src/application/letter-keywords.js';
import {localAdvertRequirements, relatedFor, isFillerPhrase} from '../../src/domain/keywords/advert-requirements.js';
import {cvEvidenceLines} from '../../src/domain/cv/cv-facts.js';
import {createMemoryAdvertRequirementsStore} from '../../src/infrastructure/advert-requirements-file.js';

// Synthetic advert, CV and letter only. No network: the AI reader is a fake.
const ADVERT = ['Essential:', 'Project management and agile delivery experience.', 'Must hold SC clearance or be eligible for the TS clearance process.',
  'Enable immediate engagement to the highest standards.', 'Workspace improvement programme. Send your CV.', 'Strong stakeholder management and team leadership.',
  'Experience in the defence sector.', 'Desirable: PMP, AWS.'].join('\n');
const CV = ['Programme Manager, EXAMPLE LTD (2019 to 2025)', 'PRINCE2 Practitioner and Professional Scrum Master (PSM I).',
  'Ran Scrum for five teams, with sprint planning and retrospectives.', 'Line managed a team of eight delivery leads.',
  'Eligible for SC clearance: previously SC cleared (to Sep 2025); UK resident for 17 years.'].join('\n');
const by = list => Object.fromEntries(list.map(t => [t.term, t]));

test('the built-in reader drops advert filler and reads TS and SC as one security clearance requirement', () => {
  const r = by(localAdvertRequirements(ADVERT));
  assert.equal(r['Security clearance'].category, 'eligibility');
  assert.equal(r['Security clearance'].priority, 'essential');
  for (const junk of ['TS', 'Clearance process', 'Enable immediate engagement', 'Highest standards', 'Workspace improvement', 'CV']) assert.equal(r[junk], undefined, junk);
  for (const t of ['Project management', 'Agile', 'Stakeholder management', 'Team leadership', 'Defence']) assert.equal(r[t].priority, 'essential', t);
  assert.equal(r.PMP.priority, 'desirable');
  assert.ok(isFillerPhrase('highest standards') && !isFillerPhrase('data migration'));
});

test('the whole CV is read: PRINCE2 covers PMP as an equivalent, Scrum shows Agile, line management backs team leadership, the clearance line is quoted', () => {
  const report = keywordReport({requirements: localAdvertRequirements(ADVERT), letterText: 'I lead delivery for complex programmes.', evidence: cvEvidenceLines(CV)});
  const t = by(report.terms);
  assert.deepEqual(t.PMP.via, {term: 'PRINCE2', relation: 'equivalent'});
  assert.deepEqual(t.Agile.via, {term: 'Scrum', relation: 'shows'});
  assert.match(t['Team leadership'].evidence.text, /Line managed a team/, 'line management is a built-in way of writing team leadership');
  assert.match(t['Project management'].evidence.text, /PRINCE2/);
  assert.match(t['Security clearance'].evidence.text, /^Eligible for SC clearance/);
  const steps = report.nextSteps.join('\n');
  assert.match(steps, /^Security clearance: the advert asks for it\. Selected CV: “Eligible for SC clearance/m, 'eligibility comes first, quoting your own line');
  assert.match(steps, /PMP \(Desirable\): you hold PRINCE2, not PMP\. Name PRINCE2 as your equivalent.*never claim PMP/);
  assert.match(steps, /Add Agile \(Essential\) to the strong-fit paragraph: your evidence shows it through Scrum/);
  assert.ok(!t.Defence.supported, 'nothing shows defence work');
  const priority = priorityKeywordsFrom(report, 10).map(p => p.term).join(' | ');
  assert.ok(!/(^|\| )PMP/.test(priority), 'polishing is never asked to write PMP as yours');
});

test('an equivalent already in the letter counts as covered; a sector the evidence does not show is flagged as a claim to check', () => {
  const letter = 'As a PRINCE2 Practitioner I have led agile teams across defence programmes.';
  const report = keywordReport({requirements: localAdvertRequirements(ADVERT), letterText: letter, evidence: cvEvidenceLines(CV)});
  const t = by(report.terms);
  assert.equal(t.PMP.inLetter, true);
  assert.equal(t.PMP.via.relation, 'equivalent');
  assert.equal(t.Defence.inLetter, true);
  assert.equal(t.Defence.unbackedClaim, true);
  assert.equal(t.Agile.unbackedClaim, false, 'only certifications, sectors, eligibility and qualifications are checked as claims');
  assert.match(report.nextSteps.join('\n'), /Check: the letter mentions Defence, but your CV and evidence do not show it/);
  assert.equal(report.summary.unbackedClaims, 1);
});

test('missing clearance with no CV line warns you to check eligibility; related terms come from the built-in vocabulary', () => {
  const report = keywordReport({requirements: localAdvertRequirements(ADVERT), letterText: '', evidence: []});
  assert.match(report.nextSteps.join('\n'), /Security clearance is required, and your CV and evidence do not mention it\. Check you are eligible/);
  assert.ok(relatedFor('pmp').some(r => r.term === 'PRINCE2' && r.aliases.includes('PRINCE2 Practitioner')));
  assert.deepEqual(relatedFor('Unknown thing'), []);
});

test('a failed AI reading is read again only when you ask, once, and the selected CV is used as evidence', async () => {
  const store = createMemoryAdvertRequirementsStore();
  let reads = 0, fail = true;
  const reader = {available: true, async read() { reads++; if (fail) throw Object.assign(new Error('timeout'), {code: 'T'}); return {model: 'm', requirements: [{term: 'PMP', category: 'certification', priority: 'essential', aliases: []}]}; }};
  const reviews = new Map([['r1', {formData: {jobDescriptionText: ADVERT}}]]);
  const service = createLetterKeywordService({reviews, store, reader, cvText: async () => CV});
  const first = await service.check('r1', {letterText: 'Hello'});
  assert.equal(first.source, 'local');
  assert.equal(reads, 1);
  const second = await service.check('r1', {letterText: 'Hello'});
  assert.equal(reads, 1, 'never retried automatically');
  assert.equal(second.canReadAgain, true);
  fail = false;
  const again = await service.check('r1', {letterText: 'Hello', readAdvertAgain: true});
  assert.equal(reads, 2);
  assert.equal(again.source, 'ai');
  assert.equal(by(again.terms).PMP.via.term, 'PRINCE2', 'the CV text backs the equivalent');
  await service.check('r1', {letterText: 'Hello', readAdvertAgain: true});
  assert.equal(reads, 2, 'a saved AI reading is never paid for again');
});
