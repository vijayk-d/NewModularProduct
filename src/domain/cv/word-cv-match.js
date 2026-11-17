// Which Word file belongs to a library CV (stored as a PDF). Pure: the caller lists the folder.
// Order: same name (ignoring case, spaces and underscores) → the owner's saved choice → the only Word file in the folder.
// Anything else is reported as ambiguous or missing, so the owner chooses; a wrong CV is never guessed.
export const stemKey = name => String(name || '').replace(/\.[^./\\]+$/, '').normalize('NFKC').replace(/[\s_]+/g, ' ').trim().toLowerCase();
export const isWordFile = name => /\.docx$/i.test(String(name || '')) && !String(name).startsWith('~$');

export function chooseWordFile({pdfName, files = [], saved = ''}) {
  const candidates = [...new Set(files.filter(isWordFile))].sort((a, b) => a.localeCompare(b));
  if (isWordFile(pdfName)) return {name: pdfName, match: 'library', candidates};
  const same = candidates.filter(n => stemKey(n) === stemKey(pdfName));
  if (same.length === 1) return {name: same[0], match: 'same-name', candidates};
  if (saved && candidates.includes(saved)) return {name: saved, match: 'chosen', candidates};
  if (candidates.length === 1) return {name: candidates[0], match: 'only-word-file', candidates};
  return {name: '', match: candidates.length ? 'choose' : 'none', candidates};
}

export const MATCH_LABELS = {
  library: 'listed in the CV library',
  'same-name': 'same name as the PDF',
  chosen: 'chosen by you',
  'only-word-file': 'only Word file in the folder',
  choose: 'several Word files: choose one',
  none: 'no Word file in the folder'
};
