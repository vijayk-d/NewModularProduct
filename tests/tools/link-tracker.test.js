import test from 'node:test';
import assert from 'node:assert/strict';
import {signLinkToken, verifyLinkToken, targetFor, advertLinkKey, newLinkId} from '../../src/domain/outreach/link-tokens.js';
import {handleRequest, scannerReason, RETENTION_SECONDS} from '../../tools/link-tracker/src/worker.js';

// Synthetic keys and addresses only.
const SIGNING_KEY = 'test-signing-key-0123456789abcdef0123456789';
const READ_KEY = 'test-read-key-abcdef0123456789abcdef0123456789';
const PROFILE_URL = 'https://www.linkedin.com/in/test-candidate/';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

function fakeKv() {
  const rows = new Map();
  return {rows, puts: [],
    async put(key, value, options) { this.puts.push({key, options}); rows.set(key, {value, ...options}); },
    async list({prefix = '', cursor, limit = 1000}) {
      const names = [...rows.keys()].filter(k => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0, page = names.slice(start, start + limit);
      return {keys: page.map(name => ({name, metadata: rows.get(name).metadata})), list_complete: start + limit >= names.length, cursor: String(start + limit)};
    }};
}
const env = (kv = fakeKv()) => ({CLICKS: kv, SIGNING_KEY, READ_KEY, PROFILE_URL});
const get = (path, headers = {'user-agent': BROWSER}, method = 'GET') => new Request('https://jobapp-links.example.workers.dev' + path, {method, headers});

test('tokens are signed, carry nothing personal, and any change breaks them', async () => {
  const id = newLinkId();
  assert.match(id, /^[A-Za-z0-9_-]{16}$/);
  const token = await signLinkToken({linkKey: 'p', id, signingKey: SIGNING_KEY});
  assert.match(token, /^p\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(await verifyLinkToken(token, SIGNING_KEY), {linkKey: 'p', id});
  assert.equal(await verifyLinkToken(token, SIGNING_KEY.replace('0', '1')), null, 'another key');
  assert.equal(await verifyLinkToken(token.replace(/^p\./, 'a-1234567.'), SIGNING_KEY), null, 'link swapped');
  assert.equal(await verifyLinkToken(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), SIGNING_KEY), null, 'signature changed');
  for (const bad of ['', 'p..x', 'x.' + id + '.' + 'A'.repeat(22), 'p.' + id, null]) assert.equal(await verifyLinkToken(bad, SIGNING_KEY), null);
  await assert.rejects(signLinkToken({linkKey: 'https://evil.test', signingKey: SIGNING_KEY}), /Unknown tracked link/);
  await assert.rejects(signLinkToken({linkKey: 'p', signingKey: 'short'}), /at least 32/);
});

test('only LinkedIn job adverts and the configured LinkedIn profile can be targets', () => {
  assert.equal(advertLinkKey('https://www.linkedin.com/jobs/view/4123456789/?trackingId=x'), 'a-4123456789');
  assert.equal(advertLinkKey('https://uk.linkedin.com/jobs/view/delivery-manager-at-example-4123456789'), 'a-4123456789');
  assert.equal(advertLinkKey('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4123456789'), 'a-4123456789');
  assert.equal(advertLinkKey('https://www.linkedin.com/jobs/search/?currentJobId=4123456789'), 'a-4123456789');
  for (const other of ['https://example.test/jobs/view/4123456789', 'http://www.linkedin.com/jobs/view/4123456789', 'https://linkedin.com.evil.test/jobs/view/4123456789', 'not a url']) assert.equal(advertLinkKey(other), '', other);
  assert.equal(targetFor('a-4123456789'), 'https://www.linkedin.com/jobs/view/4123456789/');
  assert.equal(targetFor('p', {profileUrl: PROFILE_URL + '?utm=x'}), PROFILE_URL);
  assert.equal(targetFor('p', {profileUrl: 'https://evil.test/in/test'}), '');
  assert.equal(targetFor('p', {}), '', 'no profile configured');
});

test('a click is noted without personal details and the person is sent straight on', async () => {
  const kv = fakeKv();
  const token = await signLinkToken({linkKey: 'a-4123456789', id: 'abcdefghijkl', signingKey: SIGNING_KEY});
  const r = await handleRequest(get('/c/' + token, {'user-agent': BROWSER, 'cf-connecting-ip': '203.0.113.9'}), env(kv), null, Date.parse('2026-11-26T10:00:00Z'));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://www.linkedin.com/jobs/view/4123456789/');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(kv.puts.length, 1);
  assert.equal(kv.puts[0].options.expirationTtl, RETENTION_SECONDS);
  assert.deepEqual(kv.puts[0].options.metadata, {id: 'abcdefghijkl', linkKey: 'a-4123456789', at: '2026-11-26T10:00:00.000Z', scanner: ''});
  const stored = JSON.stringify(kv.puts);
  assert.ok(!stored.includes('203.0.113.9') && !stored.includes('Chrome'), 'no IP address or browser details are stored');
});

test('the redirect never waits for, or fails because of, the note', async () => {
  const waited = [];
  const broken = {...env(), CLICKS: {async put() { throw new Error('KV down'); }}};
  const token = await signLinkToken({linkKey: 'p', signingKey: SIGNING_KEY});
  const r = await handleRequest(get('/c/' + token), broken, {waitUntil: p => waited.push(p)});
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), PROFILE_URL);
  assert.equal(waited.length, 1);
  await waited[0];
});

