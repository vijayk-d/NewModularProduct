import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {rewriteTrackedLinks, findTrackedLinks, LINK_TRACKING_FOOTNOTE, SIGNATURE_SEPARATOR, SIGNATURE_MARKER} from '../../src/domain/outreach/tracked-links.js';
import {createLinkTracker, linkTrackingSettings} from '../../src/application/link-tracking.js';
import {createMemoryLinkTrackingStore, createLinkTrackingFileStore, LINK_TRACKING_FILE} from '../../src/infrastructure/link-tracking-file.js';
import {verifyLinkToken} from '../../src/domain/outreach/link-tokens.js';
import {FEATURES} from '../../src/config/feature-toggles.js';

// Synthetic keys, people and addresses only.
const SIGNING_KEY = 'test-signing-key-0123456789abcdef0123456789';
const BASE = 'https://jobapp-links.example.workers.dev';
const PROFILE = 'https://www.linkedin.com/in/test-candidate/';
const ADVERT = 'https://www.linkedin.com/jobs/view/4123456789/?trackingId=abc';
const env = (extra = {}) => ({ENABLE_LINK_TRACKING: 'true', LINK_TRACKING_BASE_URL: BASE, LINK_TRACKING_SIGNING_KEY: SIGNING_KEY, LINK_TRACKING_PROFILE_URL: PROFILE, ...extra});
const item = {id: 'q1', reviewId: 'r1', applicationKey: 'app-1', email: 'Zoe@Business.test', application: {jobAdvertLink: ADVERT}};

function signedDraft() {
  const letterPlain = 'Dear Zoe,\n\nI am applying for the Delivery Lead opportunity at Example.\nRole details: ' + ADVERT + '\n\nWarm regards,\nTest Candidate';
  const letterHtml = 'Dear Zoe,<br><br>I am applying for the <a href="' + ADVERT.replace('&', '&amp;') + '" target="_blank">Delivery Lead</a> opportunity at Example.<br><br>Warm regards,<br>Test Candidate';
  return {
    subject: 'Application', attachment: {relativePath: 'cv.pdf'},
    bodyPlainText: letterPlain + SIGNATURE_SEPARATOR + 'Test Candidate\nhttps://uk.linkedin.com/in/test-candidate?utm=sig',
    bodyHtml: letterHtml + '<br>' + SIGNATURE_MARKER + '<b>Test Candidate</b> <a href="https://uk.linkedin.com/in/test-candidate?utm=sig"><img src="cid:logo" alt="LinkedIn"></a> <a href="https://example.test/blog">Blog</a>'
  };
}

test('only the advert above the signature and the profile in the signature are found', () => {
  const draft = signedDraft();
  assert.deepEqual(findTrackedLinks(draft, {advertKey: 'a-4123456789', profileTarget: PROFILE}), ['a-4123456789', 'p']);
  assert.deepEqual(findTrackedLinks(draft, {advertKey: 'a-4123456789', profileTarget: PROFILE, scope: 'letter'}), ['a-4123456789']);
  assert.deepEqual(findTrackedLinks(draft, {advertKey: 'a-999', profileTarget: ''}), [], 'another job\'s advert is not this application\'s link');
});

test('rewriting swaps both forms of each link, leaves others alone and adds the footnote last', () => {
  const urls = {'a-4123456789': BASE + '/c/A', p: BASE + '/c/P'};
  const out = rewriteTrackedLinks(signedDraft(), {advertKey: 'a-4123456789', profileTarget: PROFILE, urls, footnote: true});
  assert.ok(out.bodyPlainText.includes('Role details: ' + BASE + '/c/A\n'));
  assert.ok(out.bodyHtml.includes('<a href="' + BASE + '/c/A" target="_blank">Delivery Lead</a>'), 'the visible role title is kept');
  assert.ok(out.bodyHtml.includes('<a href="' + BASE + '/c/P"><img'));
  assert.ok(out.bodyPlainText.includes('\n' + BASE + '/c/P'));
  assert.ok(out.bodyHtml.includes('href="https://example.test/blog"'), 'other links are untouched');
  assert.ok(!out.bodyPlainText.includes('linkedin.com') && !out.bodyHtml.includes('linkedin.com'));
  assert.ok(out.bodyPlainText.endsWith('\n\n' + LINK_TRACKING_FOOTNOTE));
  assert.ok(out.bodyHtml.endsWith(LINK_TRACKING_FOOTNOTE + '</p>'));
  assert.equal(out.subject, 'Application');
  const shown = rewriteTrackedLinks({bodyPlainText: 'x', bodyHtml: '<a href="' + ADVERT + '">' + ADVERT + '</a>'}, {advertKey: 'a-4123456789', urls});
  assert.equal(shown.bodyHtml, '<a href="' + BASE + '/c/A">' + BASE + '/c/A</a>', 'a link showing its own address shows the tracked one');
});

