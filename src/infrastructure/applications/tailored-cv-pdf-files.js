// Write-once PDF copies of tailored CVs: <folder>/<reviewId>/v<version>.pdf. Never overwritten.
// Gmail drafting and sending attach them from here (TAILORED_CV_FOLDER), never from the CV library folder.
import {mkdir, open, readFile, realpath} from 'node:fs/promises';
import path from 'node:path';

const fail = message => { throw Object.assign(new Error(message), {code: 'TAILORED_PDF_STORE', statusCode: 503}); };

export function createTailoredPdfFiles({folder} = {}) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) fail('An absolute tailored PDF folder is required.');
  const relativeFor = (reviewId, version) => {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(reviewId)) || !Number.isInteger(Number(version)) || Number(version) < 1) fail('Unsafe tailored PDF name.');
    return `${reviewId}/v${Number(version)}.pdf`;
  };
  return {
    folder,
    async write(reviewId, version, bytes) {
      const relativePath = relativeFor(reviewId, version), file = path.join(folder, relativePath);
      await mkdir(path.dirname(file), {recursive: true});
      const handle = await open(file, 'wx');
      try { await handle.writeFile(bytes); } finally { await handle.close(); }
      return relativePath;
    },
    async read(relativePath) {
      const root = await realpath(folder), file = await realpath(path.resolve(root, String(relativePath)));
      const within = path.relative(root, file);
      if (!within || within.startsWith('..') || path.isAbsolute(within) || path.extname(file).toLowerCase() !== '.pdf') fail('Tailored PDF is outside its folder.');
      return readFile(file);
    }
  };
}
