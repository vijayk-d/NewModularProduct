import { readFile } from 'node:fs/promises';
import { describeFeatures, setFeature, featureFilePath } from '../../config/feature-toggles.js';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Feature toggles</title>
<style>body{font:16px system-ui,sans-serif;background:#f5f7fb;color:#172033;margin:0}main{max-width:980px;margin:auto;padding:24px}
section{background:#fff;border:1px solid #ccd6e2;border-radius:8px;padding:18px;margin:16px 0}h1{margin:.2em 0}
.env{display:inline-block;padding:4px 10px;border-radius:999px;font-weight:600;background:#e7eefb}.env.production{background:#fde8e8;color:#8a1c1c}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #e3e8ef;vertical-align:top}
td small{display:block;color:#4a5568;margin-top:3px}.state{font-weight:600}.on{color:#1b6b34}.off{color:#6b7280}.warn{color:#8a4b00;font-weight:600}
button{font:inherit;padding:7px 14px;white-space:nowrap;border-radius:6px;border:1px solid #9aa9bd;background:#fff;cursor:pointer}button:disabled{opacity:.5;cursor:default}
[role=status]{min-height:1.4em;font-weight:600}a{color:#1d4ed8}</style></head>
<body><main><h1>Feature toggles</h1>
<p>Environment: <span id="env" class="env">loading</span> · Release <code id="release"></code></p>
<p id="note">Changes are saved straight away and take effect after a restart. Production: press Ctrl+C in the production window, then run Start-Production.ps1.</p>
<p role="status" aria-live="polite" id="status"></p>
<section><h2>Switchable features</h2><table><thead><tr><th>Feature</th><th>Saved</th><th>Running now</th><th></th></tr></thead><tbody id="features"></tbody></table></section>
<section><h2>Development only</h2><p>These are limited to development on port 3000 in the code, so they can't be switched on here.</p><ul id="dev-only"></ul></section>
<p><small>File: <code id="file"></code></small></p></main><script src="/feature-toggles-client.js"></script></body></html>`;

export function createFeatureTogglesHandler({ env = process.env, file } = {}) {
  const paths = ['/settings/features', '/feature-toggles-client.js', '/api/settings/features'];
  return async (req, res, url) => {
    if (!paths.includes(url.pathname)) return false;
    const send = (status, data, type = 'application/json; charset=utf-8', extra = {}) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
      res.end(typeof data === 'string' ? data : JSON.stringify(data));
    };
    const host = String(req.headers.host || '');
    const crossSite = req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && !['http://' + host, 'https://' + host].includes(req.headers.origin));
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
    if (crossSite || !loopback) { send(403, { ok: false, error: 'Local same-origin access required.' }); return true; }
    const options = { file: file || featureFilePath(env) };
    try {
      if (url.pathname === '/settings/features' && req.method === 'GET') {
        send(200, html, 'text/html; charset=utf-8', { 'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" });
        return true;
      }
      if (url.pathname === '/feature-toggles-client.js' && req.method === 'GET') {
        send(200, await readFile(new URL('./feature-toggles-client.js', import.meta.url), 'utf8'), 'application/javascript; charset=utf-8');
        return true;
      }
      if (url.pathname === '/api/settings/features' && req.method === 'GET') { send(200, { ok: true, ...describeFeatures(env, options) }); return true; }
      if (url.pathname === '/api/settings/features' && req.method === 'POST') {
        if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { send(415, { ok: false, error: 'JSON required.' }); return true; }
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 4096) { send(413, { ok: false, error: 'Request too large.' }); return true; } }
        let body;
        try { body = JSON.parse(raw); } catch { send(400, { ok: false, error: 'Invalid JSON.' }); return true; }
        send(200, { ok: true, ...setFeature(env, body, options) });
        return true;
      }
      send(405, { ok: false, error: 'Method not allowed.' });
      return true;
    } catch (error) {
      send(error.status || 500, { ok: false, error: error.status ? error.message : 'Feature toggles unavailable: ' + error.message });
      return true;
    }
  };
}
