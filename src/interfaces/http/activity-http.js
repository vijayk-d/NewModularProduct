// Activity indicator routes: the pill's refresh script, its current state, and "open" (marks it seen, then goes to the
// result). Local and read-only apart from marking seen.
import {readFile} from 'node:fs/promises';
import {renderActivityPill} from './app-shell.js';

const APPLICATION = /^\/applications\/([A-Za-z0-9_-]{1,100})$/;

export function createActivityHandler({log, sendJson, sendText}) {
  return async (req, res, url) => {
    const method = req.method || 'GET';
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
