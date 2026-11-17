import {readFile} from 'node:fs/promises';
import {uploadFileName} from '../../application/export-application-pack.js';

const ROUTE = /^\/api\/reviews\/([A-Za-z0-9_-]{1,100})\/tailored-cv(?:\/(\d{1,6})\.docx)?$/;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function jsonBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON required.'), {statusCode: 415});
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 256 * 1024) throw Object.assign(new Error('Request exceeds 256 KiB.'), {statusCode: 413}); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Valid JSON required.'), {statusCode: 400}); }
}

export function createCvTailoringHandler({service, getReview, sendJson, sendText, candidateName = 'Candidate'}) {
  return async (req, res, url) => {
    const method = req.method || 'GET', route = url.pathname;
    if (method === 'GET' && route === '/tailored-cv-controls.js') {
      sendText(res, 200, await readFile(new URL('./tailored-cv-controls.js', import.meta.url), 'utf8'), {'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store'});
      return true;
    }
    if (method === 'GET' && route === '/api/tailored-cv/library-check') {
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
      if (!service) { sendJson(res, 503, {ok: false, code: 'CV_TAILORING_DISABLED', error: 'Tailored CVs are unavailable in this server configuration.'}); return true; }
      try { sendJson(res, 200, {ok: true, ...(await service.checkLibrary())}); }
      catch (error) { sendJson(res, error.statusCode || 503, {ok: false, error: error.statusCode ? error.message : 'The CV check could not run.'}); }
      return true;
    }
    const match = ROUTE.exec(route);
    if (!match || !['GET', 'POST'].includes(method) || (method === 'POST' && match[2])) return false;
    try {
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, {ok: false, error: 'Cross-origin access is not allowed.'}); return true; }
      if (!service) { sendJson(res, 503, {ok: false, code: 'CV_TAILORING_DISABLED', error: 'Tailored CVs are unavailable in this server configuration.'}); return true; }
      const reviewId = match[1];
      if (method === 'POST') { sendJson(res, 200, {ok: true, tailored: await service.build(reviewId, await jsonBody(req))}); return true; }
      if (match[2]) {
        const file = service.file(reviewId, Number(match[2]));
        if (!file) { sendJson(res, 404, {ok: false, error: 'Tailored CV version not found.'}); return true; }
        const name = uploadFileName(candidateName, getReview?.(reviewId)?.formData?.jobTitle || file.roleCode, 'CV', '.docx');
        res.writeHead(200, {'content-type': DOCX, 'content-disposition': `attachment; filename="${name}"`, 'content-length': file.bytes.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
        res.end(file.bytes);
        return true;
      }
      sendJson(res, 200, {ok: true, ...(await service.draft(reviewId, {wordFile: url.searchParams.get('wordFile') || '', profileHeading: url.searchParams.get('profileHeading') || '', achievementsHeading: url.searchParams.get('achievementsHeading') || ''}))});
      return true;
    } catch (error) {
      sendJson(res, error.statusCode || 503, {ok: false, code: error.code || 'CV_TAILORING_FAILED', error: error.statusCode ? error.message : 'Tailored CV is unavailable. Nothing was changed.'});
      return true;
    }
  };
}
