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