test('forged, unknown or unconfigured links never redirect and are not noted', async () => {
  const kv = fakeKv();
  const forged = await signLinkToken({linkKey: 'a-4123456789', signingKey: 'another-key-0123456789abcdef0123456789'});
  const profile = await signLinkToken({linkKey: 'p', signingKey: SIGNING_KEY});
  for (const [path, e] of [['/c/' + forged, env(kv)], ['/c/not-a-token', env(kv)], ['/c/' + profile, {...env(kv), PROFILE_URL: ''}], ['/', env(kv)], ['/c/' + profile + '/x', env(kv)]]) {
    const r = await handleRequest(get(path), e);
    assert.equal(r.status, 404, path);
    assert.equal(r.headers.get('location'), null);
  }
  const post = await handleRequest(get('/c/' + profile, {}, 'POST'), env(kv));
  assert.equal(post.status, 404);
  assert.equal(kv.puts.length, 0);
});

test('scanner checks are marked so the app can ignore them', async () => {
  const kv = fakeKv();
  const token = await signLinkToken({linkKey: 'p', signingKey: SIGNING_KEY});
  await handleRequest(get('/c/' + token, {'user-agent': BROWSER}, 'HEAD'), env(kv));
  await handleRequest(get('/c/' + token, {}), env(kv));
  await handleRequest(get('/c/' + token, {'user-agent': 'Mozilla/5.0 (compatible; Mimecast-URL-Protect)'}), env(kv));
  await handleRequest(get('/c/' + token, {'user-agent': BROWSER, 'sec-purpose': 'prefetch'}), env(kv));
  assert.deepEqual(kv.puts.map(p => p.options.metadata.scanner), ['head-request', 'no-browser', 'known-scanner', 'prefetch']);
  assert.equal(scannerReason(get('/c/x')), '');
});

test('the app reads clicks only with the read key, newest after "since", page by page', async () => {
  const kv = fakeKv();
  const token = await signLinkToken({linkKey: 'p', id: 'abcdefghijkl', signingKey: SIGNING_KEY});
  for (const at of ['2026-11-20T09:00:00Z', '2026-11-25T09:00:00Z', '2026-11-26T09:00:00Z']) await handleRequest(get('/c/' + token), env(kv), null, Date.parse(at));
  assert.equal((await handleRequest(get('/api/clicks'), env(kv))).status, 401);
  assert.equal((await handleRequest(get('/api/clicks', {authorization: 'Bearer wrong'}), env(kv))).status, 401);
  assert.equal((await handleRequest(get('/api/clicks', {authorization: 'Bearer ' + READ_KEY}), {...env(kv), READ_KEY: 'short'})).status, 401, 'a weak read key is refused');
  const auth = {authorization: 'Bearer ' + READ_KEY};
  const all = await (await handleRequest(get('/api/clicks', auth), env(kv))).json();
  assert.deepEqual(all.clicks.map(c => c.at), ['2026-11-20T09:00:00.000Z', '2026-11-25T09:00:00.000Z', '2026-11-26T09:00:00.000Z']);
  assert.deepEqual(Object.keys(all.clicks[0]).sort(), ['at', 'id', 'linkKey', 'scanner']);
  assert.equal(all.complete, true);
  const recent = await (await handleRequest(get('/api/clicks?since=2026-11-24T00:00:00Z', auth), env(kv))).json();
  assert.equal(recent.clicks.length, 2);
  assert.equal((await handleRequest(get('/api/clicks?since=yesterday', auth), env(kv))).status, 400);
});

test('the privacy page says what is and is not recorded', async () => {
  const r = await handleRequest(get('/privacy'), env());
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Not recorded: your IP address, location, browser or device/);
  assert.match(html, /deleted after 90 days/);
  assert.match(html, /lang="en-GB"/);
});
