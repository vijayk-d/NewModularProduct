import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {addCertifications, removeCertification, normaliseCertifications, mergeCertifications, MAX_CERTIFICATIONS} from '../../src/domain/cv/owner-certifications.js';
import {readOwnerCertifications, writeOwnerCertifications, CERTIFICATIONS_FILE} from '../../src/infrastructure/owner-certifications-file.js';
import {factLinesWithCertifications} from '../../src/domain/cv/cv-facts.js';
import {buildPolishingApiRequest} from '../../src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
import {buildEvidenceContract} from '../../src/application/cover-letter-quality-v2.js';
import {parseArguments, runCertifications} from '../../tools/maintenance/owner-certifications.mjs';
import {MAINTENANCE_COMMANDS} from '../../src/application/maintenance-commands.js';

const temp = t => { const d = mkdtempSync(path.join(tmpdir(), 'nmp-certs-')); t.after(() => rmSync(d, {recursive: true, force: true})); return d; };

test('names are trimmed and de-duplicated without regard to case; bad names refused', () => {
  assert.deepEqual(normaliseCertifications(['  PRINCE2  Practitioner. ', 'prince2 practitioner', '', 'SAFe SPC']), ['PRINCE2 Practitioner', 'SAFe SPC']);
  const r = addCertifications(['SAFe SPC'], ['safe spc', 'PMP']);
  assert.deepEqual(r.added, ['PMP']);
  assert.throws(() => addCertifications([], ['<script>']), /not allowed/);
  assert.throws(() => addCertifications([], ['x'.repeat(200)]), /too long/);
  assert.throws(() => addCertifications(Array.from({length: MAX_CERTIFICATIONS}, (_, i) => 'Cert ' + i), ['One more']), /At most/);
  assert.deepEqual(removeCertification(['PMP', 'SAFe SPC'], 'pmp'), {list: ['SAFe SPC'], removed: true});
  assert.deepEqual(mergeCertifications(['PRINCE2 Practitioner'], ['prince2 practitioner', 'CSM']), ['PRINCE2 Practitioner', 'CSM']);
});

test('file store: missing or damaged file reads as none; writes are a new JSON file only', t => {
  const dir = temp(t);
  assert.deepEqual(readOwnerCertifications(dir), []);
  writeFileSync(path.join(dir, CERTIFICATIONS_FILE), '{broken');
  assert.deepEqual(readOwnerCertifications(dir), []);
  writeOwnerCertifications(dir, ['PRINCE2 Practitioner', 'SAFe SPC']);
  assert.deepEqual(readOwnerCertifications(dir), ['PRINCE2 Practitioner', 'SAFe SPC']);
  assert.equal(JSON.parse(readFileSync(path.join(dir, CERTIFICATIONS_FILE), 'utf8')).version, 1);
});

test('maintenance command: add, list and remove; argument errors are clear', t => {
  const dir = temp(t);
  const add = runCertifications(parseArguments(['add', 'PRINCE2 Practitioner', 'SAFe SPC', '--state', dir]));
  assert.match(add.lines[0], /^ADDED: PRINCE2 Practitioner; SAFe SPC/);
  assert.match(runCertifications(parseArguments(['add', 'safe spc', '--state', dir])).lines[0], /NOTHING ADDED/);
  assert.deepEqual(runCertifications(parseArguments(['list', '--state', dir])).list, ['PRINCE2 Practitioner', 'SAFe SPC']);
  assert.match(runCertifications(parseArguments(['remove', 'SAFe SPC', '--state', dir])).lines[0], /^REMOVED/);
  assert.deepEqual(readOwnerCertifications(dir), ['PRINCE2 Practitioner']);
  assert.throws(() => parseArguments(['add']), /at least one/);
  assert.throws(() => parseArguments(['delete', 'x']), /list, add or remove/);
  const card = MAINTENANCE_COMMANDS.find(c => c.id === 'certifications-add');
  assert.match(card.command, /owner-certifications\.mjs add /);
  assert.equal(MAINTENANCE_COMMANDS.find(c => c.id === 'certifications-list').effect, 'Read-only');
});

test('CV facts include saved certifications even when the role CV lists only some', () => {
  const lines = factLinesWithCertifications('Certified ScrumMaster. 15+ years of experience.', ['PRINCE2 Practitioner', 'SAFe SPC']);
  const certs = lines.find(l => l.kind === 'certifications');
  assert.deepEqual(certs.items.slice(0, 2), ['PRINCE2 Practitioner', 'SAFe SPC']);
  assert.equal(certs.source, 'Saved certifications');
  assert.ok(lines.some(l => l.kind === 'years'));
  assert.equal(factLinesWithCertifications('', []).length, 0);
});

test('polishing request carries saved certifications as evidence and the early-weeks choice', () => {
  const base = {applicationJobTitle: 'AI Delivery Lead', jobDescriptionText: 'Lead AI delivery.', selectedCvText: 'Led AI delivery.', draftPlainText: 'Dear Hiring Manager', letterTone: 'professional', maxWords: 400, webSearchEnabled: false};
  const user = extra => JSON.parse(buildPolishingApiRequest({...base, ...extra}, 'openai/gpt-6-luna').input.find(x => x.role === 'user').content.find(x => x.type === 'input_text').text);
  const off = user({candidateCertifications: ['PRINCE2 Practitioner']});
  assert.deepEqual(off.candidateCertifications, ['PRINCE2 Practitioner']);
  assert.equal(off.letterStructure.futureContribution.included, false);
  assert.match(off.constraints.finalNarrativeParagraphs, /no early-onboarding paragraph.*strong-fit/);
  const on = user({includeEarlyWeeks: true});
  assert.equal(on.candidateCertifications, undefined);
  assert.equal(on.letterStructure.futureContribution.included, true);
  assert.match(on.constraints.finalNarrativeParagraphs, /three prospective early-onboarding focus areas/);
  const contract = buildEvidenceContract({...base, candidateCertifications: ['PRINCE2 Practitioner', 'SAFe SPC']});
  const certs = contract.sources.find(s => s.id === 'CERTS');
  assert.deepEqual(certs.allowedClaimTypes, ['capability']);
  assert.equal(buildEvidenceContract(base).sources.some(s => s.id === 'CERTS'), false);
});

test('the refinement use case passes the early-weeks choice and certifications to the port', async () => {
  const {refineCoverLetter} = await import('../../src/application/refine-cover-letter.js');
  const seen = [];
  const port = {refine: async r => { seen.push(r); return {proposedDraft: 'x', review: {}}; }};
  await refineCoverLetter({draftPlainText: 'Dear Hiring Manager', includeEarlyWeeks: true, candidateCertifications: ['PMP', 'pmp', '']}, {coverLetterRefinementPort: port, refinementPort: port, port});
  await refineCoverLetter({draftPlainText: 'Dear Hiring Manager'}, {coverLetterRefinementPort: port, refinementPort: port, port});
  assert.equal(seen[0].includeEarlyWeeks, true);
  assert.deepEqual(seen[0].candidateCertifications, ['PMP']);
  assert.equal(seen[1].includeEarlyWeeks, undefined);
  assert.equal(seen[1].candidateCertifications, undefined);
});
