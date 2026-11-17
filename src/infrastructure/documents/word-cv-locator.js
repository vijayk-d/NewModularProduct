// Lists the Word files next to a library CV, inside CV_FOLDER only, and applies the pure matching rule.
import {readdir, realpath} from 'node:fs/promises';
import path from 'node:path';
import {chooseWordFile} from '../../domain/cv/word-cv-match.js';

const blocked = message => Object.assign(new Error(message), {statusCode: 409, code: 'CV_PATH_INVALID'});

export function libraryFolder(relative) {
  const value = String(relative || '').replaceAll('\\', '/');
  const parts = value.split('/');
  if (!value || /[\x00-\x1f:]/.test(value) || value.startsWith('/') || parts.some(p => p === '..' || p === '.' || p === '')) throw blocked('CV path must be relative to CV_FOLDER.');
  return {folder: parts.slice(0, -1).join('/'), name: parts.at(-1)};
}

export function createWordCvLocator({cvFolder, list = null}) {
  const listFolder = list || (async folder => {
    const root = await realpath(path.resolve(cvFolder));
    const dir = await realpath(path.resolve(root, folder || '.'));
    const within = path.relative(root, dir);
    if (within.startsWith('..') || path.isAbsolute(within)) throw blocked('CV folder escaped CV_FOLDER.');
    return (await readdir(dir, {withFileTypes: true})).filter(d => d.isFile()).map(d => d.name);
  });
  return async (libraryPath, saved = '') => {
    const {folder, name} = libraryFolder(libraryPath);
    let files = [];
    try { files = await listFolder(folder); } catch (error) { if (error.code === 'CV_PATH_INVALID') throw error; files = []; }
    const found = chooseWordFile({pdfName: name, files, saved});
    return {...found, folder, pdfName: name, relativePath: found.name ? (folder ? folder + '/' : '') + found.name : ''};
  };
}
