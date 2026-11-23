import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';
import {renderCoverLetterHtml} from '../../src/interfaces/http/cover-letter-html.js';
import {sanitizeSnapshotHtml} from '../../src/application/outreach-message-snapshot.js';

const current = 'Dear {{firstname}},\n\nI am applying for the Agile Coach opportunity.\n\nWarm regards,\nTest Candidate';
const longBody = Array.from({length: 19}, (_, i) => `At EXAMPLE, I coached delivery teams through change in programme ${i + 1}, building steady habits for planning, review and improvement across the portfolio.`).join('\n\n');
const proposal = `Dear {{firstname}},\n\nI am applying for the Agile Coach opportunity.\n\n${longBody}\n\nWarm regards,\nTest Candidate`;

async function fixture(t) {
  const cv = {role_code: 'SM', role_name: 'Agile Coach'};
  const row = {formData: {jobTitle: 'Agile Coach', organisationName: 'Example', advertiserRelationship: 'unknown', jobDescriptionText: 'Coach Agile teams.'},
    prepared: {jobDescription: {role: 'Agile Coach'}, coverLetter: {subject: 'Application', plainText: current}, recommendation: {bestCv: cv, ats: {score: 70}}, rankedCvs: []},
    currentDraftPlainText: current, currentDraftHtml: renderCoverLetterHtml(current), currentDraftSubject: 'Application',
    refinementProposal: {proposedDraft: proposal, letterLengthMode: 'standard', warnings: ['5 evidence items; expected at most 4.']}};
  const lines = [], store = new Map([['r', row]]), server = createLocalServer({applicationReviewStore: store, diagnosticsWriter: {write: l => lines.push(l)}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  return {store, lines, url: 'http://127.0.0.1:' + server.address().port};
}
const apply = (f, extra = {}) => {
  const html = renderCoverLetterHtml(proposal), plain = sanitizeSnapshotHtml(html).text.trim();
  return fetch(f.url + '/cover-letter-refinement/apply', {method: 'POST', body: new URLSearchParams({reviewId: 'r', proposalBodyVersion: createHash('sha256').update(proposal).digest('hex'), editedProposalPlainText: plain, editedProposalHtml: html, ...extra})});
};

test('an over-length proposal is refused with the real reason; the letter is unchanged and the proposal kept', async t => {
  const f = await fixture(t);
  const response = await apply(f), page = await response.text();
  assert.equal(response.status, 400);
  assert.match(page, /The complete letter has \d+ words; the selected standard limit is \d+\. Your current letter is unchanged\./);
  assert.doesNotMatch(page, /Cover-letter refinement is currently unavailable/);
  assert.match(page, /Review retained proposal in Extended mode/);
  const saved = f.store.get('r');
  assert.equal(saved.currentDraftPlainText, current);
  assert.match(saved.refinementProposal.proposedDraft, /programme 19/);
  assert.ok(saved.refinementProposal.warnings.includes('5 evidence items; expected at most 4.'), 'earlier warnings stay');
  assert.equal(saved.rejectedRefinementProposal.lengthCheckFailed, true);
  const logged = f.lines.filter(l => l.includes('[APP_ERROR]'));
  assert.equal(logged.length, 1, 'the failure reaches the log with debug logging off');
  assert.match(logged[0], /^\[APP_ERROR\] at="[^"]+" \[LOCAL_DIAGNOSTICS\] event="refinement_apply_failed" requestId=.* errorCode="REFINEMENT_LENGTH_EXCEEDED"/);
  assert.doesNotMatch(logged[0], /coached|programme|Test Candidate/, 'no letter text in the log');
});

test('after reviewing it in Extended mode (no AI call) the proposal applies and replaces the letter', async t => {
  const f = await fixture(t);
  assert.equal((await apply(f)).status, 400);
  const reassess = await fetch(f.url + '/cover-letter-refinement/reassess-length', {method: 'POST', body: new URLSearchParams({reviewId: 'r', letterLengthMode: 'extended'})});
  assert.equal(reassess.status, 200, await reassess.text());
  const proposalNow = f.store.get('r').refinementProposal.proposedDraft;
  const response = await fetch(f.url + '/cover-letter-refinement/apply', {method: 'POST', body: new URLSearchParams({reviewId: 'r', proposalBodyVersion: createHash('sha256').update(proposalNow).digest('hex')})});
  assert.equal(response.status, 200, (await response.text()).slice(0, 400));
  assert.match(f.store.get('r').currentDraftPlainText, /programme 19/);
});

test('"Use it anyway" applies an over-length proposal after a refusal, and records the override', async t => {
  const f = await fixture(t);
  const first = await (await apply(f)).text();
  assert.match(first, /name="acceptOverLength" value="true"> Use it anyway: I have checked the length \(\d+ words; the standard limit is 400\)\./);
  const response = await apply(f, {acceptOverLength: 'true'});
  const page = await response.text();
  assert.equal(response.status, 200, page.slice(0, 300));
  const saved = f.store.get('r');
  assert.match(saved.currentDraftPlainText, /programme 19/);
  const last = saved.refinementHistory.at(-1);
  assert.equal(last.lengthOverride.maximumWords, 400);
  assert.equal(last.lengthOverride.mode, 'standard');
  assert.ok(last.lengthOverride.wordCount > 400);
  assert.equal(saved.rejectedRefinementProposal, null);
  assert.match(page, /You chose to use it at \d+ words, over the standard limit of 400\./);
});

test('the override never bypasses other checks, and is not recorded when the letter is within the limit', async t => {
  const f = await fixture(t), before = f.store.get('r').currentDraftPlainText;
  const stale = await apply(f, {acceptOverLength: 'true', proposalBodyVersion: 'a'.repeat(64)});
  assert.equal(stale.status, 409);
  assert.equal(f.store.get('r').currentDraftPlainText, before);
  const firstPage = await (await fetch(f.url + '/applications/r')).text();
  assert.doesNotMatch(firstPage, /data-length-override/, 'no tick box before any refusal');
  const short = 'Dear {{firstname}},\n\nI am applying for the Agile Coach opportunity.\n\nShort and clear.\n\nWarm regards,\nTest Candidate';
  f.store.set('r', {...f.store.get('r'), refinementProposal: {proposedDraft: short, letterLengthMode: 'standard'}});
  const ok = await fetch(f.url + '/cover-letter-refinement/apply', {method: 'POST', body: new URLSearchParams({reviewId: 'r', proposalBodyVersion: createHash('sha256').update(short).digest('hex'), acceptOverLength: 'true'})});
  assert.equal(ok.status, 200);
  assert.equal(f.store.get('r').refinementHistory.at(-1).lengthOverride, undefined);
});
