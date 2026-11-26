// Pure rewriting of an outgoing email's two trackable links (LinkedIn advert and LinkedIn profile) to signed tracker
// links, plus the disclosure footnote. Signing happens elsewhere: this module only swaps addresses it is given.
import {advertLinkKey, targetFor} from './link-tokens.js';

// The default disclosure line; LINK_TRACKING_FOOTNOTE in .env replaces it (checked in the application layer).
export const LINK_TRACKING_FOOTNOTE = 'The links above go through a simple click counter so I can see which ones are useful. Nothing else is tracked.';
export const SIGNATURE_SEPARATOR = '\n-- \n';
export const SIGNATURE_MARKER = '<!-- application-gmail-signature:v1 -->';
const footnoteHtml = text => `<p style="color:#9ca3af;font-size:11px;line-height:1.4;margin:12px 0 0">${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
const URL_IN_TEXT = /https?:\/\/[^\s<>"'()\[\]]+/g;
const HREF = /(<a\b[^>]*?\shref\s*=\s*)(["'])([^"']*)\2([^>]*>)([\s\S]*?)(<\/a>)/gi;

const unescapeHtml = value => String(value).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const stripTags = value => unescapeHtml(String(value).replace(/<[^>]*>/g, '')).trim();

// The profile name part of a LinkedIn profile address (www., uk. and a trailing slash or query make no difference).
export function profileSlug(url) {
  const target = targetFor('p', {profileUrl: url});
  if (!target) return '';
  try { return decodeURIComponent(new URL(target).pathname).replace(/\/+$/, '').toLowerCase(); } catch { return ''; }
}

// Which tracked link (if any) a URL is: 'a-<job>' for the application's advert, 'p' for the owner's profile.
export function linkKeyForUrl(url, {advertKey = '', profileTarget = ''} = {}) {
  const value = String(url || '').trim();
  if (advertKey && advertLinkKey(value) === advertKey) return advertKey;
  if (profileTarget && profileSlug(value) && profileSlug(value) === profileSlug(profileTarget)) return 'p';
  return '';
}

function rewriteHtml(html, find, urlFor) {
  return String(html).replace(HREF, (all, start, quote, href, rest, inner, end) => {
    const key = find(unescapeHtml(href));
    if (!key) return all;
    const tracked = urlFor(key);
    // A link whose visible text is the address itself shows the tracked address, so text and link never disagree.
    const visible = stripTags(inner);
    const text = /^https?:\/\//i.test(visible) && find(visible) === key ? tracked : inner;
    return start + quote + tracked + quote + rest + text + end;
  });
}
function rewritePlain(text, find, urlFor) {
  return String(text).replace(URL_IN_TEXT, url => { const key = find(url); return key ? urlFor(key) : url; });
}

// Finds the tracked links present. scope 'letter' looks only above the signature (advert); 'all' also looks in the
// signature (profile). Returns the link keys in first-seen order.
export function findTrackedLinks({bodyPlainText = '', bodyHtml = ''}, {advertKey = '', profileTarget = '', scope = 'all'} = {}) {
  const parts = splitMessage({bodyPlainText, bodyHtml});
  const keys = new Set();
  const note = scopeAdvert => url => { const k = linkKeyForUrl(url, {advertKey, profileTarget: scopeAdvert ? '' : profileTarget}); if (k) keys.add(k); return ''; };
  rewriteHtml(parts.letterHtml, note(true), () => ''); rewritePlain(parts.letterPlain, note(true), () => '');
  if (scope === 'all') { rewriteHtml(parts.signatureHtml, note(false), () => ''); rewritePlain(parts.signaturePlain, note(false), () => ''); }
  return [...keys];
}

export function splitMessage({bodyPlainText = '', bodyHtml = ''}) {
  const plain = String(bodyPlainText), html = String(bodyHtml || '');
  const p = plain.indexOf(SIGNATURE_SEPARATOR), h = html.indexOf(SIGNATURE_MARKER);
  return {
    letterPlain: p < 0 ? plain : plain.slice(0, p), signaturePlain: p < 0 ? '' : plain.slice(p),
    letterHtml: h < 0 ? html : html.slice(0, h), signatureHtml: h < 0 ? '' : html.slice(h),
    signed: p >= 0 && h >= 0
  };
}

// Swaps each found link for urls[linkKey]. The advert is only swapped above the signature and the profile only in
// the signature. With footnote, the disclosure line (footnoteText, or the default) goes at the very end.
export function rewriteTrackedLinks(message, {advertKey = '', profileTarget = '', urls = {}, footnote = false, footnoteText = LINK_TRACKING_FOOTNOTE, scope = 'all'} = {}) {
  const parts = splitMessage(message);
  const urlFor = key => urls[key];
  const inLetter = url => { const k = linkKeyForUrl(url, {advertKey}); return k && urls[k] ? k : ''; };
  const inSignature = url => { const k = linkKeyForUrl(url, {profileTarget}); return k && urls[k] ? k : ''; };
  let letterHtml = rewriteHtml(parts.letterHtml, inLetter, urlFor), letterPlain = rewritePlain(parts.letterPlain, inLetter, urlFor);
  let signatureHtml = parts.signatureHtml, signaturePlain = parts.signaturePlain;
  if (scope === 'all') { signatureHtml = rewriteHtml(signatureHtml, inSignature, urlFor); signaturePlain = rewritePlain(signaturePlain, inSignature, urlFor); }
  let bodyPlainText = letterPlain + signaturePlain, bodyHtml = letterHtml + signatureHtml;
  if (footnote) { bodyPlainText = bodyPlainText.trimEnd() + '\n\n' + footnoteText; if (bodyHtml) bodyHtml = bodyHtml.trimEnd() + footnoteHtml(footnoteText); }
  return {...message, bodyPlainText, ...(message.bodyHtml === undefined ? {} : {bodyHtml})};
}