test('settings name every problem and never show the key', () => {
  assert.deepEqual(linkTrackingSettings({}).problems, [], 'off: nothing to report');
  const bad = linkTrackingSettings({ENABLE_LINK_TRACKING: 'true', LINK_TRACKING_BASE_URL: 'http://x.test/path', LINK_TRACKING_SIGNING_KEY: 'short-secret', LINK_TRACKING_PROFILE_URL: 'https://example.test/me'});
  assert.equal(bad.ready, false);
  assert.equal(bad.problems.length, 3);
  assert.ok(!bad.problems.join(' ').includes('short-secret'));
  const good = linkTrackingSettings(env({LINK_TRACKING_BASE_URL: BASE + '/'}));
  assert.equal(good.ready, true);
  assert.equal(good.baseUrl, BASE);
});

test('off by default: drafts pass through unchanged and nothing is stored', async () => {
  const store = createMemoryLinkTrackingStore(), draft = signedDraft();
  const tracker = createLinkTracker({env: {}, store});
  assert.equal(await tracker.track(draft, item), draft);
  assert.deepEqual(tracker.links(), []);
});

test('switched on but not set up: preparing is blocked with the reason, nothing stored', async () => {
  const store = createMemoryLinkTrackingStore();
  const tracker = createLinkTracker({env: env({LINK_TRACKING_SIGNING_KEY: ''}), store});
  await assert.rejects(tracker.track(signedDraft(), item), /not set up: LINK_TRACKING_SIGNING_KEY/);
  assert.deepEqual(tracker.links(), []);
});

