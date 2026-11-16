import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createCvDocumentHandler} from '../../../src/interfaces/http/cv-document-http.js';
import {previewLink} from '../../../src/interfaces/http/cv-documents.js';

const pdf = Buffer.from('%PDF-1.4\nsynthetic CV\n%%EOF'), docx = Buffer.from('PKsynthetic');
const sha = b => createHash('sha256').update(b).digest('hex');
const files = {'PM/cv.pdf': {bytes: pdf, contentType: 'application/pdf', name: 'Vijay CV.pdf'}, 'DM/cv.docx': {bytes: docx, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'cv.docx'}};
const adapter = {async read(p, {expectedHash = null, includeBytes = false} = {}) {
  const f = files[p]; if (!f) throw Error('missing');
  if (expectedHash && expectedHash !== sha(f.bytes)) throw Error('changed');
  return {name: f.name, contentType: f.contentType, sizeBytes: f.bytes.length, sha256: sha(f.bytes), ...(includeBytes ? {data: f.bytes.toString('base64')} : {})};
}};
const cvs = [{role_code: 'PM', local_path: 'PM/cv.pdf'}, {role_code: 'DM', local_path: 'DM/cv.docx'}, {role_code: 'XX', local_path: 'XX/other.pdf'}];
const review = {prepared: {rankedCvs: [{cv: cvs[0]}, {cv: cvs[1]}]}};

async function server(t) {
  const handle = createCvDocumentHandler({store: new Map([['r1', review]]), inventory: {load: async () => ({cvs})}, adapter});
  const s = http.createServer(async (req, res) => { if (!await handle(req, res, new URL(req.url, 'http://127.0.0.1'))) { res.writeHead(404); res.end(); } });
  s.listen(0, '127.0.0.1'); await once(s, 'listening'); t.after(() => s.close());
  return 'http://127.0.0.1:' + s.address().port;
}
const preview = (base, q, headers = {}) => fetch(base + '/api/cv-preview?' + new URLSearchParams(q), {headers});

test('PDF opens inline with exact bytes and preview-specific protections', async t => {
  const base = await server(t), r = await preview(base, {reviewId: 'r1', roleCode: 'PM', sha256: sha(pdf)});
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-disposition'), /^inline; filename="Vijay CV.pdf"/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), pdf);
});

test('download stays an attachment with the sandbox policy', async t => {
  const base = await server(t), r = await fetch(base + '/api/cv-original?' + new URLSearchParams({reviewId: 'r1', roleCode: 'PM', sha256: sha(pdf)}));
  assert.match(r.headers.get('content-disposition'), /^attachment/);
  assert.match(r.headers.get('content-security-policy'), /sandbox/);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), pdf);
});

test('stale hash, missing hash, expired review, unranked CV, DOCX and foreign origin fail safely', async t => {
  const base = await server(t);
  assert.equal((await preview(base, {reviewId: 'r1', roleCode: 'PM', sha256: 'a'.repeat(64)})).status, 409);
  assert.equal((await preview(base, {reviewId: 'r1', roleCode: 'PM'})).status, 400);
  assert.equal((await preview(base, {reviewId: 'gone', roleCode: 'PM', sha256: sha(pdf)})).status, 410);
  assert.equal((await preview(base, {reviewId: 'r1', roleCode: 'XX', sha256: sha(pdf)})).status, 400);
  const word = await preview(base, {reviewId: 'r1', roleCode: 'DM', sha256: sha(docx)});
  assert.equal(word.status, 415); assert.match((await word.json()).error, /Only PDF CVs open in the browser/);
  assert.equal((await preview(base, {reviewId: 'r1', roleCode: 'PM', sha256: sha(pdf)}, {origin: 'https://attacker.example'})).status, 403);
  assert.equal((await preview(base, {reviewId: 'r1', roleCode: 'PM', sha256: sha(pdf)}, {'sec-fetch-site': 'cross-site'})).status, 403);
});

test('preview link is a new-tab link with opener protection, only for PDFs', () => {
  const doc = {createElement: () => ({dataset: {}})};
  const a = previewLink(doc, {reviewId: 'r1', roleCode: 'PM', sha256: 'f'.repeat(64), contentType: 'application/pdf'});
  assert.equal(a.target, '_blank');
  assert.equal(a.rel, 'noopener noreferrer');
  assert.equal(a.href, '/api/cv-preview?reviewId=r1&roleCode=PM&sha256=' + 'f'.repeat(64));
  assert.equal(previewLink(doc, {reviewId: 'r1', roleCode: 'DM', sha256: 'f'.repeat(64), contentType: 'application/msword'}), null);
});
