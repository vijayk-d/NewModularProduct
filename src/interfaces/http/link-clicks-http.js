// Link clicks routes: GET the saved counts for one application, POST check to read new clicks from the link tracker
// (read-only, one explicit check). Local same-origin only.
const ROUTE = /^\/api\/reviews\/([A-Za-z0-9_-]{1,100})\/link-clicks(?:\/(check))?$/;

export function createLinkClicksHandler({service, getReview, sendJson, onChecked = () => {}}) {
  return async (req, res, url) => {
    const m = ROUTE.exec(url.pathname), method = req.method || 'GET';
    if (!m || !((method === 'GET' && !m[2]) || (method === 'POST' && m[2]))) return false;
    try {
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
      if (!service) { sendJson(res, 503, {ok: false, error: 'Link clicks are unavailable in this configuration.'}); return true; }
      if (!getReview(m[1])) { sendJson(res, 404, {ok: false, error: 'Saved application not found.'}); return true; }
      if (method === 'GET') { sendJson(res, 200, {ok: true, ...service.forReview(m[1])}); return true; }
      const result = await service.check(m[1]);
      onChecked();
      sendJson(res, 200, {ok: true, ...result});
      return true;
    } catch (error) {
      sendJson(res, error.statusCode || 503, {ok: false, code: error.code || 'CLICKS_FAILED', error: error.statusCode ? error.message : 'Link clicks could not be checked. Nothing was changed.'});
      return true;
    }
  };
}

// Opt-outs: GET the list, POST {value, optOut} to add or remove one email address or @domain. Saved straight away;
// nothing is sent. Local same-origin only.
const OPT_OUTS = '/api/link-tracking/opt-outs';
async function jsonBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON required.'), {statusCode: 415});
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 4 * 1024) throw Object.assign(new Error('Request too large.'), {statusCode: 413}); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('Valid JSON required.'), {statusCode: 400}); }
}

export function createLinkOptOutsHandler({tracker, sendJson, onChanged = () => {}}) {
  return async (req, res, url) => {
    const method = req.method || 'GET';
    if (url.pathname !== OPT_OUTS || !['GET', 'POST'].includes(method)) return false;
    try {
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
      if (!tracker?.optOuts) { sendJson(res, 503, {ok: false, error: 'Link tracking is unavailable in this configuration.'}); return true; }
      // inUse: tracking is switched on, or someone is already on the list; otherwise the page keeps this hidden.
      if (method === 'GET') { const optOuts = tracker.optOuts(); sendJson(res, 200, {ok: true, inUse: Boolean(tracker.status?.().enabled) || optOuts.length > 0, optOuts}); return true; }
      const body = await jsonBody(req);
      const optOuts = tracker.setOptOut(body.value, body.optOut !== false);
      onChanged();
      sendJson(res, 200, {ok: true, optOuts});
      return true;
    } catch (error) {
      sendJson(res, error.statusCode || 500, {ok: false, code: error.code || 'OPT_OUT_FAILED', error: error.statusCode ? error.message : 'The opt-out list could not be changed.'});
      return true;
    }
  };
}
