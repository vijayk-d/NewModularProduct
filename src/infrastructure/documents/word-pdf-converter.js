// Tailored CV DOCX -> PDF with Microsoft Word on this PC (tools/documents/Convert-DocxToPdf.ps1).
// One attempt per call, no retries. Works in a private temporary folder that is always removed.
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../../tools/documents/Convert-DocxToPdf.ps1', import.meta.url));
const LIMIT = 20 * 1024 * 1024;
const MESSAGES = {
  WORD_NOT_INSTALLED: 'Microsoft Word is not installed on this PC, so no PDF was made.',
  WORD_START_FAILED: 'Microsoft Word could not be started. Make sure you are signed in to Windows and Word opens normally, then click Make PDF.',
  WORD_OPEN_FAILED: 'Word could not open the tailored CV. Click Make PDF to try again.',
  WORD_EXPORT_FAILED: 'Word could not save the PDF. Close any Word dialog that is open, then click Make PDF.',
  WORD_TIMEOUT: 'Word took too long to make the PDF. Close any Word dialog that is open, then click Make PDF.',
  WORD_UNAVAILABLE: 'PDF conversion with Word only works on Windows.'
};
const failure = code => Object.assign(new Error(MESSAGES[code] || 'Word could not make the PDF. Click Make PDF to try again.'), {code: MESSAGES[code] ? code : 'WORD_CONVERSION_FAILED', statusCode: 503});

export function createWordPdfConverter({spawnImpl = spawn, platform = process.platform, timeoutMs = 120000, script = SCRIPT, env = process.env} = {}) {
  return {
    available: platform === 'win32',
    async convert(docxBytes) {
      if (platform !== 'win32') throw failure('WORD_UNAVAILABLE');
      if (!Buffer.isBuffer(docxBytes) || !docxBytes.length || docxBytes.length > LIMIT) throw failure('PDF_INPUT_INVALID');
      const dir = await mkdtemp(path.join(tmpdir(), 'nmp-cv-pdf-'));
      const docx = path.join(dir, 'tailored-cv.docx'), pdf = path.join(dir, 'tailored-cv.pdf');
      try {
        await writeFile(docx, docxBytes, {flag: 'wx'});
        const out = await new Promise((resolve, reject) => {
          let child, text = '', done = false;
          const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); if (error) { try { child?.kill(); } catch {} reject(error); } else resolve(value); };
          const timer = setTimeout(() => finish(failure('WORD_TIMEOUT')), timeoutMs);
          try {
            child = spawnImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, '-Docx', docx, '-Pdf', pdf], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env});
          } catch { finish(failure('WORD_START_FAILED')); return; }
          child.on('error', () => finish(failure('WORD_START_FAILED')));
          child.stdout.setEncoding('utf8');
          child.stdout.on('data', s => { text += s; if (text.length > 10000) finish(failure('WORD_CONVERSION_FAILED')); });
          child.stderr.on('data', () => {});
          child.on('close', () => {
            let result = null;
            try { result = JSON.parse(text.trim().split(/\r?\n/).pop()); } catch {}
            if (result?.ok === true) finish(null, result); else finish(failure(result?.code));
          });
        });
        const bytes = await readFile(pdf);
        if (bytes.length > LIMIT || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw failure('WORD_EXPORT_FAILED');
        return {bytes, wordVersion: String(out.wordVersion || '').slice(0, 20)};
      } catch (error) {
        if (error.code === 'ENOENT') throw failure('WORD_EXPORT_FAILED');
        throw error.statusCode ? error : failure('WORD_CONVERSION_FAILED');
      } finally {
        await rm(dir, {recursive: true, force: true});
      }
    }
  };
}
