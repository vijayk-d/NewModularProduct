// Writes generated application files to an explicit local folder (APPLICATION_OUTPUT_FOLDER).
// The Node process writes them, so Windows adds no Mark of the Web and Word opens them without Unblock.
import {mkdir, open, realpath, stat} from 'node:fs/promises';
import path from 'node:path';

const SETUP_HINT = 'Set APPLICATION_OUTPUT_FOLDER in .env to an absolute folder outside the app (for example D:\\JobApplications), create the folder, then restart the app.';
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/;
const MAX_VERSIONS = 99;
const blocked = (message, code, statusCode = 409) => Object.assign(new Error(message), {statusCode, code});

const isAbsolute = value => path.win32.isAbsolute(value) || path.posix.isAbsolute(value);
// Same rule on both platforms: a folder is inside a root when the relative path does not climb out.
function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
const caseless = value => (process.platform === 'win32' ? value.toLowerCase() : value);
async function real(value) { try { return await realpath(value); } catch { return path.resolve(value); } }

// Checks the configured folder: set, absolute, an existing folder, and not inside the app, its data or the production folder.
export async function checkOutputFolder(value, {forbidden = []} = {}) {
  const raw = String(value ?? '').trim().replace(/^"(.*)"$/, '$1');
  if (!raw) throw blocked(`No output folder is set. ${SETUP_HINT}`, 'OUTPUT_FOLDER_NOT_SET');
  if (!isAbsolute(raw) || /[\x00-\x1f]/.test(raw)) throw blocked(`APPLICATION_OUTPUT_FOLDER must be an absolute path. ${SETUP_HINT}`, 'OUTPUT_FOLDER_INVALID');
  let folder;
  try { folder = await realpath(path.resolve(raw)); if (!(await stat(folder)).isDirectory()) throw new Error('not a folder'); }
  catch { throw blocked(`The output folder "${raw}" does not exist or is not a folder. Create it, then try again.`, 'OUTPUT_FOLDER_MISSING'); }
  for (const root of forbidden.filter(Boolean)) {
    const resolved = await real(path.resolve(String(root)));
    if (inside(caseless(resolved), caseless(folder)) || inside(caseless(folder), caseless(resolved))) throw blocked(`The output folder "${raw}" overlaps the app, its data, CV or production folder. Choose a separate folder. ${SETUP_HINT}`, 'OUTPUT_FOLDER_FORBIDDEN');
  }
  return folder;
}

// "Vijay_DAFAL_PM_CV.docx" -> "Vijay_DAFAL_PM_CV_v2.docx"
export function versionedName(name, version) {
  if (version < 2) return name;
  const ext = path.extname(name);
  return `${name.slice(0, name.length - ext.length)}_v${version}${ext}`;
}

async function writeNew(directory, name, bytes) {
  for (let version = 1; version <= MAX_VERSIONS; version++) {
    const candidate = versionedName(name, version);
    let handle;
    try { handle = await open(path.join(directory, candidate), 'wx'); }
    catch (error) { if (error.code === 'EEXIST') continue; throw error; }
    try { await handle.writeFile(bytes); } finally { await handle.close(); }
    return candidate;
  }
  throw blocked(`"${name}" already has ${MAX_VERSIONS} versions in this folder. Tidy the folder, then try again.`, 'OUTPUT_FOLDER_FULL');
}

export function createApplicationOutputFolder({folder, forbidden = []} = {}) {
  return {
    // Checked on every save: the folder may have been removed or renamed since start-up.
    async save(subfolder, files) {
      const root = await checkOutputFolder(folder, {forbidden});
      if (!NAME.test(String(subfolder || '')) || /^\.+$/.test(subfolder)) throw blocked('Unsafe application folder name.', 'OUTPUT_FOLDER_UNSAFE_NAME', 400);
      if (!Array.isArray(files) || !files.length || files.some(f => !NAME.test(String(f?.name || '')) || !Buffer.isBuffer(f.bytes))) throw blocked('Unsafe file name or data.', 'OUTPUT_FOLDER_UNSAFE_NAME', 400);
      const directory = path.join(root, subfolder);
      try {
        await mkdir(directory, {recursive: true});
        const resolved = await realpath(directory);
        if (!inside(caseless(root), caseless(resolved)) || caseless(resolved) === caseless(root)) throw blocked('The application folder resolves outside the output folder.', 'OUTPUT_FOLDER_UNSAFE_NAME', 400);
        const written = [];
        for (const file of files) written.push(await writeNew(resolved, file.name, file.bytes));
        return {folder: resolved, files: written};
      } catch (error) {
        if (error.code?.startsWith?.('OUTPUT_FOLDER_')) throw error;
        throw blocked('Files could not be written to the output folder. Check it exists and is not read-only.', 'OUTPUT_FOLDER_WRITE_FAILED', 503);
      }
    }
  };
}
