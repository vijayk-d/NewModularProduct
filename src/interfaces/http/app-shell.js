// Shared application shell: one floating top navigation bar and a clear environment marker
// (colour, badge, production tab title) on every HTML page. Pure HTML/CSS, no client script.
import { featureEnabled } from '../../config/feature-toggles.js';

const icon = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
const I = Object.freeze({
  add: 'M12 5v14 M5 12h14',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  send: 'M22 2 11 13 M22 2l-7 20-4-9-9-4z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z M4 19.5V21h16',
  letter: 'M4 4h16v16H4z M4 6l8 7 8-7',
  cv: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M14 3v6h6 M8 13h8 M8 17h5',
  evidence: 'M9 12l2 2 4-4 M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z',
  toggle: 'M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7z M16 12h0',
  tools: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  chevron: 'M6 9l6 6 6-6',
});

// Groups shown left to right. "primary" items appear directly on the bar; others sit in a dropdown.
export const NAV_GROUPS = Object.freeze([
  { label: 'Applications', primary: true, items: [
    { href: '/', label: 'New application', icon: I.add, match: (p) => p === '/' },
    { href: '/applications', label: 'Saved applications', icon: I.folder, match: (p) => p === '/applications' || p.startsWith('/applications/') || p === '/application-reviews' },
    { href: '/dashboard', label: 'Dashboard', icon: I.chart },
  ] },
  { label: 'Outreach', primary: true, items: [
    { href: '/outreach-queue', label: 'Outreach queue', icon: I.send },
    { href: '/outreach-scheduling', label: 'Email scheduling', icon: I.clock },
  ] },
  { label: 'Libraries', icon: I.book, items: [
    { href: '/cover-letter-library', label: 'Cover-letter library', icon: I.letter },
    { href: '/cv-library', label: 'CV library', icon: I.cv },
    { href: '/evidence-library', label: 'Evidence library', icon: I.evidence, feature: 'evidence-library' },
  ] },
  { label: 'System', icon: I.tools, items: [
    { href: '/settings/features', label: 'Feature toggles', icon: I.toggle },
    { href: '/maintenance', label: 'Maintenance library', icon: I.tools },
    { href: '/system-check', label: 'System check', icon: I.evidence },
    { href: '/healthz', label: 'Health check', icon: I.pulse },
  ] },
]);

const ENVIRONMENTS = Object.freeze({
  development: { label: 'Development', short: 'DEV' },
  production: { label: 'Production', short: 'PROD' },
  verification: { label: 'Verification', short: 'TEST' },
});

