import test from 'node:test';
import assert from 'node:assert/strict';
import {keywordReport, priorityKeywordsFrom, createLetterKeywordService} from '../../src/application/letter-keywords.js';
import {localAdvertRequirements, normaliseRequirements} from '../../src/domain/keywords/advert-requirements.js';
import {createMemoryAdvertRequirementsStore, createAdvertRequirementsFileStore} from '../../src/infrastructure/advert-requirements-file.js';
import {buildAdvertApiRequest, ADVERT_SCHEMA} from '../../src/infrastructure/refinement/perplexity-advert-requirements-adapter.js';
import {normalizePriorityKeywords} from '../../src/application/refine-cover-letter.js';
import {termPattern, phraseSpans, shortcutFor, SHORTCUTS} from '../../src/interfaces/http/letter-keyword-controls.js';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const jd = ['We are hiring a Senior Delivery Manager to lead agile delivery across digital transformation programmes.',
  'You will manage stakeholders, run Scrum ceremonies, own RAID logs and budgets up to £5m, and work with Jira and Confluence.',
  'Essential: SAFe or PRINCE2 certification, experience in financial services, strong stakeholder management. Desirable: public sector experience, Azure DevOps.',
  'Hybrid working in London, 2 days per week.'].join('\n');
const evidence = [{text: 'At Example Bank I ran Scrum for five teams using Jira.', source: 'Selected achievement'}, {text: 'PRINCE2 Practitioner', source: 'Certification'}];
const terms = list => list.map(r => r.term);

test('the built-in reader finds named tools, certifications, methods and sectors, keeps phrases whole and drops noise', () => {
  const r = localAdvertRequirements(jd);
  const by = Object.fromEntries(r.map(x => [x.term, x]));
  for (const t of ['PRINCE2', 'SAFe', 'Jira', 'Confluence', 'Scrum', 'RAID logs', 'Financial services', 'Stakeholder management', 'Budget management', 'Azure DevOps', 'Public sector']) assert.ok(by[t], t);
  for (const t of ['week', 'hybrid', 'logs', 'public', 'sector', 'services', 'Microsoft Azure', 'DevOps', 'Delivery manager']) assert.equal(by[t], undefined, t);
  assert.equal(by['PRINCE2'].category, 'certification');
  assert.equal(by['Jira'].category, 'tool');
  assert.equal(by['Financial services'].priority, 'essential');
  assert.equal(by['Azure DevOps'].priority, 'desirable');
  assert.equal(by['Public sector'].priority, 'desirable');
  assert.ok(r.findIndex(x => x.priority === 'desirable') > r.findLastIndex(x => x.priority === 'essential'), 'Essential first');
});

test('an AI reading keeps only terms the advert contains, adds known spellings and corrects the priority from the advert', () => {
  const r = normaliseRequirements([
    {term: 'PRINCE2', category: 'certification', priority: 'desirable', aliases: []},
    {term: 'stakeholder engagement', category: 'skill', priority: 'essential', aliases: []},
    {term: 'Kubernetes', category: 'tool', priority: 'essential', aliases: []},
    {term: 'Hybrid working', category: 'skill', priority: 'essential', aliases: []},
    {term: 'Azure DevOps', category: 'tool', priority: 'essential', aliases: ['ADO']}
  ], jd);
  assert.deepEqual(terms(r), ['PRINCE2', 'Stakeholder management', 'Azure DevOps']);
  assert.equal(r[0].priority, 'essential', 'the advert lists PRINCE2 as essential');
  assert.ok(r[0].aliases.includes('PRINCE2 Practitioner'));
  assert.equal(r[2].priority, 'desirable', 'the advert lists Azure DevOps as desirable');
});