test('tracked links are signed, stable per queue item, and the id map stays local', async () => {
  const store = createMemoryLinkTrackingStore(), lines = [];
  const tracker = createLinkTracker({env: env(), store, clock: () => Date.parse('2026-11-26T12:00:00Z'), log: l => lines.push(l)});
  const first = await tracker.track(signedDraft(), item);
  const again = await tracker.track(signedDraft(), item);
  assert.equal(again.bodyHtml, first.bodyHtml, 'the same email is prepared identically');
  assert.equal(await tracker.track(first, item), first, 'already tracked: unchanged');
  const links = tracker.links();
  assert.deepEqual(links.map(l => l.linkKey), ['a-4123456789', 'p']);
  assert.deepEqual(Object.keys(links[0]).sort(), ['applicationKey', 'createdAt', 'email', 'id', 'linkKey', 'queueId', 'reviewId']);
  assert.equal(links[0].email, 'zoe@business.test');
  const tokens = [...first.bodyHtml.matchAll(/https:\/\/jobapp-links\.example\.workers\.dev\/c\/([^"<\s]+)/g)].map(m => m[1]);
  assert.equal(tokens.length, 2);
  for (const token of tokens) {
    const verified = await verifyLinkToken(token, SIGNING_KEY);
    assert.ok(verified && links.some(l => l.id === verified.id && l.linkKey === verified.linkKey));
    assert.ok(!token.includes('zoe') && !token.includes('app-1'), 'the link carries nothing personal');
  }
  const other = await tracker.track(signedDraft(), {...item, id: 'q2'});
  assert.notEqual(other.bodyHtml, first.bodyHtml, 'each recipient gets their own ids');
  assert.match(lines[0], /^\[LINK_TRACKING\] TRACKED queue=q1 links=a-4123456789,p$/);
});

test('comparing with an existing Gmail draft reuses ids, never creates them, never adds the footnote', async () => {
  const store = createMemoryLinkTrackingStore(), tracker = createLinkTracker({env: env(), store});
  const unsignedLetter = {bodyPlainText: signedDraft().bodyPlainText.split(SIGNATURE_SEPARATOR)[0], bodyHtml: signedDraft().bodyHtml.split(SIGNATURE_MARKER)[0]};
  const untouched = await tracker.track(unsignedLetter, item, {scope: 'letter'});
  assert.equal(untouched, unsignedLetter, 'a draft made before tracking stays comparable');
  assert.deepEqual(tracker.links(), []);
  const sent = await tracker.track(signedDraft(), item);
  const reviewed = await tracker.track(unsignedLetter, item, {scope: 'letter'});
  assert.equal(reviewed.bodyPlainText, sent.bodyPlainText.split(SIGNATURE_SEPARATOR)[0]);
  assert.ok(!reviewed.bodyPlainText.includes(LINK_TRACKING_FOOTNOTE));
});

test('without a Gmail signature there is nowhere for the footnote, so nothing is tracked', async () => {
  const store = createMemoryLinkTrackingStore(), lines = [];
  const tracker = createLinkTracker({env: env(), store, log: l => lines.push(l)});
  const plain = {bodyPlainText: 'Dear Zoe,\nRole details: ' + ADVERT + '\nTest Candidate', bodyHtml: '<a href="' + ADVERT + '">Role</a>'};
  assert.equal(await tracker.track(plain, item), plain);
  assert.deepEqual(tracker.links(), []);
  assert.match(lines[0], /SKIPPED reason=no-signature/);
});

test('the file store writes its own new file and survives a corrupt one', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'links-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const store = createLinkTrackingFileStore(dir);
  assert.deepEqual(store.read(), {});
  store.write({links: [{id: 'abcdefghijkl', linkKey: 'p', queueId: 'q1'}]});
  assert.equal(path.basename(store.file), LINK_TRACKING_FILE);
  assert.deepEqual(JSON.parse(await readFile(store.file, 'utf8')), {version: 1, state: {links: [{id: 'abcdefghijkl', linkKey: 'p', queueId: 'q1'}]}});
  const {writeFileSync} = await import('node:fs');
  writeFileSync(store.file, '{broken');
  assert.deepEqual(store.read(), {});
});

test('the feature page lists link tracking, needing Gmail and the signature', () => {
  const feature = FEATURES.find(f => f.id === 'link-tracking');
  assert.equal(feature.env, 'ENABLE_LINK_TRACKING');
  assert.deepEqual(feature.requires, ['gmail', 'gmail-signature']);
});

test('after switching tracking off, a tracked Gmail draft still compares like for like; new emails are untouched', async () => {
  const store = createMemoryLinkTrackingStore();
  const sent = await createLinkTracker({env: env(), store}).track(signedDraft(), item);
  const off = createLinkTracker({env: env({ENABLE_LINK_TRACKING: 'false'}), store});
  const letter = {bodyPlainText: signedDraft().bodyPlainText.split(SIGNATURE_SEPARATOR)[0]};
  assert.equal((await off.track(letter, item, {scope: 'letter'})).bodyPlainText, sent.bodyPlainText.split(SIGNATURE_SEPARATOR)[0]);
  const fresh = signedDraft();
  assert.equal(await off.track(fresh, item), fresh);
});

test('a Gmail draft update compares and replaces the tracked letter, keeping the same links', async () => {
  const {createGmailDraftUpdatePort} = await import('../../src/application/gmail-draft-update-port.js');
  const store = createMemoryLinkTrackingStore(), tracker = createLinkTracker({env: env(), store});
  await tracker.track(signedDraft(), item);
  const tokenUrl = (await tracker.track({bodyPlainText: 'Role details: ' + ADVERT}, item, {scope: 'letter'})).bodyPlainText.slice('Role details: '.length);
  let payload = null;
  const port = createGmailDraftUpdatePort({env: {ENABLE_GMAIL: 'true', ENABLE_GMAIL_DRAFT_UPDATES: 'true', GMAIL_FROM_ADDRESS: 'sender@business.test', GMAIL_OAUTH_CLIENT_ID: 'test', GMAIL_OAUTH_CLIENT_SECRET: 'test', GMAIL_OAUTH_REFRESH_TOKEN: 'test'}, linkTracker: tracker, runner: async ({payload: p}) => { payload = p; return {ok: false, error: 'stop here'}; }});
  const queued = {...item, status: 'drafted', draftId: 'd1', sendingAccount: 'sender@business.test', email: 'zoe@business.test', firstname: 'Zoe', subject: 'Application',
    bodyPlainText: signedDraft().bodyPlainText.split(SIGNATURE_SEPARATOR)[0], bodyHtml: signedDraft().bodyHtml.split(SIGNATURE_MARKER)[0], attachment: {relativePath: 'cv.pdf'}};
  const edited = {subject: 'Application', bodyPlainText: queued.bodyPlainText.replace('Warm regards', 'Kind regards'), bodyHtml: queued.bodyHtml.replace('Warm regards', 'Kind regards')};
  await port.prepare({item: queued, next: edited}).catch(() => {});
  assert.ok(payload, 'the update worker was asked to prepare');
  assert.ok(payload.bodyPlainText.includes('Role details: ' + tokenUrl) && payload.bodyPlainText.includes('Kind regards'));
  assert.ok(payload.bodyHtml.includes('href="' + tokenUrl + '"'));
  assert.equal(tracker.links().length, 2, 'no new ids for an update');
});

test('the footnote wording comes from .env, can be reworded but not removed, and stays plain text', async () => {
  const own = 'I count clicks on these two links to see which are useful; nothing else is tracked & nothing is stored about you.';
  const store = createMemoryLinkTrackingStore();
  const out = await createLinkTracker({env: env({LINK_TRACKING_FOOTNOTE: '  ' + own + '  '}), store}).track(signedDraft(), item);
  assert.ok(out.bodyPlainText.endsWith('\n\n' + own));
  assert.ok(out.bodyHtml.endsWith(own.replace('&', '&amp;') + '</p>'), 'the wording is escaped in the formatted email');
  assert.equal(linkTrackingSettings(env({LINK_TRACKING_FOOTNOTE: ''})).footnote, LINK_TRACKING_FOOTNOTE, 'blank means the default, never no footnote');
  assert.match(LINK_TRACKING_FOOTNOTE, /click counter.*Nothing else is tracked\.$/);
  for (const bad of ['Too short', 'See https://example.test for details about this', '<b>Counted</b> when clicked, nothing else', 'x'.repeat(241)]) {
    const s = linkTrackingSettings(env({LINK_TRACKING_FOOTNOTE: bad}));
    assert.equal(s.ready, false, bad);
    assert.match(s.problems.join(' '), /LINK_TRACKING_FOOTNOTE/);
  }
  await assert.rejects(createLinkTracker({env: env({LINK_TRACKING_FOOTNOTE: 'Too short'}), store}).track(signedDraft(), {...item, id: 'q9'}), /LINK_TRACKING_FOOTNOTE/);
});

test('opt-outs: plain links and no footnote for that person or organisation, clicks stop counting, reversible', async () => {
  const {normaliseOptOut, optedOut} = await import('../../src/application/link-tracking.js');
  assert.equal(normaliseOptOut(' Zoe@Business.TEST '), 'zoe@business.test');
  assert.equal(normaliseOptOut('@business.test'), '@business.test');
  for (const bad of ['', 'zoe', '@', 'business.test', 'a b@c.d']) assert.equal(normaliseOptOut(bad), '', bad);
  assert.equal(optedOut('kim@business.test', [{value: '@business.test'}]), true);
  assert.equal(optedOut('kim@notbusiness.test', [{value: '@business.test'}]), false);

  const store = createMemoryLinkTrackingStore(), lines = [];
  const tracker = createLinkTracker({env: env(), store, log: l => lines.push(l)});
  const before = await tracker.track(signedDraft(), item);
  assert.equal(tracker.countableLinks().length, 2);
  assert.throws(() => tracker.setOptOut('not an address'), {code: 'OPT_OUT_INVALID'});
  assert.deepEqual(tracker.setOptOut('@Business.test').map(o => o.value), ['@business.test']);
  assert.equal(tracker.links().length, 2, 'ids are kept, so old drafts still compare');
  assert.equal(tracker.countableLinks().length, 0, 'clicks on links already sent stop counting');
  const fresh = signedDraft();
  assert.equal(await tracker.track(fresh, {...item, id: 'q5'}), fresh, 'new emails get plain links and no footnote');
  assert.ok(lines.some(l => /SKIPPED reason=opted-out queue=q5/.test(l)));
  const letter = {bodyPlainText: signedDraft().bodyPlainText.split(SIGNATURE_SEPARATOR)[0]};
  assert.equal((await tracker.track(letter, item, {scope: 'letter'})).bodyPlainText, before.bodyPlainText.split(SIGNATURE_SEPARATOR)[0], 'an existing tracked draft still compares like for like');
  assert.deepEqual(tracker.setOptOut('@business.test', false), []);
  assert.equal(tracker.countableLinks().length, 2);
  const optLines = lines.filter(l => l.includes('OPT_OUT'));
  assert.equal(optLines.length, 2);
  assert.ok(optLines.every(l => !l.includes('business.test')), 'the log never names who opted out');
});

test('clean-up: link ids older than the retention period are dropped when the store is saved', async () => {
  const {LINK_RETENTION_DAYS} = await import('../../src/application/link-tracking.js');
  assert.equal(LINK_RETENTION_DAYS, 180);
  const store = createMemoryLinkTrackingStore();
  store.write({links: [{id: 'oldoldold001', linkKey: 'p', queueId: 'old', email: 'a@b.test', createdAt: '2026-01-01T00:00:00.000Z'}], optOuts: [{value: 'x@y.test', at: '2026-01-01T00:00:00.000Z'}]});
  const tracker = createLinkTracker({env: env(), store, clock: () => Date.parse('2026-11-26T12:00:00Z')});
  await tracker.track(signedDraft(), item);
  assert.deepEqual(tracker.links().map(l => l.queueId), ['q1', 'q1']);
  assert.deepEqual(tracker.optOuts().map(o => o.value), ['x@y.test'], 'opt-outs are never cleaned up');
});
