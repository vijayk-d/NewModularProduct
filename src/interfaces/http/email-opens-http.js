// Email opens routes: GET the saved counts for one application, POST check to read new tracker alerts from Gmail
// (read-only). Local same-origin only.
const ROUTE = /^\/api\/reviews\/([A-Za-z0-9_-]{1,100})\/email-opens(?:\/(check))?$/;

export function createEmailOpensHandler({service, getReview, sendJson}) {
  return async (req, res, url) => {
    const m = ROUTE.exec(url.pathname), method = req.method || 'GET';
    if (!m || !((method === 'GET' && !m[2]) || (method === 'POST' && m[2]))) return false;
    try {
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
      if (!service) { sendJson(res, 503, {ok: false, error: 'Email opens are unavailable in this configuration.'}); return true; }
      if (!getReview(m[1])) { sendJson(res, 404, {ok: false, error: 'Saved application not found.'}); return true; }
      sendJson(res, 200, {ok: true, ...(method === 'GET' ? service.forReview(m[1]) : await service.check(m[1]))});
      return true;
    } catch (error) {
      sendJson(res, error.statusCode || 503, {ok: false, code: error.code || 'OPENS_FAILED', error: error.statusCode ? error.message : 'Email opens could not be checked. Nothing was changed.'});
      return true;
    }
  };
}