test('the report sorts each requirement into one group, says where a backed term fits, and never matches sap or safe by case', () => {
  const requirements = localAdvertRequirements(jd);
  const r = keywordReport({requirements, letterText: 'I bring agile delivery and strong stakeholder engagement. It is safe to say I know SAP well.', evidence});
  const group = name => terms(r.groups[name]);
  assert.ok(group('inLetter').includes('Agile') && group('inLetter').includes('Stakeholder management'));
  assert.equal(r.groups.inLetter.find(t => t.term === 'Stakeholder management').writtenAs, 'stakeholder engagement');
  assert.ok(!group('inLetter').includes('SAFe'), 'lower-case safe is not SAFe');
  const prince = r.groups.missingBacked.find(t => t.term === 'PRINCE2');
  assert.equal(prince.fits, 'the strong-fit paragraph');
  assert.equal(prince.evidence.source, 'Certification');
  assert.ok(group('missingBacked').includes('Scrum') && group('missingBacked').includes('Jira'));
  assert.ok(group('missingUnbacked').includes('SAFe'), 'Essential with no evidence');
  assert.ok(group('lowValue').includes('Public sector'), 'Desirable with no evidence');
  assert.equal(r.summary.essentialTotal, requirements.filter(x => x.priority === 'essential').length);
  assert.match(r.nextSteps[0], /^Add (PRINCE2|Scrum|Jira) \(Essential\) to /);
  const priority = priorityKeywordsFrom(r);
  assert.ok(priority.length > 0 && priority.length <= 5 && priority.every(p => p.term && p.evidence));
});

test('the advert is read by AI once per application; a failed reading falls back and is never retried automatically', async () => {
  const reviews = new Map([['r1', {formData: {jobDescriptionText: jd, jobTitle: 'Senior Delivery Manager'}}], ['r2', {formData: {jobDescriptionText: ''}}]]);
  let calls = 0, fail = false;
  const reader = {available: true, async read() { calls++; if (fail) throw Object.assign(new Error('boom'), {code: 'X'}); return {model: 'm', requirements: [{term: 'PRINCE2', category: 'certification', priority: 'essential', aliases: []}, {term: 'Jira', category: 'tool', priority: 'essential', aliases: []}]}; }};
  const store = createMemoryAdvertRequirementsStore();
  const s = createLetterKeywordService({reviews, evidence: async () => evidence, reader, store});
  await s.priorityKeywords('r1', 'x');
  assert.equal(calls, 0, 'the polishing estimate never pays for a reading');
  const first = await s.check('r1', {letterText: 'I use Jira daily.'});
  assert.equal(first.source, 'ai'); assert.deepEqual(terms(first.terms), ['PRINCE2', 'Jira']);
  await s.check('r1', {letterText: ''});
  assert.equal(calls, 1, 'saved and reused');
  assert.deepEqual(await s.priorityKeywords('r1', 'I use Jira daily.'), [{term: 'PRINCE2', evidence: 'PRINCE2 Practitioner'}]);
  reviews.set('r1', {formData: {jobDescriptionText: jd + '\nAlso Kanban.'}}); fail = true;
  const failed = await s.check('r1', {letterText: ''});
  assert.equal(failed.source, 'local'); assert.match(failed.note, /not retried automatically/);
  await s.check('r1', {letterText: ''});
  assert.equal(calls, 2, 'the failure is remembered for this advert');
  await assert.rejects(s.check('missing', {}), /not found/);
  await assert.rejects(s.check('r2', {}), /no job description/);
  await assert.rejects(s.check('r1', {letterText: 'x'.repeat(40001)}), /too long/);
  const off = createLetterKeywordService({reviews: new Map([['r1', {formData: {jobDescriptionText: jd}}]]), evidence: async () => evidence});
  assert.equal((await off.check('r1', {letterText: ''})).source, 'local');
});

