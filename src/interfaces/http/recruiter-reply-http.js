// Reply assistant routes. Local same-origin only; only "write" makes a paid call, after a confirmed estimate. Nothing is sent by email.
import {readFile} from 'node:fs/promises';

const ROUTE = /^\/api\/reviews\/([A-Za-z0-9_-]{1,100})\/reply(?:\/(estimate|write|fetch))?$/;

async function jsonBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON required.'), {statusCode: 415});
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024) throw Object.assign(new Error('Request too large.'), {statusCode: 413}); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('Valid JSON required.'), {statusCode: 400}); }
}

export function createRecruiterReplyHandler({service, sendJson, sendText}) {
  return async (req, res, url) => {
    const method = req.method || 'GET';
    if (method === 'GET' && url.pathname === '/recruiter-reply-controls.js') {
      sendText(res, 200, await readFile(new URL('./recruiter-reply-controls.js', import.meta.url), 'utf8'), {'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store'});
      return true;
    }
    const m = ROUTE.exec(url.pathname);
    if (!m) return false;
    const [, reviewId, action] = m;
    if (!(method === 'GET' && !action) && !(method === 'POST' && action)) return false;
    try {
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
      if (!service) { sendJson(res, 503, {ok: false, error: 'The reply assistant is unavailable in this configuration.'}); return true; }
      if (method === 'GET') { sendJson(res, 200, {ok: true, ...(await service.overview(reviewId))}); return true; }
      const method_ = action === 'fetch' ? 'findReplies' : action;
      sendJson(res, 200, {ok: true, ...(await service[method_](reviewId, await jsonBody(req)))});
      return true;
    } catch (error) {
      sendJson(res, error.statusCode || 503, {ok: false, code: error.code || 'REPLY_FAILED', error: error.statusCode ? error.message : 'The reply assistant is unavailable. Nothing was changed.'});
      return true;
    }
  };
}
