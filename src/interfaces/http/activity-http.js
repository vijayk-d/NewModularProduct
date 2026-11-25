// Activity indicator routes: the pill's refresh script, its current state, and "open" (marks it seen, then goes to the
// result). Local and read-only apart from marking seen.
import {readFile} from 'node:fs/promises';
import {renderActivityPill} from './app-shell.js';

const APPLICATION = /^\/applications\/([A-Za-z0-9_-]{1,100})$/;

export function createActivityHandler({log, sendJson, sendText, getReview = null}) {
  return async (req, res, url) => {
    const method = req.method || 'GET';
    // The page that opens the LinkedIn search tabs starts "Importing contacts" for its application (the only kind a page
    // may start; every other task is recorded by the server itself).
    if (method === 'POST' && url.pathname === '/api/activity/contacts') {
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site' || !String(req.headers['content-type'] || '').startsWith('application/json')) { sendJson(res, 403, {ok: false, error: 'Same-origin JSON request required.'}); return true; }
      let body = {}, size = 0; const chunks = [];
      for await (const c of req) { size += c.length; if (size > 4096) { sendJson(res, 413, {ok: false, error: 'Request too large.'}); return true; } chunks.push(c); }
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { sendJson(res, 400, {ok: false, error: 'Valid JSON required.'}); return true; }
      const reviewId = String(body.reviewId || '');
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(reviewId) || (getReview && !getReview(reviewId))) { sendJson(res, 404, {ok: false, error: 'Saved application not found.'}); return true; }
      sendJson(res, 200, {ok: true, id: log.start({kind: 'contacts', reviewId})});
      return true;
    }
    if (method !== 'GET') return false;
    if (url.pathname === '/app-shell.js') {
      sendText(res, 200, await readFile(new URL('./app-shell-client.js', import.meta.url), 'utf8'), {'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store'});
      return true;
    }
    if (url.pathname === '/api/activity') {
      const summary = log.summary();
      sendJson(res, 200, {ok: true, ...summary, html: renderActivityPill(summary)});
      return true;
    }
    if (url.pathname === '/activity/open') {
      const a = log.get(String(url.searchParams.get('id') || ''));
      if (a && a.state !== 'running') log.markSeen({id: a.id});
      res.writeHead(303, {location: a ? a.href : '/next-steps', 'cache-control': 'no-store'});
      res.end();
      return true;
    }
    // Opening an application means you have seen what finished there; the page itself is served as usual.
    const m = APPLICATION.exec(url.pathname);
    if (m) log.markSeen({reviewId: m[1]});
    return false;
  };
}
