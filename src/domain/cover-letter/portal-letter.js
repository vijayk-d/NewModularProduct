// Career-portal version of a reviewed letter. Pure string rules: the saved letter is never changed.
export const PORTAL_GREETING = 'Dear Hiring Manager/Talent Recruiter,';
const REDIRECTION_START = 'I appreciate the convenience of ATS-based applications';
const GREETING_LINE = /^[ \t]*Dear\b[^\n]*$/m;
const GREETING_HTML = /Dear(?:\s|&nbsp;)+[^<\n]{0,120}?,/;
const BLOCK = /<(p|div|li)\b[^>]*>((?:(?!<\/?(?:p|div|li)\b)[\s\S])*?)<\/\1>/g;

const textOf = html => String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const startsRedirection = text => text.replace(/\s+/g, ' ').trim().startsWith(REDIRECTION_START);

function portalPlain(plain) {
  let greeting = false;
  let text = String(plain).replace(GREETING_LINE, () => { greeting = true; return PORTAL_GREETING; });
  const paragraphs = text.split(/\n[ \t]*\n/);
  const kept = paragraphs.filter(p => !startsRedirection(p));
  const removed = kept.length !== paragraphs.length;
  if (removed) text = kept.join('\n\n');
  return {text, greeting, removed};
}

function portalHtml(html) {
  let greeting = false, removed = false;
  let out = String(html).replace(GREETING_HTML, () => { greeting = true; return PORTAL_GREETING; });
  out = out.replace(BLOCK, (block, tag, inner) => {
    if (!startsRedirection(textOf(inner))) return block;
    removed = true;
    return '';
  });
  if (!removed) {
    // Letters saved as <br>-separated lines: drop the paragraph line and one following blank line.
    const at = textOf(out).includes(REDIRECTION_START) ? out.indexOf(REDIRECTION_START) : -1;
    if (at >= 0) {
      const rest = out.slice(at);
      const end = /<br\s*\/?>(?:\s*<br\s*\/?>)?|<\/(?:p|div|li)>/i.exec(rest);
      const stop = end ? (end[0].startsWith('</') ? at + end.index : at + end.index + end[0].length) : out.length;
      out = out.slice(0, at) + out.slice(stop);
      removed = true;
    }
  }
  return {html: out, greeting, removed};
}

// Returns the portal version of both forms, or explains why they could not be changed consistently.
export function toPortalLetter({plain, html}) {
  const p = portalPlain(plain), h = portalHtml(html);
  if (p.greeting !== h.greeting) return {ok: false, reason: 'greeting'};
  if (p.removed !== h.removed || textOf(h.html).includes(REDIRECTION_START) || p.text.includes(REDIRECTION_START)) return {ok: false, reason: 'closing'};
  return {ok: true, plain: p.text, html: h.html, greetingReplaced: p.greeting, closingRemoved: p.removed};
}
