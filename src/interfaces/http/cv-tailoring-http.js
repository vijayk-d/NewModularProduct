import {readFile} from 'node:fs/promises';
import {uploadFileName, safeExportStem} from '../../application/export-application-pack.js';
import {isLocalSameOrigin} from './local-write-guard.js';

const ROUTE = /^\/api\/reviews\/([A-Za-z0-9_-]{1,100})\/tailored-cv(?:\/(\d{1,6})\.docx)?$/;
const SAVE_ROUTE = /^\/api\/reviews\/([A-Za-z0-9_-]{1,100})\/tailored-cv\/(\d{1,6})\/save-to-folder$/;
const POLISH_ROUTE = /^\/api\/reviews\/([A-Za-z0-9_-]{1,100})\/tailored-cv\/(polish|polish\/estimate|ats)$/;
const EMAIL_ROUTE = /^\/api\/reviews\/([A-Za-z0-9_-]{1,100})\/tailored-cv\/(versions|email-choice|(\d{1,6})\/pdf)$/;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function jsonBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON required.'), {statusCode: 415});
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 256 * 1024) throw Object.assign(new Error('Request exceeds 256 KiB.'), {statusCode: 413}); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Valid JSON required.'), {statusCode: 400}); }
}

export function createCvTailoringHandler({service, getReview, sendJson, sendText, candidateName = 'Candidate', outputFolder = null}) {
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
    const polish = method === 'POST' && POLISH_ROUTE.exec(route);
    if (polish) {
      // Estimate is free; polish sends one paid request only with the confirmed estimate's proof. Local page only.
      if (!isLocalSameOrigin(req)) { sendJson(res, 403, {ok: false, error: 'Polishing needs this app open on this computer.'}); return true; }
      try {
        if (!service || typeof service.polish !== 'function') { sendJson(res, 503, {ok: false, code: 'CV_TAILORING_DISABLED', error: 'Tailored CVs are unavailable in this server configuration.'}); return true; }
        const body = await jsonBody(req);
        // ats is free and local; polish/estimate is free; polish is the one paid call.
        const action = {polish: 'polish', 'polish/estimate': 'polishEstimate', ats: 'atsMatch'}[polish[2]];
        sendJson(res, 200, {ok: true, ...(await service[action](polish[1], body))});
      } catch (error) {
        sendJson(res, error.statusCode || 503, {ok: false, code: error.code || 'CV_POLISH_FAILED', error: error.statusCode ? error.message : 'CV polishing is unavailable. Nothing was changed and no retry was made.'});
      }
      return true;
    }
    // Tailored CV for recruiter emails: list versions (GET), choose one (POST email-choice), make its PDF with Word (POST n/pdf).
    const email = EMAIL_ROUTE.exec(route);
    if (email && ((method === 'GET' && email[2] === 'versions') || (method === 'POST' && email[2] !== 'versions'))) {
      const origin = req.headers.origin;
      if (method === 'GET' ? ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') : !isLocalSameOrigin(req)) { sendJson(res, 403, {ok: false, error: 'This needs this app open on this computer.'}); return true; }
      try {
        if (!service || typeof service.versions !== 'function') { sendJson(res, 503, {ok: false, code: 'CV_TAILORING_DISABLED', error: 'Tailored CVs are unavailable in this server configuration.'}); return true; }
        const reviewId = email[1];
        if (email[2] === 'versions') sendJson(res, 200, {ok: true, ...service.versions(reviewId)});
        else if (email[2] === 'email-choice') { const body = await jsonBody(req); sendJson(res, 200, {ok: true, ...service.setEmailChoice(reviewId, {version: body?.version ?? null})}); }
        else sendJson(res, 200, {ok: true, pdf: await service.makePdf(reviewId, Number(email[3]))});
      } catch (error) {
        sendJson(res, error.statusCode || 503, {ok: false, code: error.code || 'TAILORED_PDF_FAILED', error: error.statusCode ? error.message : 'The PDF could not be made. Nothing was changed.'});
      }
      return true;
    }
    const save = method === 'POST' && SAVE_ROUTE.exec(route);
    if (save) {
      // Writes the DOCX into <APPLICATION_OUTPUT_FOLDER>/<Organisation>-<Job title>/ so Word opens it without Unblock.
      if (!isLocalSameOrigin(req)) { sendJson(res, 403, {ok: false, error: 'Saving to a folder needs this app open on this computer.'}); return true; }
      try {
        if (!service || !outputFolder) { sendJson(res, 503, {ok: false, code: 'CV_TAILORING_DISABLED', error: 'Save to folder is unavailable in this server configuration.'}); return true; }
        const file = service.file(save[1], Number(save[2]));
        if (!file) { sendJson(res, 404, {ok: false, error: 'Tailored CV version not found.'}); return true; }
        const form = getReview?.(save[1])?.formData || {};
        // The built version is part of the name (…_CV_v7.docx) so the folder matches the version list; its PDF goes alongside.
        const version = Number(save[2]), role = form.jobTitle || file.roleCode;
        const files = [{name: uploadFileName(candidateName, role, `CV_v${version}`, '.docx'), bytes: file.bytes}];
        const pdf = typeof service.pdfBytes === 'function' ? await service.pdfBytes(save[1], version) : null;
        if (pdf) files.push({name: uploadFileName(candidateName, role, `CV_v${version}`, '.pdf'), bytes: pdf});
        sendJson(res, 200, {ok: true, ...(await outputFolder.save(safeExportStem([form.organisationName, form.jobTitle].filter(Boolean).join('-')), files))});
      } catch (error) {
        sendJson(res, error.statusCode || 503, {ok: false, code: error.code || 'CV_TAILORING_FAILED', error: error.statusCode ? error.message : 'The tailored CV could not be saved. Nothing was changed.'});
      }
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
