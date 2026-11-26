import test from 'node:test';
import assert from 'node:assert/strict';
import {countableClicks, clickSummary, latestClickByReview, SCANNER_WINDOW_MS} from '../../src/domain/outreach/link-clicks.js';
import {createLinkClickService} from '../../src/application/link-click-tracking.js';
import {createMemoryLinkClicksStore, createLinkClickReader} from '../../src/infrastructure/link-clicks-file.js';
import {nextStepFor} from '../../src/domain/workflow/next-steps.js';
import {createNextStepsService} from '../../src/application/next-steps.js';

// Synthetic people, ids and keys only.
const READ_KEY = 'test-read-key-abcdef0123456789abcdef0123456789';
const links = [
  {id: 'advertid0001', linkKey: 'a-4123456789', queueId: 'q1', reviewId: 'r1', email: 'sam@agency.test'},
  {id: 'profileid001', linkKey: 'p', queueId: 'q1', reviewId: 'r1', email: 'sam@agency.test'},
  {id: 'advertid0002', linkKey: 'a-4123456789', queueId: 'q2', reviewId: 'r1', email: 'lee@agency.test'},
  {id: 'otherapp0001', linkKey: 'p', queueId: 'q3', reviewId: 'r2', email: 'kim@other.test'}
];
const sent = [{queueId: 'q1', reviewId: 'r1', status: 'sent', sentAt: '2026-11-20T10:00:00.000Z'}, {queueId: 'q2', reviewId: 'r1', status: 'sent', sentAt: '2026-11-20T11:00:00.000Z'}];
const click = (id, linkKey, at, scanner = '') => ({id, linkKey, at, scanner});

test('only clicks by a person on links this app gave out count', () => {
  const counted = countableClicks([
    click('advertid0001', 'a-4123456789', '2026-11-20T10:00:30.000Z'),           // within a minute of sending
    click('advertid0001', 'a-4123456789', '2026-11-21T09:00:00.000Z', 'prefetch'), // marked by the tracker
    click('advertid0001', 'a-4123456789', '2026-11-21T09:05:00.000Z'),
    click('advertid0001', 'p', '2026-11-21T09:06:00.000Z'),                        // id and link do not match
    click('unknownid001', 'p', '2026-11-21T09:07:00.000Z'),                        // not ours
    click('profileid001', 'p', '2026-11-22T12:00:00.000Z'),
    click('advertid0002', 'a-4123456789', '2026-11-20T11:00:00.000Z')              // at the moment of sending
  ], links, sent);
  assert.deepEqual(counted.map(c => [c.kind, c.email, c.at]), [['advert', 'sam@agency.test', '2026-11-21T09:05:00.000Z'], ['profile', 'sam@agency.test', '2026-11-22T12:00:00.000Z']]);
  assert.equal(SCANNER_WINDOW_MS, 60000);
  const unsent = countableClicks([click('otherapp0001', 'p', '2026-11-22T12:00:00.000Z')], links, sent);
  assert.equal(unsent.length, 1, 'a tracked draft sent by hand from Gmail still counts');
});

test('counts per application and recipient', () => {
  const counted = countableClicks([
    click('advertid0001', 'a-4123456789', '2026-11-21T09:05:00.000Z'), click('advertid0001', 'a-4123456789', '2026-11-21T10:00:00.000Z'),
    click('advertid0002', 'a-4123456789', '2026-11-23T08:00:00.000Z'), click('otherapp0001', 'p', '2026-11-22T12:00:00.000Z')], links, sent);
  const r1 = clickSummary(counted, 'r1');
  assert.deepEqual({total: r1.total, advert: r1.advert, profile: r1.profile, lastAt: r1.lastAt}, {total: 3, advert: 3, profile: 0, lastAt: '2026-11-23T08:00:00.000Z'});
  assert.deepEqual(r1.contacts.map(c => [c.email, c.advert]), [['lee@agency.test', 1], ['sam@agency.test', 2]]);
  assert.equal(clickSummary(counted, 'r9'), null);
  assert.deepEqual(latestClickByReview(counted), {r1: '2026-11-23T08:00:00.000Z', r2: '2026-11-22T12:00:00.000Z'});
});

test('check reads every page once, keeps only our links, saves, and never reads twice', async () => {
  const store = createMemoryLinkClicksStore(), calls = [];
  const pages = {'': {clicks: [click('advertid0001', 'a-4123456789', '2026-11-21T09:05:00.000Z'), click('unknownid001', 'p', '2026-11-21T09:07:00.000Z')], cursor: 'next', complete: false},
    next: {clicks: [click('profileid001', 'p', '2026-11-22T12:00:00.000Z'), click('profileid001', 'p', '2026-11-22T12:00:05.000Z', 'known-scanner')], cursor: '', complete: true}};
  let now = Date.parse('2026-11-26T12:00:00Z');
  const service = createLinkClickService({store, links: () => links, sentEmails: () => sent, now: () => now, fetchClicks: async args => { calls.push(args); return pages[args.cursor]; }});
  assert.deepEqual(service.forReview('r1'), {available: true, checkedAt: '', review: null});
  const first = await service.check('r1');
  assert.deepEqual(calls, [{since: '', cursor: ''}, {since: '', cursor: 'next'}]);
  assert.equal(first.newClicks, 2, 'the scanner check is saved but not reported');
  assert.equal(first.review.total, 2);
  assert.equal(store.read().clicks.length, 3);
  assert.ok(!JSON.stringify(store.read()).includes('unknownid001'));
  now += 3600e3;
  const second = await service.check('r1');
  assert.equal(calls[2].since, '2026-11-26T11:00:00.000Z', 'later checks ask only for clicks since the last check, with an hour of overlap');
  assert.equal(second.newClicks, 0, 'clicks already read are not counted again');
  assert.equal(store.read().clicks.length, 3);
  assert.deepEqual(service.latestByReview(), {r1: '2026-11-22T12:00:00.000Z'});
});

