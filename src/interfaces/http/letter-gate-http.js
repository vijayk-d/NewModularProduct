// Letter gate for outreach: read the gate for an application, and set or clear "Send without polishing".
import {readFile} from 'node:fs/promises';
import {polishGate} from '../../application/polish-gate.js';

const ROUTE = /^\/api\/reviews\/([A-Za-z0-9_-]{1,100})\/letter-gate$/;

export function createLetterGateHandler({reviewStore, sendJson, sendText}) {
  return async (req, res, url) => {
    const method = req.method || 'GET';
    if (method === 'GET' && url.pathname === '/letter-gate-controls.js') {
      sendText(res, 200, await readFile(new URL('./letter-gate-controls.js', import.meta.url), 'utf8'), {'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store'});
      return true;
    }
    const m = ROUTE.exec(url.pathname);
    if (!m || !['GET', 'POST'].includes(method)) return false;
    const origin = req.headers.origin;
    if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
    const review = reviewStore.get(m[1]);
    if (!review) { sendJson(res, 404, {ok: false, error: 'Saved application not found.'}); return true; }
    if (method === 'POST') {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) { sendJson(res, 415, {ok: false, error: 'JSON required.'}); return true; }
      const chunks = []; for await (const c of req) { chunks.push(Buffer.from(c)); if (chunks.length > 8) break; }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { sendJson(res, 400, {ok: false, error: 'Valid JSON required.'}); return true; }
      if (typeof body?.sendWithoutPolish !== 'boolean') { sendJson(res, 400, {ok: false, error: 'Say whether to send without polishing.'}); return true; }
      reviewStore.set(m[1], {...review, sendWithoutPolish: body.sendWithoutPolish});
    }
    sendJson(res, 200, {ok: true, ...polishGate(reviewStore.get(m[1]))});
    return true;
  };
}