export function shellEnvironment(env = process.env) {
  const id = Object.hasOwn(ENVIRONMENTS, env.NMP_ENV || 'development') ? (env.NMP_ENV || 'development') : 'development';
  const release = String(env.NMP_RELEASE_COMMIT || '');
  return { id, ...ENVIRONMENTS[id], port: String(env.PORT || (id === 'production' ? '3100' : '3000')), release: /^[0-9a-f]{7,40}$/i.test(release) ? release.slice(0, 7) : '' };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isCurrent = (item, path) => (item.match ? item.match(path) : path === item.href || path.startsWith(item.href + '/'));
const link = (item, path, cls) => `<a class="${cls}" href="${item.href}" title="${esc(item.label)}"${isCurrent(item, path) ? ' aria-current="page"' : ''}>${icon(item.icon)}<span>${esc(item.label)}</span></a>`;

export function renderShell(pathname = '/', env = process.env) {
  const e = shellEnvironment(env);
  const other = e.id === 'production' ? { label: 'Development', url: 'http://127.0.0.1:3000' + pathname } : e.id === 'development' ? { label: 'Production', url: 'http://127.0.0.1:3100' + pathname } : null;
  const groups = NAV_GROUPS.map(g => ({ ...g, items: g.items.filter(i => !i.feature || featureEnabled(i.feature, env)) })).map((g) => {
    if (g.primary) return `<div class="nmp-shell__group" role="group" aria-label="${esc(g.label)}">${g.items.map((i) => link(i, pathname, 'nmp-shell__link')).join('')}</div>`;
    const active = g.items.some((i) => isCurrent(i, pathname));
    return `<div class="nmp-shell__menu${active ? ' is-active' : ''}"><button type="button" class="nmp-shell__link nmp-shell__menu-button" aria-haspopup="true">${icon(g.icon)}<span>${esc(g.label)}</span>${icon(I.chevron)}</button><div class="nmp-shell__dropdown" role="group" aria-label="${esc(g.label)}">${g.items.map((i) => link(i, pathname, 'nmp-shell__item')).join('')}</div></div>`;
  }).join('');
  const badge = `<span class="nmp-shell__env" title="${esc(e.label)} environment on port ${esc(e.port)}${e.release ? ', release ' + esc(e.release) : ''}"><strong class="nmp-shell__env-long">${esc(e.label)}</strong><strong class="nmp-shell__env-short">${esc(e.short)}</strong><span class="nmp-shell__env-port"> · ${esc(e.port)}</span></span>`;
  const switcher = other ? `<a class="nmp-shell__switch" href="${esc(other.url)}" title="Open the same page in ${esc(other.label)}">${esc(other.label)} ↗</a>` : '';
  return `<header class="nmp-shell" data-nmp-shell="v1"><nav class="nmp-shell__nav" aria-label="Main">${groups}</nav><div class="nmp-shell__right">${badge}${switcher}</div></header><div class="nmp-shell-spacer" aria-hidden="true"></div>`;
}

export function injectShell(html, pathname, env = process.env) {
  if (typeof html !== 'string' || html.includes('data-nmp-shell=') || !/<body[\s>]/i.test(html) || !/<\/head>/i.test(html)) return html;
  const e = shellEnvironment(env);
  let out = html.replace(/<html(?=[\s>])/i, `<html data-nmp-env="${e.id}"`);
  if (!/<html[\s>]/i.test(html)) out = out.replace(/<head(?=[\s>])/i, `<head data-nmp-env="${e.id}"`);
  if (e.id === 'production') out = out.replace(/<title>/i, '<title>PRODUCTION · ');
  out = out.replace(/<\/head>/i, '<link rel="stylesheet" href="/app-shell.css"></head>');
  out = out.replace(/<body([^>]*)>/i, (m, attrs) => `<body${attrs.includes('data-nmp-env') ? attrs : attrs + ` data-nmp-env="${e.id}"`}>${renderShell(pathname, env)}`);
  return out;
}

// Allow the shared stylesheet under each page's existing Content-Security-Policy.
export function allowShellStyles(csp) {
  if (!csp) return csp;
  const parts = String(csp).split(';').map((p) => p.trim()).filter(Boolean);
  const idx = parts.findIndex((p) => /^style-src(\s|$)/i.test(p));
  if (idx >= 0) { if (!/'self'/.test(parts[idx])) parts[idx] += " 'self'"; return parts.join('; '); }
  const def = parts.find((p) => /^default-src(\s|$)/i.test(p));
  if (!def || /'self'/.test(def)) return parts.join('; ');
  parts.push("style-src 'self'");
  return parts.join('; ');
}

function headerKey(headers, name) { return Object.keys(headers || {}).find((k) => k.toLowerCase() === name); }

// Wrap a response so complete HTML pages get the shell. Streaming or non-HTML responses pass through untouched.
export function attachShell(response, pathname, env = process.env) {
  const writeHead = response.writeHead.bind(response), write = response.write.bind(response), end = response.end.bind(response);
  let pending = null, passthrough = false;
  const flush = () => { if (pending) { const p = pending; pending = null; writeHead(...p); } };
  response.writeHead = (...args) => { if (passthrough) return writeHead(...args); pending = args; return response; };
  response.write = (...args) => { passthrough = true; flush(); return write(...args); };
  response.end = (chunk, encoding, cb) => {
    if (typeof chunk === 'function') { cb = chunk; chunk = undefined; encoding = undefined; }
    if (typeof encoding === 'function') { cb = encoding; encoding = undefined; }
    const original = () => { flush(); return end(chunk, encoding, cb); };
    if (passthrough || chunk == null) return original();
    try {
      let status = 200, message, headers = {};
      if (pending) { status = pending[0]; if (typeof pending[1] === 'string') { message = pending[1]; headers = pending[2]; } else headers = pending[1]; }
      if (headers && (Array.isArray(headers) || typeof headers !== 'object')) return original();
      headers = { ...(headers || {}) };
      const typeKey = headerKey(headers, 'content-type');
      const type = String((typeKey ? headers[typeKey] : response.getHeader('content-type')) || '');
      if (!/text\/html/i.test(type) || status < 200 || (status >= 300 && status < 400)) return original();
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      const out = injectShell(text, pathname, env);
      if (out === text) return original();
      const lenKey = headerKey(headers, 'content-length');
      if (lenKey) headers[lenKey] = Buffer.byteLength(out);
      if (response.getHeader('content-length') != null) response.setHeader('content-length', Buffer.byteLength(out));
      const cspKey = headerKey(headers, 'content-security-policy');
      if (cspKey) headers[cspKey] = allowShellStyles(headers[cspKey]);
      const set = response.getHeader('content-security-policy');
      if (set) response.setHeader('content-security-policy', allowShellStyles(set));
      if (pending) pending = message !== undefined ? [status, message, headers] : [status, headers];
      flush();
      return end(out, 'utf8', cb);
    } catch { return original(); }
  };
  return response;
}
