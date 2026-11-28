// Letter toolbar extras: a Keywords check (the advert's requirements, Essential or Desirable, against this letter and your
// evidence: what it covers, what to add and where, and what not to claim) and keyboard shortcuts for every toolbar button.
// The advert is read once per application (AI when available); the check itself is free and nothing is saved except
// through the letter's normal autosave.
const el = (doc, tag, props = {}, children = []) => {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'text') node.textContent = v; else if (k === 'class') node.className = v; else node.setAttribute(k, v); }
  for (const c of children) node.append(c);
  return node;
};

// Shortcut -> toolbar command. Ctrl+B and Ctrl+I are the browser's own; they are listed so the tooltips show them.
export const SHORTCUTS = Object.freeze([
  {keys: 'Ctrl+B', command: 'bold', label: 'Bold', native: true},
  {keys: 'Ctrl+I', command: 'italic', label: 'Italic', native: true},
  {keys: 'Ctrl+Z', command: 'undo', label: 'Undo', native: true},
  {keys: 'Ctrl+Shift+Z', command: 'redo', label: 'Redo', native: true},
  {keys: 'Ctrl+Shift+8', command: 'insertUnorderedList', label: 'Bullet list'},
  {keys: 'Ctrl+Shift+7', command: 'insertOrderedList', label: 'Numbered list'},
  {keys: 'Ctrl+Shift+H', command: 'toggleJobHighlight', label: 'Highlight selected text'},
  {keys: 'Ctrl+K', command: 'createLink', label: 'Add a link'},
  {keys: 'Ctrl+Shift+K', command: 'keywordCheck', label: 'Keywords: highlight and list missing'},
  {keys: 'Ctrl+\\', command: 'removeFormat', label: 'Clear format'},
  {keys: 'Ctrl+/', command: 'shortcutHelp', label: 'Show these shortcuts'}
]);
export function shortcutFor(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.code === 'Digit8' ? '8' : event.code === 'Digit7' ? '7' : String(event.key || '').length === 1 ? event.key.toUpperCase() : event.key;
  const combo = 'Ctrl+' + (event.shiftKey ? 'Shift+' : '') + key;
  return SHORTCUTS.find(s => !s.native && s.keys.toUpperCase() === combo.toUpperCase()) || null;
}