test('failures change nothing and are never retried', async () => {
  const store = createMemoryLinkClicksStore();
  let calls = 0;
  const down = createLinkClickService({store, links: () => links, fetchClicks: async () => { calls++; throw new Error('network'); }});
  await assert.rejects(down.check('r1'), e => e.code === 'CLICKS_UNREACHABLE' && /Nothing was changed/.test(e.message));
  assert.equal(calls, 1);
  assert.deepEqual(store.read(), {});
  const odd = createLinkClickService({store, links: () => links, fetchClicks: async () => ({nope: true})});
  await assert.rejects(odd.check('r1'), {code: 'CLICKS_INVALID'});
  const off = createLinkClickService({store, links: () => links, fetchClicks: null});
  assert.equal(off.forReview('r1').available, false);
  await assert.rejects(off.check('r1'), e => e.code === 'CLICKS_NOT_SET_UP' && /LINK_TRACKING_READ_KEY/.test(e.message));
});

test('the reader needs the address and a strong read key, sends the key only as a header, and makes one request', async () => {
  assert.equal(createLinkClickReader({env: {}}), null);
  assert.equal(createLinkClickReader({env: {LINK_TRACKING_BASE_URL: 'https://links.example.test', LINK_TRACKING_READ_KEY: 'short'}}), null);
  assert.equal(createLinkClickReader({env: {LINK_TRACKING_BASE_URL: 'http://links.example.test', LINK_TRACKING_READ_KEY: READ_KEY}}), null);
  const requests = [];
  const reader = createLinkClickReader({env: {LINK_TRACKING_BASE_URL: 'https://links.example.test/', LINK_TRACKING_READ_KEY: READ_KEY},
    fetchImpl: async (url, options) => { requests.push({url: String(url), options}); return {ok: true, json: async () => ({ok: true, clicks: [], cursor: 'c2', complete: false})}; }});
  assert.deepEqual(await reader({since: '2026-11-26T11:00:00.000Z', cursor: 'c1'}), {clicks: [], cursor: 'c2', complete: false});
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://links.example.test/api/clicks?since=2026-11-26T11%3A00%3A00.000Z&cursor=c1');
  assert.equal(requests[0].options.headers.authorization, 'Bearer ' + READ_KEY);
  assert.ok(!requests[0].url.includes(READ_KEY));
  const refused = createLinkClickReader({env: {LINK_TRACKING_BASE_URL: 'https://links.example.test', LINK_TRACKING_READ_KEY: READ_KEY}, fetchImpl: async () => ({ok: false, status: 401})});
  await assert.rejects(refused({}), /401/);
});

test('a click after the last send, with no reply, makes an amber follow-up step', () => {
  const review = {id: 'r1', jobTitle: 'Delivery Lead', organisation: 'Example', updatedAt: '2026-11-20T09:00:00Z'};
  const now = Date.parse('2026-11-23T12:00:00Z'), sentRows = [{status: 'sent', sentAt: '2026-11-20T10:00:00Z'}];
  const clicked = nextStepFor({review, sent: sentRows, lastClickAt: '2026-11-22T12:00:00.000Z', now});
  assert.equal(clicked.level, 'amber');
  assert.equal(clicked.action, 'Follow up: link clicked 1 day ago');
  assert.equal(nextStepFor({review, sent: sentRows, now}).level, 'green', 'no click: still waiting');
  assert.equal(nextStepFor({review, sent: sentRows, lastClickAt: '2026-11-19T12:00:00.000Z', now}).level, 'green', 'a click before the send does not count');
  assert.equal(nextStepFor({review, sent: sentRows, lastClickAt: '2026-11-22T12:00:00.000Z', outcome: {outcome: 'interview', occurredOn: '2026-12-20'}, now}).action.startsWith('Follow up'), false, 'they responded');
  assert.equal(nextStepFor({review, sent: sentRows, lastClickAt: '2026-11-22T12:00:00.000Z', now: Date.parse('2026-12-10T12:00:00Z')}).action.startsWith('Follow up: link'), false, 'old clicks fall back to the usual follow-up');
});

test('next steps use the latest click per application', () => {
  const reviews = {summaries: () => ({items: [{id: 'r1', jobTitle: 'Delivery Lead', organisation: 'Example', updatedAt: '2026-11-20T09:00:00Z'}]})};
  const service = createNextStepsService({reviews, sentEmails: () => [{reviewId: 'r1', status: 'sent', sentAt: '2026-11-20T10:00:00Z'}], linkClicks: () => ({r1: '2026-11-22T12:00:00.000Z'}), now: () => Date.parse('2026-11-23T12:00:00Z')});
  assert.equal(service.forReview('r1').action, 'Follow up: link clicked 1 day ago');
  const broken = createNextStepsService({reviews, sentEmails: () => [{reviewId: 'r1', status: 'sent', sentAt: '2026-11-20T10:00:00Z'}], linkClicks: () => { throw new Error('disk'); }, now: () => Date.parse('2026-11-23T12:00:00Z')});
  assert.equal(broken.forReview('r1').level, 'green', 'a broken click store never breaks the page');
});