test('saved readings live in their own file, one entry per application', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'advert-req-'));
  try {
    const store = createAdvertRequirementsFileStore(dir, () => new Date('2026-11-24T10:00:00Z'));
    assert.equal(store.get('r1'), null);
    store.set('r1', {advertHash: 'h', source: 'ai', requirements: [{term: 'Jira'}]});
    assert.equal(createAdvertRequirementsFileStore(dir).get('r1').requirements[0].term, 'Jira');
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'advert-requirements-v1.json'), 'utf8')).version, 1);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('the AI request sends only the title, organisation and advert, with a strict schema; polishing accepts at most five terms', () => {
  const body = buildAdvertApiRequest({jobTitle: 'PM', organisationName: 'Acme', jobDescriptionText: 'Advert'});
  assert.deepEqual(JSON.parse(body.input[1].content[0].text), {jobTitle: 'PM', organisation: 'Acme', advert: 'Advert'});
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(ADVERT_SCHEMA.required, ['requirements']);
  assert.ok(!('tools' in body), 'no web search');
  const many = Array.from({length: 8}, (_, i) => ({term: 'T' + i, evidence: 'line ' + i}));
  assert.equal(normalizePriorityKeywords(many).length, 5);
  assert.deepEqual(normalizePriorityKeywords([{term: '<b>', evidence: 'x'}, {term: 'Jira', evidence: ''}, {term: ' Jira  ', evidence: ' I use   Jira '}]), [{term: 'Jira', evidence: 'I use Jira'}]);
});

test('term patterns match whole words from their stems, across spaces or hyphens', () => {
  const p = termPattern(['stakehold', 'manag']);
  assert.match('Strong stakeholder management skills', p);
  assert.match('stakeholder-management', p);
  assert.doesNotMatch('nonstakeholder management', p);
  assert.equal(termPattern([]), null);
  assert.equal('I hold PRINCE2.'.match(termPattern(['prince2']))[0], 'PRINCE2');
});

test('Keywords highlights whole phrases, not single words', () => {
  const pats = [['agil', 'deliver'], ['governanc'], ['stakehold'], ['pi', 'planning'], ['agil', 'ceremoni'], ['safe'], ['prince2'], ['scrum', 'master'], ['okr']].map(termPattern);
  const show = text => phraseSpans(text, pats).map(s => text.slice(s.start, s.end));
  assert.deepEqual(show('The role’s combination of agile delivery, daily governance and senior stakeholder visibility matches the work I have led.'),
    ['agile delivery, daily governance and senior stakeholder visibility']);
  assert.deepEqual(show('At SKY, I boosted team engagement by 30% through remote PI Planning and inclusive Agile ceremonies across distributed squads, and enabled savings.'),
    ['remote PI Planning and inclusive Agile ceremonies']);
  assert.deepEqual(show('I hold Certified SAFe® Program Consultant (SPC), PRINCE2®, and Certified Scrum Master (CSM).'),
    ['Certified SAFe® Program Consultant (SPC), PRINCE2®, and Certified Scrum Master (CSM)']);
  assert.deepEqual(show('At BP, I cut costs by building in-house Agile and OKR capability and working with leadership.'), ['building in-house Agile and OKR capability']);
  assert.deepEqual(show('Dear Agile Delivery Team,'), [], 'greeting lines are never highlighted');
  assert.deepEqual(show('Nothing relevant here.'), []);
});

test('shortcuts map to toolbar commands; the browser keeps its own bold and italic', () => {
  const key = (k, extra = {}) => shortcutFor({ctrlKey: true, key: k, code: '', ...extra});
  assert.equal(key('k').command, 'createLink');
  assert.equal(key('K', {shiftKey: true}).command, 'keywordCheck');
  assert.equal(key('*', {shiftKey: true, code: 'Digit8'}).command, 'insertUnorderedList');
  assert.equal(key('&', {shiftKey: true, code: 'Digit7'}).command, 'insertOrderedList');
  assert.equal(key('H', {shiftKey: true}).command, 'toggleJobHighlight');
  assert.equal(key('/').command, 'shortcutHelp');
  assert.equal(key('b'), null, 'Ctrl+B stays with the browser');
  assert.equal(shortcutFor({key: 'k', code: ''}), null, 'no Ctrl, no shortcut');
  assert.equal(new Set(SHORTCUTS.map(s => s.keys)).size, SHORTCUTS.length);
});
