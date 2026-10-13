import { readFile } from 'node:fs/promises';
import { createOutreachQueueService } from '../../application/outreach-queue-service.js';

export function createOutreachHttpHandler({ repository, contactStore, getReview }) {
  const service = repository ? createOutreachQueueService({ repository, contactStore, getReview }) : null;
  const json = (response, code, data) => {
    response.writeHead(code, { 'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    response.end(JSON.stringify(data));
  };
  async function body(request) {
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      const error = new Error('JSON content type is required.'); error.statusCode = 415; throw error;
    }
    let raw = ''; let bytes = 0;
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        const error = new Error('Queue request is too large.'); error.statusCode = 413; throw error;
      }
      raw += chunk.toString('utf8');
    }
    try { return JSON.parse(raw); }
    catch { const error = new Error('Request body must be valid JSON.'); error.statusCode = 400; throw error; }
  }
  return async function handleOutreach(request, response, url) {
    const route = url.pathname;
    if (!['/outreach-queue', '/outreach-queue.js', '/api/outreach-queue',
      '/api/outreach-queue/add', '/api/outreach-queue/delete', '/api/outreach-queue/clear', '/api/outreach-queue/prepare-drafts'].includes(route)) return false;
    try {
      const origin = request.headers.origin;
      if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) {
        json(response, 403, { ok: false, error: 'Cross-origin queue access is not allowed.' }); return true;
      }
      if (request.headers['sec-fetch-site'] === 'cross-site') {
        json(response, 403, { ok: false, error: 'Cross-site queue access is not allowed.' }); return true;
      }
      if (request.method === 'GET' && route === '/outreach-queue.js') {
        const code = await readFile(new URL('./outreach-queue-browser.js', import.meta.url), 'utf8');
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'x-content-type-options': 'nosniff' });
        response.end(code); return true;
      }
      if (request.method === 'GET' && route === '/outreach-queue') {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'content-security-policy': "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          'x-content-type-options': 'nosniff'
        });
        response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Outreach queue</title></head>
          <body><main><h1>Outreach queue</h1><p><a href="/">Prepare an application</a></p>
          <p>Local preparation only. Gmail drafting and sending are not enabled.</p></main>
          <script type="module" src="/outreach-queue.js"></script></body></html>`);
        return true;
      }
      if (!service) { json(response, 503, { ok: false, error: 'Outreach storage is not configured.' }); return true; }
      if (request.method === 'GET' && route === '/api/outreach-queue') {
        json(response, 200, { ok: true, items: service.list() }); return true;
      }
      if (request.method === 'POST' && route !== '/api/outreach-queue') {
        const values = await body(request);
        let result;
        if (route === '/api/outreach-queue/add') result = await service.add(values);
        else if (route === '/api/outreach-queue/prepare-drafts') result = service.prepareDrafts(values);
        else if (route === '/api/outreach-queue/delete') result = service.deleteSelected(values);
        else if (route === '/api/outreach-queue/clear') result = service.clear(values);
        else { json(response, 405, { ok: false, error: 'Method not allowed.' }); return true; }
        json(response, 200, { ok: true, ...result }); return true;
      }
      json(response, 405, { ok: false, error: 'Method not allowed.' });
    } catch (error) {
      json(response, error.statusCode || 503, {
        ok: false, error: error.statusCode ? error.message : 'Outreach storage is unavailable. Check the server terminal; do not delete the database.'
      });
      if (!error.statusCode) console.error('[Outreach queue] Storage request failed:', error.code || error.name);
    }
    return true;
  };
}
