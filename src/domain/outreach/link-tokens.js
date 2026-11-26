// Signed link tokens for link-click tracking. Shared by the app and the Cloudflare Worker (tools/link-tracker).
// Uses only Web Crypto, so the same code runs in the Worker and in Node 24.
//
// Token: <linkKey>.<id>.<signature>
//   linkKey  "p"          your LinkedIn profile (the Worker holds the address in its own secret settings)
//            "a-<digits>" a LinkedIn job advert; the Worker only ever sends people to linkedin.com/jobs/view/<digits>/
//   id       random, 12-24 characters; which recipient it belongs to is known only to your PC
//   signature  first 16 bytes of HMAC-SHA256(signingKey, "<linkKey>.<id>"), base64url
// Nothing personal is in the token: no name, address, employer or job title.

const LINK_KEY = /^(?:p|a-[0-9]{4,15})$/;
const ID = /^[A-Za-z0-9_-]{12,24}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{22}$/;
const encoder = new TextEncoder();

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signature(signingKey, message) {
  if (typeof signingKey !== 'string' || signingKey.length < 32) throw new Error('The link signing key must be at least 32 characters.');
  const key = await crypto.subtle.importKey('raw', encoder.encode(signingKey), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message))).slice(0, 16));
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function newLinkId() {
  return base64url(crypto.getRandomValues(new Uint8Array(12)));
}

// The link key for a LinkedIn job advert address, or '' when the address is not a LinkedIn job advert.
export function advertLinkKey(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' || !/^(?:[a-z]{2,3}\.|www\.)?linkedin\.com$/i.test(u.hostname)) return '';
    const view = /^\/jobs\/view\/(?:[^/]*?-)?([0-9]{4,15})\/?$/.exec(u.pathname);
    const current = /^\/jobs\/(?:collections|search)(?:\/|$)/.test(u.pathname) ? /^[0-9]{4,15}$/.exec(u.searchParams.get('currentJobId') || '') : null;
    const id = view?.[1] || current?.[0];
    return id ? 'a-' + id : '';
  } catch { return ''; }
}

export async function signLinkToken({linkKey, id = newLinkId(), signingKey}) {
  if (!LINK_KEY.test(String(linkKey))) throw new Error('Unknown tracked link.');
  if (!ID.test(String(id))) throw new Error('Invalid link id.');
  return `${linkKey}.${id}.${await signature(signingKey, linkKey + '.' + id)}`;
}

// Returns {linkKey, id} for a genuine token, or null. Never throws on bad input.
export async function verifyLinkToken(token, signingKey) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [linkKey, id, sig] = parts;
  if (!LINK_KEY.test(linkKey) || !ID.test(id) || !SIGNATURE.test(sig)) return null;
  try { return sameText(await signature(signingKey, linkKey + '.' + id), sig) ? {linkKey, id} : null; } catch { return null; }
}

// Where a verified token may send someone. Only LinkedIn addresses, so the Worker can never redirect anywhere else.
export function targetFor(linkKey, {profileUrl = ''} = {}) {
  if (linkKey === 'p') {
    try {
      const u = new URL(String(profileUrl));
      return u.protocol === 'https:' && /^(?:[a-z]{2,3}\.|www\.)?linkedin\.com$/i.test(u.hostname) && /^\/in\/[A-Za-z0-9_%-]{2,100}\/?$/.test(u.pathname) ? u.origin + u.pathname : '';
    } catch { return ''; }
  }
  const advert = /^a-([0-9]{4,15})$/.exec(String(linkKey));
  return advert ? `https://www.linkedin.com/jobs/view/${advert[1]}/` : '';
}
