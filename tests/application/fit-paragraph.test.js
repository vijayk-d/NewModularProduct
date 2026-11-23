import test from 'node:test';
import assert from 'node:assert/strict';
import {certificationsIn, yearsOfExperienceIn, cvFactLines} from '../../src/domain/cv/cv-facts.js';
import {draftFitParagraph, createFitParagraphService, FIT_WORD_LIMIT} from '../../src/application/fit-paragraph.js';
import {createApplicationQuestionsService} from '../../src/application/application-questions.js';

const JD = 'We are hiring a Delivery Manager. You will lead stakeholder management, risk management and continuous improvement across cross-functional teams.';
const CV = 'Delivery lead with 15+ years of experience. Certifications: PMP, PRINCE2 Practitioner, SAFe 6 Agilist. CSM for a SaaS product; MSP vendor management.';

test('CV facts: only certifications written in the CV, without ambiguous acronyms, and the stated years', () => {
  assert.deepEqual(certificationsIn(CV), ['PMP', 'PRINCE2 Practitioner', 'SAFe 6 Agilist']);
  assert.deepEqual(certificationsIn('Managing Successful Programmes; Certified Scrum Master; PRINCE2 Foundation'), ['PRINCE2 Foundation', 'MSP (Managing Successful Programmes)', 'Certified ScrumMaster (CSM)']);
  assert.deepEqual(certificationsIn('No certificates here'), []);
  assert.equal(yearsOfExperienceIn(CV), 'more than 15 years');
  assert.equal(yearsOfExperienceIn('12 years of experience, 3 years in banking'), '12 years');
  assert.equal(yearsOfExperienceIn('Founded in 1999; 100 years old'), '');
  assert.deepEqual(cvFactLines(CV).map(l => [l.kind, l.source]), [['certifications', 'Selected CV'], ['years', 'Selected CV']]);
  assert.deepEqual(cvFactLines(''), []);
});

test('the fit paragraph uses supported advert terms, CV facts and the best-matching evidence, nothing else', () => {
  const evidence = [
    {text: 'Ran a team offsite.', source: 'Selected achievement'},
    {text: 'At SKY, I led continuous improvement across five Scrum teams', source: 'Selected achievement'},
    {text: 'Introduced risk management reporting for the board.', source: 'Tailored CV bullet'},
    ...cvFactLines(CV)];
  const d = draftFitParagraph({jobTitle: 'Delivery Manager', organisationName: 'Example Ltd', jobDescriptionText: JD, evidence});
  assert.equal(d.paragraph, 'I am a strong fit for this Delivery Manager role at Example Ltd: I bring more than 15 years of experience in continuous improvement and risk management, and I hold PMP, PRINCE2 Practitioner and SAFe 6 Agilist. At SKY, I led continuous improvement across five Scrum teams. I introduced risk management reporting for the board.');
  assert.deepEqual(d.used.terms, ['continuous improvement', 'risk management']);
  assert.ok(!/stakeholder|offsite/.test(d.paragraph), 'unsupported terms and unrelated lines are left out');
  const plain = draftFitParagraph({jobTitle: '', jobDescriptionText: JD, evidence: [{text: 'Delivered a payments platform.', source: 'Selected achievement'}]});
  assert.equal(plain.paragraph, 'I am a strong fit for this role: I bring hands-on experience. I delivered a payments platform.');
});

test('the service needs a saved application with evidence; the AI polish has a word limit', async () => {
  const reviews = new Map([['r1', {formData: {jobTitle: 'Delivery Manager', jobDescriptionText: JD}}]]);
  const s = createFitParagraphService({reviews, evidence: async () => [{text: 'Led risk management.', source: 'Selected achievement'}]});
  const d = await s.draft('r1');
  assert.match(d.paragraph, /^I am a strong fit/); assert.equal(d.aiLimit, FIT_WORD_LIMIT); assert.match(d.aiQuestion, /strong fit/);
  await assert.rejects(s.draft('missing'), /not found/);
  await assert.rejects(createFitParagraphService({reviews}).draft('r1'), /No evidence/);
});

test('CV facts join the shared evidence for answers and the fit paragraph', async () => {
  const reviews = new Map([['r1', {formData: {cvHighlights: ['Led risk management.']}, selectedCvRoleCode: 'PM'}]]);
  const store = {list: () => []};
  const q = createApplicationQuestionsService({reviews, store, cvFacts: async r => r.selectedCvRoleCode === 'PM' ? cvFactLines(CV) : []});
  const ev = await q.evidenceFor('r1');
  assert.deepEqual(ev.map(e => e.source), ['Selected achievement', 'Selected CV', 'Selected CV']);
  const broken = createApplicationQuestionsService({reviews, store, cvFacts: async () => { throw new Error('index unavailable'); }});
  assert.equal((await broken.evidenceFor('r1')).length, 1, 'a CV index problem never blocks the evidence');
});
