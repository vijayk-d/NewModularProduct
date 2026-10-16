import {renderLinkedRoleOpening} from '../../domain/shared/linked-role-opening.js';
function escape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
export function renderCoverLetterHtml(text = '', highlightPhrases = []) {
  const phrases = [...new Set((Array.isArray(highlightPhrases) ? highlightPhrases : [])
    .map(value => String(value || '').trim()).filter(value => value && value.length <= 120 && !/[<>\r\n{}]/.test(value)))].slice(0, 8).sort((a,b) => b.length-a.length);
  const pattern = phrases.length ? new RegExp(phrases.map(phrase => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi') : null;
  const highlight = line => {
    if (!pattern || /^(?:Dear\b|I am applying\b|I appreciate the convenience of ATS-based applications\b|Warm regards|Vijay DAFAL)/i.test(line)) return escape(line);
    let result = '', cursor = 0;
    for (const match of line.matchAll(pattern)) {
      const left = line[match.index-1] || '', right = line[match.index+match[0].length] || '';
      if (/[\p{L}\p{N}_]/u.test(left) || /[\p{L}\p{N}_]/u.test(right)) continue;
      result += escape(line.slice(cursor,match.index)) + `<mark data-job-aligned="true" data-highlight="true">${escape(match[0])}</mark>`;
      cursor = match.index+match[0].length;
    }
    return result+escape(line.slice(cursor));
  };
  const linked=renderLinkedRoleOpening(text,highlight);
  if(linked!==null)return linked;
  return String(text).replace(/\r\n/g, '\n').split('\n').map(line => {
    const match = line.match(/^Job advert:\s*(https?:\/\/\S+)\s*$/i);
    if (match) {
      try {
        const url = new URL(match[1]);
        if (['http:', 'https:'].includes(url.protocol)) return `Job advert: <a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">Job advert</a>`;
      } catch {}
    }
    return highlight(line);
  }).join('<br>');
}
