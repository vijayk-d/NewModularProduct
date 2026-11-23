import test from 'node:test';
import assert from 'node:assert/strict';
import {letterKeywordCoverage, createLetterKeywordService} from '../../src/application/letter-keywords.js';
import {termPattern, shortcutFor, SHORTCUTS} from '../../src/interfaces/http/letter-keyword-controls.js';

const jd = 'We are hiring a Delivery Manager. You will lead stakeholder management, risk management and continuous improvement across cross-functional teams using Scrum and SAFe. PRINCE2 certification is desirable.';
const evidence = [{text: 'At SKY, I led continuous improvement across five Scrum teams.', source: 'Selected achievement'}, {text: 'Introduced risk reporting for the board.', source: 'Tailored CV bullet'}];

test('the letter check reports used, missing-but-evidenced and missing terms from the advert', () => {
  const r = letterKeywordCoverage({jobDescriptionText: jd, letterText: 'As a Delivery Manager I led stakeholder management for complex programmes.', evidence});
  const by = Object.fromEntries(r.terms.map(t => [t.term, t]));
  assert.equal(by['stakeholder management'].inLetter, true);
  assert.equal(by['delivery manager'].inLetter, true);
  assert.equal(by['continuous improvement'].inLetter, false);
  assert.equal(by['continuous improvement'].supported, true);
  assert.equal(by['continuous improvement'].evidence.source, 'Selected achievement');
  const cross = by['cross functional'];
  assert.ok(cross && !cross.inLetter && !cross.supported && cross.evidence === null, 'not in the letter or the evidence');
  assert.ok(r.score > 0 && r.score < 100);
});

test('the service needs a saved application with a job description', async () => {
  const reviews = new Map([['r1', {formData: {jobDescriptionText: jd}}], ['r2', {formData: {jobDescriptionText: ''}}]]);
  const s = createLetterKeywordService({reviews, evidence: async () => evidence});
  assert.ok((await s.check('r1', {letterText: 'risk management'})).terms.length > 3);
  await assert.rejects(s.check('missing', {}), /not found/);
  await assert.rejects(s.check('r2', {}), /no job description/);
  await assert.rejects(s.check('r1', {letterText: 'x'.repeat(40001)}), /too long/);
});

test('term patterns match whole words from their stems, across spaces or hyphens', () => {
  const p = termPattern(['stakehold', 'manag']);
  assert.match('Strong stakeholder management skills', p);
  assert.match('stakeholder-management', p);
  assert.doesNotMatch('nonstakeholder management', p);
  assert.equal(termPattern([]), null);
  assert.equal('I hold PRINCE2.'.match(termPattern(['prince2']))[0], 'PRINCE2');
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
