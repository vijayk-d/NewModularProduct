// Letter keyword check route and its browser module. Local same-origin only; free, no paid call, nothing saved.
import {readFile} from 'node:fs/promises';

const ROUTE = /^\/api\/reviews\/([A-Za-z0-9_-]{1,100})\/(keywords|fit-paragraph)$/;

async function jsonBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON required.'), {statusCode: 415});
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 128 * 1024) throw Object.assign(new Error('Request too large.'), {statusCode: 413}); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('Valid JSON required.'), {statusCode: 400}); }
}

export function createLetterKeywordsHandler({service, fitService = null, sendJson, sendText}) {
  return async (req, res, url) => {
    const method = req.method || 'GET';
    if (method === 'GET' && ['/letter-keyword-controls.js', '/fit-paragraph-controls.js'].includes(url.pathname)) {
      sendText(res, 200, await readFile(new URL('.' + url.pathname, import.meta.url), 'utf8'), {'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store'});
      return true;
    }
    const m = ROUTE.exec(url.pathname);
    if (!m || method !== 'POST') return false;
    try {
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
      if (m[2] === 'fit-paragraph') { if (!fitService) throw Object.assign(new Error('The fit paragraph is unavailable.'), {statusCode: 503}); sendJson(res, 200, {ok: true, ...(await fitService.draft(m[1]))}); return true; }
      sendJson(res, 200, {ok: true, ...(await service.check(m[1], await jsonBody(req)))});
    } catch (error) {
      sendJson(res, error.statusCode || 503, {ok: false, error: error.statusCode ? error.message : 'The keyword check is unavailable. Nothing was changed.'});
    }
    return true;
  };
}
