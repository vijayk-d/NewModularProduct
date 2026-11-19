// Application questions helper routes. Local same-origin only; only the "write" route makes a paid call, after a confirmed estimate.
import {readFile} from 'node:fs/promises';

const ROUTE = /^\/api\/reviews\/([A-Za-z0-9_-]{1,100})\/questions(?:\/(draft|check|estimate|write|save)|\/(\d{1,12})\/remove)?$/;

async function jsonBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON required.'), {statusCode: 415});
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024) throw Object.assign(new Error('Request too large.'), {statusCode: 413}); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('Valid JSON required.'), {statusCode: 400}); }
}

export function createApplicationQuestionsHandler({service, sendJson, sendText}) {
  return async (req, res, url) => {
    const method = req.method || 'GET';
    if (method === 'GET' && url.pathname === '/application-questions-controls.js') {
      sendText(res, 200, await readFile(new URL('./application-questions-controls.js', import.meta.url), 'utf8'), {'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store'});
      return true;
    }
    const m = ROUTE.exec(url.pathname);
    if (!m) return false;
    const [, reviewId, action, removeId] = m;
    if (!(method === 'GET' && !action && !removeId) && method !== 'POST') return false;
    try {
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
      if (!service) { sendJson(res, 503, {ok: false, error: 'The application questions helper is unavailable in this configuration.'}); return true; }
      if (method === 'GET') { sendJson(res, 200, {ok: true, ...(await service.overview(reviewId))}); return true; }
      if (removeId) { sendJson(res, 200, {ok: true, saved: service.remove(reviewId, removeId)}); return true; }
      const body = await jsonBody(req);
      const result = action === 'save' ? {saved: await service.save(reviewId, body)} : await service[action || 'draft'](reviewId, body);
      sendJson(res, 200, {ok: true, ...result});
      return true;
    } catch (error) {
      sendJson(res, error.statusCode || 503, {ok: false, code: error.code || 'QUESTION_FAILED', error: error.statusCode ? error.message : 'The questions helper is unavailable. Nothing was changed.'});
      return true;
    }
  };
}
