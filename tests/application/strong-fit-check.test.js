import test from 'node:test';
import assert from 'node:assert/strict';
import {strongFitWarnings, findStrongFitParagraph} from '../../src/application/strong-fit-check.js';

// Synthetic letter: invented organisations and figures, no owner data.
const bullets = [
  '• At NORTHWIND, I consolidated delivery, quality, capacity and release reporting across platform workstreams, giving leadership a clearer basis for priority discussions.',
  '• At CONTOSO, I delivered £2.4M annualised cost reduction by leading a claims-automation MVP using Agile frameworks and cloud services.',
  '• At FABRIKAM, I cut onboarding time by 35% by introducing a self-service portal.'
];
const letter = fit => ['Dear {{firstname}},', 'I am interested in this role.', ...bullets, 'Their values resonate with me.', fit, 'Warm regards,', 'Test Candidate'].join('\n');

test('a specific strong-fit paragraph with new evidence passes', () => {
  const fit = 'I am a strong fit for the Delivery Lead role, bringing hands-on delivery leadership. At TAILSPIN, I introduced CI/CD pipelines and automated test suites across 12 teams, cutting release lead time by 50%. I hold PRINCE2® and Certified Scrum Professional.';
  assert.equal(findStrongFitParagraph(letter(fit)), fit);
  assert.deepEqual(strongFitWarnings(letter(fit)), []);
});

test('repeated figures and a near-identical bullet sentence are flagged', () => {
  const fit = 'I am a strong fit for the Delivery Lead role, bringing evidence-led delivery. At CONTOSO, I led a claims-automation MVP delivering £2.4M annualised cost reduction. At NORTHWIND, I consolidated delivery, quality, capacity and release reporting across platform workstreams, clarifying priority discussions. I hold PRINCE2®.';
  const w = strongFitWarnings(letter(fit));
  assert.ok(w.some(x => /repeats a figure from the evidence bullets \(£2\.4M\)/.test(x)), w.join(' | '));
  assert.ok(w.some(x => /repeats the NORTHWIND evidence bullet almost word for word/.test(x)), w.join(' | '));
  assert.ok(!w.some(x => /FABRIKAM/.test(x)));
});

test('future plans and a missing paragraph are flagged', () => {
  const w = strongFitWarnings(letter('I am a strong fit for the Delivery Lead role. I would bring a people-centred approach to adoption.'));
  assert.ok(w.some(x => /future plan \("I would"\)/.test(x)));
  assert.match(strongFitWarnings(letter('Thank you for considering my application.'))[0], /strong-fit paragraph .* is missing/);
});

test('the certifications sentence and short sentences never count as repeats', () => {
  const fit = 'I am a strong fit for the Delivery Lead role, bringing delivery leadership at scale. I hold Certified SAFe® Program Consultant (SPC).';
  assert.deepEqual(strongFitWarnings(letter(fit)), []);
});
