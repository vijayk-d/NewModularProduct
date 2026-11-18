// Outcome of an application (insights phase 1): read, record and remove the owner's own entries. Local only.
import {readFile} from 'node:fs/promises';
import {OUTCOMES, validateOutcome, currentOutcome, outcomeLabel} from '../../domain/insights/application-outcome.js';

const ROUTE = /^\/api\/reviews\/([A-Za-z0-9_-]{1,100})\/outcomes(?:\/(\d{1,12})\/remove)?$/;

async function jsonBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON required.'), {statusCode: 415});
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 16 * 1024) throw Object.assign(new Error('Request too large.'), {statusCode: 413}); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('Valid JSON required.'), {statusCode: 400}); }
}

export function outcomeState(store, reviewId) {
  const history = store.history(reviewId).map(e => ({...e, label: outcomeLabel(e.outcome)}));
  return {options: OUTCOMES.map(({id, label}) => ({id, label})), current: currentOutcome(history), history};
}

export function createApplicationOutcomesHandler({store, getReview, sendJson, sendText, now = () => new Date()}) {
  return async (req, res, url) => {
    const method = req.method || 'GET';
    if (method === 'GET' && url.pathname === '/application-outcome-controls.js') {
      sendText(res, 200, await readFile(new URL('./application-outcome-controls.js', import.meta.url), 'utf8'), {'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store'});
      return true;
    }
    const match = ROUTE.exec(url.pathname);
    if (!match || !(method === 'GET' && !match[2]) && method !== 'POST') return false;
    try {
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
      if (!store) { sendJson(res, 503, {ok: false, error: 'Outcome recording is unavailable in this configuration.'}); return true; }
      const reviewId = match[1];
      if (!getReview(reviewId)) { sendJson(res, 404, {ok: false, error: 'Saved application not found.'}); return true; }
      if (method === 'POST' && match[2]) {
        if (!store.remove(reviewId, match[2])) { sendJson(res, 404, {ok: false, error: 'That outcome entry was not found.'}); return true; }
      } else if (method === 'POST') {
        const body = await jsonBody(req);
        store.record(reviewId, validateOutcome(body, {now: now()}));
      }
      sendJson(res, 200, {ok: true, ...outcomeState(store, reviewId)});
      return true;
    } catch (error) {
      sendJson(res, error.statusCode || 503, {ok: false, code: error.code || 'OUTCOME_FAILED', error: error.statusCode ? error.message : 'Outcome storage is unavailable. Nothing was changed.'});
      return true;
    }
  };
}
