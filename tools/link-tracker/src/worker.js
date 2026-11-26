// JobApp link-click tracker: a Cloudflare Worker (free tier). Clicks only: no open tracking, no pixels.
//
//   GET /c/<token>       checks the signature, notes the click, sends the person straight on to the LinkedIn page
//   HEAD /c/<token>      same redirect; noted as a scanner check, not a click
//   GET /api/clicks      the app reads new clicks (Authorization: Bearer <READ_KEY>; ?since=<ISO time>&cursor=)
//   GET /privacy         what is recorded, in plain words
//
// Recorded per click: the random link id, which link (profile or advert), the time, and whether it looks like an email
// security scanner. Never an IP address, location, browser or device details. Records delete themselves after 90 days.
//
// Settings (wrangler secrets): SIGNING_KEY, READ_KEY, PROFILE_URL. Storage: the CLICKS KV namespace.
import {verifyLinkToken, targetFor} from '../../../src/domain/outreach/link-tokens.js';

export const RETENTION_SECONDS = 90 * 24 * 60 * 60;
const SCANNER_AGENT = /mimecast|proofpoint|barracuda|safelinks|safe links|microsoft office|ms-office|bingpreview|symantec|forcepoint|sophos|trend ?micro|cisco|ironport|fireeye|zscaler|google-safety|googleimageproxy|yahoomailproxy|headlesschrome|phantomjs|python|curl|wget|go-http-client|okhttp|java\/|libwww|httpclient|axios|node-fetch|bot\b|crawler|spider|scanner|preview/i;
const PAGE_HEADERS = {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow', 'x-content-type-options': 'nosniff'};

// Why a request looks like an automatic check rather than a person, or '' for a likely person. The user agent is
// only looked at here; it is never stored.
export function scannerReason(request) {
  if (request.method === 'HEAD') return 'head-request';
  const purpose = (request.headers.get('purpose') || request.headers.get('sec-purpose') || '').toLowerCase();
  if (purpose.includes('prefetch')) return 'prefetch';
  const agent = request.headers.get('user-agent') || '';
  if (!agent) return 'no-browser';
  if (SCANNER_AGENT.test(agent)) return 'known-scanner';
  return '';
}

function page(status, title, body) {
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>`
    + '<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#1e293b}</style></head>'
    + `<body><h1>${title}</h1>${body}</body></html>`;
  return new Response(html, {status, headers: PAGE_HEADERS});
}

function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function recordClick(env, {linkKey, id}, scanner, now) {
  const at = new Date(now).toISOString();
  const key = `c:${at}:${id}:${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
  await env.CLICKS.put(key, '', {expirationTtl: RETENTION_SECONDS, metadata: {id, linkKey, at, scanner}});
}

async function listClicks(request, env, url) {
  const auth = request.headers.get('authorization') || '';
  if (!env.READ_KEY || env.READ_KEY.length < 32 || !sameText(auth, 'Bearer ' + env.READ_KEY)) return Response.json({ok: false, error: 'Not allowed.'}, {status: 401, headers: {'cache-control': 'no-store'}});
  const since = url.searchParams.get('since') || '';
  if (since && Number.isNaN(Date.parse(since))) return Response.json({ok: false, error: 'since must be an ISO time.'}, {status: 400});
  const cursor = url.searchParams.get('cursor') || undefined;
  const listed = await env.CLICKS.list({prefix: 'c:', cursor, limit: 1000});
  const after = since ? 'c:' + new Date(since).toISOString() : '';
  const clicks = listed.keys.filter(k => !after || k.name > after).map(k => ({id: k.metadata?.id || '', linkKey: k.metadata?.linkKey || '', at: k.metadata?.at || '', scanner: k.metadata?.scanner || ''})).filter(c => c.id && c.at);
  return Response.json({ok: true, clicks, cursor: listed.list_complete ? '' : listed.cursor || '', complete: Boolean(listed.list_complete)}, {headers: {'cache-control': 'no-store'}});
}

export async function handleRequest(request, env, ctx = null, now = Date.now()) {
  const url = new URL(request.url);
  if (url.pathname === '/privacy' && request.method === 'GET') {
    return page(200, 'About these links', '<p>Some links in emails from this sender go through this address first. It counts that the link was clicked, so the sender knows the link was useful, then takes you straight to the page.</p>'
      + '<p>Recorded: a random link number, which link it was, and the time. Not recorded: your IP address, location, browser or device. Nothing is read from your mailbox and email opens are not tracked. Records are deleted after 90 days.</p>');
  }
  if (url.pathname === '/api/clicks' && request.method === 'GET') return listClicks(request, env, url);
  const match = /^\/c\/([^/]{1,80})$/.exec(url.pathname);
  if (!match || !['GET', 'HEAD'].includes(request.method)) return page(404, 'Page not found', '<p>There is nothing here.</p>');
  const token = await verifyLinkToken(decodeURIComponent(match[1]), env.SIGNING_KEY);
  const target = token ? targetFor(token.linkKey, {profileUrl: env.PROFILE_URL}) : '';
  if (!target) return page(404, 'This link is not valid', '<p>The link may have been copied incompletely. Please use the original link in the email.</p>');
  // Note the click without making the person wait; a failed note never blocks the redirect.
  const noting = recordClick(env, token, scannerReason(request), now).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(noting); else await noting;
  return new Response(null, {status: 302, headers: {location: target, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow'}});
}

export default {fetch: (request, env, ctx) => handleRequest(request, env, ctx)};
