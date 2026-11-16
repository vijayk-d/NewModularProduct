import test from 'node:test';
import assert from 'node:assert/strict';
import {toPortalLetter, PORTAL_GREETING} from '../../../src/domain/cover-letter/portal-letter.js';

const closing = 'I appreciate the convenience of ATS-based applications, but I believe strong talent is often best understood through a direct conversation.';
const plain = `Dear {{firstname}},\n\nI am applying for the role.\n\n• Delivered £2M programme\n\n${closing}\n\nKind regards,\nTest Candidate`;
const html = `<p>Dear {{firstname}},</p><p>I am applying for the role.</p><ul><li>Delivered <mark style="background-color:#fff2a8">£2M</mark> programme</li></ul><p>${closing}</p><p>Kind regards,<br>Test Candidate</p>`;

test('portal letter sets the generic greeting and drops the ATS closing paragraph in both forms', () => {
  const r = toPortalLetter({plain, html});
  assert.equal(r.ok, true);
  assert.ok(r.plain.startsWith(PORTAL_GREETING + '\n\nI am applying'));
  assert.ok(!r.plain.includes('I appreciate the convenience'));
  assert.match(r.plain, /programme\n\nKind regards,/);
  assert.ok(r.html.startsWith(`<p>${PORTAL_GREETING}</p>`));
  assert.ok(!r.html.includes('I appreciate the convenience'));
  assert.equal(r.greetingReplaced, true);
  assert.equal(r.closingRemoved, true);
});

test('portal letter keeps bullets, highlights and every other paragraph unchanged', () => {
  const r = toPortalLetter({plain, html});
  assert.match(r.html, /<ul><li>Delivered <mark style="background-color:#fff2a8">£2M<\/mark> programme<\/li><\/ul>/);
  assert.match(r.html, /<p>Kind regards,<br>Test Candidate<\/p>$/);
  assert.match(r.plain, /• Delivered £2M programme/);
});

test('a named greeting is also replaced', () => {
  const r = toPortalLetter({plain: 'Dear Sam,\n\nBody.', html: '<p>Dear Sam,</p><p>Body.</p>'});
  assert.equal(r.plain, PORTAL_GREETING + '\n\nBody.');
  assert.equal(r.html, `<p>${PORTAL_GREETING}</p><p>Body.</p>`);
});

test('line-break letters drop the closing line too', () => {
  const r = toPortalLetter({plain: `Dear Sam,\n\nBody.\n\n${closing}\n\nKind regards`, html: `Dear Sam,<br><br>Body.<br><br>${closing}<br><br>Kind regards`});
  assert.equal(r.ok, true);
  assert.equal(r.html, `${PORTAL_GREETING}<br><br>Body.<br><br>Kind regards`);
});

test('letters without greeting or closing are left as they are', () => {
  const r = toPortalLetter({plain: 'Body only.', html: '<p>Body only.</p>'});
  assert.deepEqual([r.ok, r.plain, r.html, r.greetingReplaced, r.closingRemoved], [true, 'Body only.', '<p>Body only.</p>', false, false]);
});

test('inconsistent plain and formatted letters are refused rather than half changed', () => {
  assert.deepEqual(toPortalLetter({plain: 'Dear Sam,\n\nBody.', html: '<p>Body.</p>'}), {ok: false, reason: 'greeting'});
  assert.deepEqual(toPortalLetter({plain: `Body.\n\n${closing}`, html: '<p>Body.</p>'}), {ok: false, reason: 'closing'});
});