// A pattern for one term from its stems: each stem followed by the rest of its word, words joined by spaces or hyphens.
export function termPattern(stems) {
  const parts = (stems || []).map(s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[\\w'’]*");
  return parts.length ? new RegExp('(?<![\\w])' + parts.join('[\\s\\-]+'), 'i') : null;
}

// Greeting and sign-off lines are never highlighted ("Dear Hiring Manager" is not a keyword).
const GREETING = /^\s*(?:Dear\b|Hello\b|Hi\b|Kind regards|Warm regards|Best regards|Regards|Sincerely|Yours)/i;

// Phrase highlighting. A highlight is the whole phrase that carries the advert's terms ("agile delivery, daily
// governance and senior stakeholder visibility"), never a lone word. A sentence is cut into phrases at punctuation,
// at linking words ("across", "through", "by"...) and at commas that start a new clause ("At SKY, I..."); commas inside
// a list keep the list together. Phrases holding a term are trimmed of filler at their edges and kept short.
const LINK = new Set(['of', 'through', 'across', 'by', 'with', 'using', 'via', 'giving', 'which', 'while', 'whilst', 'where', 'when',
  'within', 'to', 'for', 'from', 'into', 'on', 'at', 'in', 'including', 'because', 'so', 'that', 'who', 'matches', 'match', 'means']);
const CLAUSE = new Set(['i', 'we', 'my', 'our', 'and', 'or', 'but', 'which', 'who', 'while', 'whilst', 'so', 'then', 'where', 'when', 'including']);
const EDGE = new Set(['i', 'my', 'a', 'an', 'the', 'and', 'or', 'also', 'have', 'has', 'had', 'hold', 'held', 'am', 'is', 'are', 'was',
  'were', 'be', 'been', 'it', 'its', 'this', 'these', 'those', 'our', 'we', 'me', 'both', 'as', 'their', 'bring', 'brings', 'bringing', 'offer', 'offers']);
const HARD = /[.;:!?\n—–]|\s-\s/;
const WORD = /[\p{L}\p{N}£$€][\p{L}\p{N}'’®™&+\-\/%]*(?:\.[\p{L}\p{N}]+)*/gu;

// Phrases in one block of text (a paragraph or bullet) for the first use of each pattern there.
// Returns [{start, end, terms}] with terms as indexes into patterns; at most perBlock phrases, best first by terms held.
export function phraseSpans(text, patterns, {maxWords = 14, perBlock = 2} = {}) {
  const src = String(text || '');
  const masked = src.split('\n').map(line => GREETING.test(line) ? ' '.repeat(line.length) : line).join('\n');
  const matches = [];
  (patterns || []).forEach((p, term) => {
    if (!p) return;
    const m = new RegExp(p.source, p.flags.replace('g', '')).exec(masked);
    if (m && m[0]) matches.push({start: m.index, end: m.index + m[0].length, term});
  });
  if (!matches.length) return [];
  const tokens = [...masked.matchAll(WORD)].map(m => ({start: m.index, end: m.index + m[0].length, word: m[0].toLowerCase()}));
  const hitsOf = t => matches.filter(m => t.start < m.end && t.end > m.start);
  const sameMatch = (a, b) => matches.some(m => a.start >= m.start && a.start < m.end && b.end <= m.end);
  const pieces = [];
  let cur = null, prev = null, breakNext = 'hard';
  for (const t of tokens) {
    let join = breakNext; breakNext = null;
    if (prev && !sameMatch(prev, t)) {
      const gap = masked.slice(prev.end, t.start);
      if (HARD.test(gap)) join = 'hard';
      else if (gap.includes(',') && join !== 'hard') join = CLAUSE.has(t.word) || (/^[a-z]+(?:ing|ed)$/.test(masked.slice(t.start, t.end)) && !hitsOf(t).length) ? 'clause' : 'comma';
    }
    prev = t;
    if (LINK.has(t.word) && !hitsOf(t).length) { breakNext = 'hard'; cur = null; continue; }
    if (join || !cur) { cur = {tokens: [], join: join || 'hard'}; pieces.push(cur); }
    cur.tokens.push(t);
  }
  const hasHit = list => list.some(t => hitsOf(t).length);
  const groups = [];
  for (const p of pieces) {
    const g = groups[groups.length - 1];
    const listAnd = p.join === 'clause' && ['and', 'or'].includes(p.tokens[0].word) && g && hasHit(g) && hasHit(p.tokens) && p.tokens.length <= 6;
    if (g && (p.join === 'comma' || listAnd)) g.push(...p.tokens); else groups.push([...p.tokens]);
  }
  const spans = [];
  for (const g of groups) {
    let a = 0, b = g.length - 1;
    const hit = i => hitsOf(g[i]).length > 0;
    while (a <= b && !hit(a) && EDGE.has(g[a].word)) a++;
    while (b >= a && !hit(b) && EDGE.has(g[b].word)) b--;
    if (a > b) continue;
    const idx = []; for (let i = a; i <= b; i++) if (hit(i)) idx.push(i);
    if (!idx.length) continue;
    // "...OKR capability and working": an "and" after the last term starts something else.
    for (let i = idx[idx.length - 1] + 1; i <= b; i++) if (['and', 'or'].includes(g[i].word)) { b = i - 1; break; }
    if (b - a + 1 > maxWords) {
      a = Math.max(a, idx[0] - 2);
      while (a < idx[0] && EDGE.has(g[a].word)) a++;
      b = idx.filter(i => i - a < maxWords).pop() ?? idx[0];
    }
    let start = g[a].start, end = g[b].end;
    const opened = (src.slice(start, end).match(/\(/g) || []).length - (src.slice(start, end).match(/\)/g) || []).length;
    if (opened > 0 && src[end] === ')') end++;
    const terms = [...new Set(matches.filter(m => m.start < end && m.end > start).map(m => m.term))];
    spans.push({start, end, terms});
  }
  return spans.sort((x, y) => y.terms.length - x.terms.length).slice(0, perBlock).sort((x, y) => x.start - y.start);
}

const BLOCK = 'p,li,div,h1,h2,h3,h4,h5,h6,blockquote';
// Marks, as automatic highlights (the kind "Clear automatic highlights" removes), the phrase around the first use of
// each term. Text already highlighted or linked is left alone. Returns the number of phrases highlighted.
export function markKeywordPhrases(editor, terms) {
  const doc = editor.ownerDocument;
  const blocks = new Map();
  const entryFor = el => {
    let block = el?.closest?.(BLOCK);
    if (!block || !editor.contains(block)) block = editor;
    if (!blocks.has(block)) blocks.set(block, {text: '', segs: []});
    return blocks.get(block);
  };
  const walker = doc.createTreeWalker(editor, 1 | 4);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === 1) {
      if (node.tagName === 'BR' || node.matches(BLOCK + ',ul,ol')) entryFor(node.parentElement).text += '\n';
      continue;
    }
    const entry = entryFor(node.parentElement);
    entry.segs.push({node, start: entry.text.length, end: entry.text.length + node.data.length, skip: Boolean(node.parentElement?.closest('mark,a,[data-highlight-origin]'))});
    entry.text += node.data;
  }
  let remaining = (terms || []).map(t => termPattern(t.stems)).filter(Boolean);
  const jobs = [];
  for (const entry of blocks.values()) {
    if (!remaining.length) break;
    let text = entry.text;
    for (const s of entry.segs) if (s.skip) text = text.slice(0, s.start) + ' '.repeat(s.end - s.start) + text.slice(s.end);
    const spans = phraseSpans(text, remaining);
    if (!spans.length) continue;
    const used = new Set(spans.flatMap(s => s.terms));
    remaining = remaining.filter((_, i) => !used.has(i));
    for (const span of spans) jobs.push({entry, span});
  }
  let marked = 0;
  for (const {entry, span} of jobs.reverse()) {
    const quote = entry.text.slice(span.start, span.end);
    let any = false;
    for (const seg of [...entry.segs].reverse()) {
      if (seg.skip || seg.end <= span.start || seg.start >= span.end) continue;
      const a = Math.max(span.start, seg.start) - seg.start, b = Math.min(span.end, seg.end) - seg.start;
      if (!seg.node.data.slice(a, b).trim()) continue;
      let target = seg.node;
      if (b < target.data.length) target.splitText(b);
      if (a > 0) target = target.splitText(a);
      const mark = doc.createElement('mark');
      mark.style.backgroundColor = '#fff2a8'; mark.dataset.highlightOrigin = 'auto'; mark.dataset.jobAligned = 'true'; mark.dataset.highlight = 'true'; mark.dataset.highlightQuote = quote;
      target.parentNode.insertBefore(mark, target); mark.appendChild(target);
      any = true;
    }
    if (any) marked++;
  }
  return marked;
}

// Instant tooltips for toolbar buttons: the browser's own title tooltip appears only after a delay, so the shortcut
// is easy to miss. One floating label, shown on hover or keyboard focus; the title stays for screen readers and tests
// but is held back while the instant tooltip is showing, so the two never overlap.
export function attachInstantTooltips(doc = document) {
  if (doc.__instantTooltips) return;
  doc.__instantTooltips = true;
  const tip = el(doc, 'div', {class: 'toolbar-instant-tip', role: 'tooltip', 'data-instant-tip': '', hidden: ''});
  Object.assign(tip.style, {position: 'fixed', zIndex: '1000', pointerEvents: 'none', background: '#1e293b', color: '#fff', fontSize: '.8rem', lineHeight: '1.3', padding: '.25rem .5rem', borderRadius: '6px', maxWidth: '18rem', boxShadow: '0 2px 6px rgba(0,0,0,.2)', whiteSpace: 'normal'});
  doc.body.append(tip);
  let current = null;
  const target = node => node?.closest?.('.rich-editor-toolbar button[title], .rich-editor-toolbar button[data-tip]');
  const show = button => {
    if (current === button) return;
    hide();
    const text = button.getAttribute('title') || button.dataset.tip;
    if (!text) return;
    button.dataset.tip = text; button.removeAttribute('title'); current = button;
    tip.textContent = text; tip.hidden = false;
    place(button);
  };
  const place = button => {
    const r = button.getBoundingClientRect(), view = doc.defaultView;
    const width = tip.offsetWidth || 160, left = Math.max(4, Math.min(r.left + r.width / 2 - width / 2, (view?.innerWidth || 1024) - width - 4));
    const below = r.bottom + 6, height = tip.offsetHeight || 24;
    tip.style.left = left + 'px'; tip.style.top = (below + height > (view?.innerHeight || 768) ? r.top - height - 6 : below) + 'px';
  };
  function hide() { if (current) { current.setAttribute('title', current.dataset.tip); current = null; } tip.hidden = true; tip.textContent = ''; }
  doc.addEventListener('pointerover', e => { const b = target(e.target); if (b) show(b); else if (current) hide(); });
  doc.addEventListener('pointerout', e => { if (current && !current.contains(e.relatedTarget)) hide(); });
  doc.addEventListener('focusin', e => { const b = target(e.target); if (b && b.matches(':focus-visible')) show(b); });
  doc.addEventListener('focusout', () => hide());
  doc.addEventListener('mousedown', () => hide(), true);
  doc.defaultView?.addEventListener('scroll', () => { if (current) place(current); }, true);
}

const plainText = editor => String(editor.innerText ?? editor.textContent ?? '');

export function attachLetterKeywordControls(doc = document, fetchImpl = fetch, clipboard = globalThis.navigator?.clipboard) {
  if (doc.__letterKeywordControls) return;
  doc.__letterKeywordControls = true;
  const reviewId = doc.querySelector('input[name="reviewId"]')?.value;
  const toolbars = [...doc.querySelectorAll('.rich-editor-toolbar')].filter(t => ['cover-letter-draft', 'proposed-cover-letter'].includes(t.dataset.editorTarget));

  // Tooltips name the shortcut.
  for (const toolbar of doc.querySelectorAll('.rich-editor-toolbar')) for (const b of toolbar.querySelectorAll('button[data-editor-command]')) {
    const s = SHORTCUTS.find(x => x.command === b.dataset.editorCommand);
    if (s && !String(b.title || '').includes(s.keys)) { b.title = `${b.title || s.label} (${s.keys})`; b.setAttribute('aria-keyshortcuts', s.keys.replace('Ctrl', 'Control')); }
  }

  attachInstantTooltips(doc);

  const panels = new Map();
  for (const toolbar of toolbars) {
    const editor = doc.getElementById(toolbar.dataset.editorTarget);
    if (!editor || !reviewId) continue;
    const button = el(doc, 'button', {type: 'button', 'data-keyword-check': '', title: 'Check this letter against what the advert asks for: highlights what it covers and says what to add (Ctrl+Shift+K)', 'aria-keyshortcuts': 'Control+Shift+K', text: 'Keywords'});
    const help = el(doc, 'button', {type: 'button', 'data-shortcut-help': '', title: 'Keyboard shortcuts (Ctrl+/)', 'aria-keyshortcuts': 'Control+/', text: 'Shortcuts'});
    toolbar.append(button, help);
    const panel = el(doc, 'div', {class: 'keyword-panel', hidden: '', role: 'region', 'aria-label': 'Keywords for this letter', 'data-keyword-panel': editor.id});
    Object.assign(panel.style, {border: '1px solid #e2e8f0', borderRadius: '8px', padding: '.6rem .8rem', margin: '.4rem 0', background: '#f8fafc', fontSize: '.92rem'});
    toolbar.after(panel);
    panels.set(editor, panel);
    button.addEventListener('mousedown', e => e.preventDefault());
    button.addEventListener('click', () => check(editor, panel));
    help.addEventListener('mousedown', e => e.preventDefault());
    help.addEventListener('click', () => showHelp(panel));
  }

  function chip(text, colour) { const c = el(doc, 'button', {type: 'button', class: 'keyword-chip', text}); Object.assign(c.style, {border: '1px solid #cbd5e1', borderRadius: '999px', padding: '.1rem .6rem', margin: '.15rem .25rem .15rem 0', background: colour, cursor: 'pointer', fontSize: '.85rem'}); return c; }

  async function check(editor, panel, {mark = true, readAgain = false} = {}) {
    panel.hidden = false; panel.replaceChildren(el(doc, 'p', {text: 'Reading what the advert asks for…'}));
    try {
      const pending = fetchImpl('/api/reviews/' + encodeURIComponent(reviewId) + '/keywords', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({letterText: plainText(editor), ...(readAgain ? {readAdvertAgain: true} : {})})});
      try { doc.dispatchEvent(new (doc.defaultView?.CustomEvent || CustomEvent)('nmp-activity-started')); } catch {}
      const r = await pending;
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'The keyword check failed.');
      const g = data.groups, s = data.summary;
      const marked = mark ? markKeywordPhrases(editor, g.inLetter) : 0;
      if (marked) editor.dispatchEvent(new (doc.defaultView?.InputEvent || doc.defaultView?.Event || Event)('input', {bubbles: true}));
      const detail = el(doc, 'p', {class: 'keyword-evidence', 'data-keyword-evidence': '', hidden: ''});
      const reading = data.source === 'ai' ? 'Requirements read from the advert by AI (saved for this application).' : 'Requirements from the built-in advert reader.';
      const parts = [el(doc, 'p', {'data-keyword-summary': '', text: `Essential: ${s.essentialInLetter} of ${s.essentialTotal} in this letter · ${s.inLetter} of ${s.total} requirements overall${marked ? `; ${marked} phrase${marked === 1 ? '' : 's'} highlighted` : ''}${!mark && g.inLetter.length ? '. Click Keywords to highlight them' : ''}.`}),
        el(doc, 'p', {class: 'keyword-source', 'data-keyword-source': data.source, text: reading + (data.note ? ' ' + data.note : '')})];
      if (data.canReadAgain) {
        const again = el(doc, 'button', {type: 'button', 'data-keyword-read-again': '', text: 'Read the advert with AI again (one small paid request)'});
        again.addEventListener('click', () => { if ((doc.defaultView?.confirm || (() => true))('Read this advert with AI again? This is one small paid request; it is not repeated if it fails.')) check(editor, panel, {mark, readAgain: true}); });
        parts.push(again);
      }
      if (data.nextSteps.length) parts.push(el(doc, 'ul', {'data-keyword-next': ''}, data.nextSteps.map(t => el(doc, 'li', {text: t}))));
      const label = t => t.term + (t.priority === 'essential' ? '' : ' (desirable)') + (t.unbackedClaim ? ' ⚠' : '') + (t.via?.relation === 'equivalent' ? ' ≈' : '');
      const tip = t => `${t.category}, ${t.priority}` + (t.aliases.length ? ` · also written as: ${t.aliases.slice(0, 4).join(', ')}` : '') + (t.unbackedClaim ? ' · not shown in your CV or evidence: check it is true' : '') + (t.via ? ` · backed through ${t.via.term}` : '');
      const show = (...nodes) => { detail.hidden = false; detail.replaceChildren(...nodes); };
      const row = (attr, heading, list, colour, onClick) => {
        if (!list.length) return null;
        const box = el(doc, 'div', {[attr]: ''}, [el(doc, 'strong', {text: heading + ' '})]);
        for (const t of list) {
          const c = chip(label(t), colour); c.title = tip(t); if (t.priority === 'essential') c.style.fontWeight = '600';
          if (onClick) c.addEventListener('click', () => onClick(t)); else { c.disabled = true; c.style.cursor = 'default'; c.style.color = '#64748b'; }
          box.append(c);
        }
        return box;
      };
      const rows = [
        row('data-keyword-in-letter', 'In the letter:', g.inLetter, '#f0fdf4', t => show(el(doc, 'span', {text: t.via?.relation === 'equivalent'
          ? `${t.term}: covered by your equivalent, written as “${t.writtenAs}”. Never claim ${t.term} itself.`
          : `${t.term}: written as “${t.writtenAs}”.` + (t.unbackedClaim ? ' Your CV and evidence do not show this: keep it only if it is true for you.' : t.evidence ? ` Backed by ${t.evidence.source}: “${t.evidence.text}”` : '')}))),
        row('data-keyword-missing-backed', 'Missing, backed by your evidence:', g.missingBacked, '#ecfdf5', t => {
          const copy = el(doc, 'button', {type: 'button', text: 'Copy line'});
          copy.addEventListener('click', async () => { try { await clipboard.writeText(t.evidence.text); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy blocked'; } });
          const via = t.via?.relation === 'equivalent' ? `You hold ${t.via.term}, not ${t.term}: name ${t.via.term}. ` : t.via ? `Shown through ${t.via.term}. ` : '';
          show(el(doc, 'span', {text: `${via}Best place: ${t.fits}. ${t.evidence.source}: “${t.evidence.text}” `}), copy);
        }),
        row('data-keyword-missing-unbacked', 'Essential, not in your evidence (add only if true):', g.missingUnbacked, '#fff', null)
      ].filter(Boolean);
      parts.push(...rows, detail);
      if (g.lowValue.length) {
        const low = el(doc, 'details', {'data-keyword-low-value': ''}, [el(doc, 'summary', {text: `Not worth adding (${g.lowValue.length}): desirable, with no evidence`})]);
        low.append(el(doc, 'p', {text: g.lowValue.map(t => t.term).join(', ')}));
        parts.push(low);
      }
      if (!g.missingBacked.length && !g.missingUnbacked.length) parts.push(el(doc, 'p', {text: 'Every Essential requirement from the advert is already in this letter.'}));
      panel.replaceChildren(...parts);
    } catch (error) { panel.replaceChildren(el(doc, 'p', {text: error.message})); }
  }

  function showHelp(panel) {
    panel.hidden = false;
    panel.replaceChildren(el(doc, 'strong', {text: 'Keyboard shortcuts (in the letter)'}),
      el(doc, 'ul', {'data-shortcut-list': ''}, SHORTCUTS.map(s => el(doc, 'li', {text: `${s.keys}: ${s.label}`}))));
  }

  doc.addEventListener('keydown', event => {
    const editor = event.target?.closest?.('#cover-letter-draft,#proposed-cover-letter');
    if (!editor) return;
    const s = shortcutFor(event);
    if (!s) return;
    event.preventDefault();
    const panel = panels.get(editor);
    if (s.command === 'keywordCheck') { if (panel) check(editor, panel); return; }
    if (s.command === 'shortcutHelp') { if (panel) showHelp(panel); return; }
    const toolbar = doc.querySelector(`.rich-editor-toolbar[data-editor-target="${editor.id}"]`);
    const button = toolbar?.querySelector(`button[data-editor-command="${s.command}"]`);
    button?.dispatchEvent(new (doc.defaultView?.MouseEvent || Event)('mousedown', {bubbles: true, cancelable: true}));
  });

  // Straight after polishing, the proposal is checked automatically (free); it highlights only when you click Keywords.
  const proposal = doc.getElementById('proposed-cover-letter');
  if (proposal && panels.has(proposal) && doc.defaultView?.location?.pathname === '/cover-letter-refinement') check(proposal, panels.get(proposal), {mark: false});
}

if (typeof document !== 'undefined') {
  const start = () => attachLetterKeywordControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
