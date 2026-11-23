// Letter toolbar extras: a Keywords check (highlights the advert's key terms the letter uses, lists the missing ones and
// whether your evidence supports them) and keyboard shortcuts for every toolbar button. Free and local; nothing is saved
// except through the letter's normal autosave.
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
  {keys: 'Ctrl+Shift+8', command: 'insertUnorderedList', label: 'Bullet list'},
  {keys: 'Ctrl+Shift+7', command: 'insertOrderedList', label: 'Numbered list'},
  {keys: 'Ctrl+Shift+H', command: 'toggleJobHighlight', label: 'Highlight selected text'},
  {keys: 'Ctrl+K', command: 'createLink', label: 'Add a link'},
  {keys: 'Ctrl+Shift+K', command: 'keywordCheck', label: 'Keywords: highlight and list missing'},
  {keys: 'Ctrl+Shift+F', command: 'fitParagraph', label: 'Strong-fit paragraph'},
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
const GREETING = /^(?:Dear\b|Hello\b|Hi\b|Kind regards|Warm regards|Best regards|Regards|Sincerely|Yours)/i;
// Marks the first use of each term as an automatic highlight (the same kind "Clear automatic highlights" removes).
export function markTerms(editor, terms) {
  const doc = editor.ownerDocument;
  let marked = 0;
  for (const t of terms) {
    const pattern = termPattern(t.stems);
    if (!pattern) continue;
    const walker = doc.createTreeWalker(editor, 4);
    let node, done = false;
    while (!done && (node = walker.nextNode())) {
      if (node.parentElement?.closest('mark,a,[data-highlight-origin]') || GREETING.test(node.data.trim())) continue;
      const m = pattern.exec(node.data);
      if (!m) continue;
      const after = node.splitText(m.index), rest = after.splitText(m[0].length);
      const mark = doc.createElement('mark');
      mark.style.backgroundColor = '#fff2a8'; mark.dataset.highlightOrigin = 'auto'; mark.dataset.jobAligned = 'true'; mark.dataset.highlight = 'true'; mark.dataset.highlightQuote = after.data;
      after.parentNode.insertBefore(mark, after); mark.appendChild(after);
      void rest; marked++; done = true;
    }
  }
  return marked;
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

  const panels = new Map();
  for (const toolbar of toolbars) {
    const editor = doc.getElementById(toolbar.dataset.editorTarget);
    if (!editor || !reviewId) continue;
    const button = el(doc, 'button', {type: 'button', 'data-keyword-check': '', title: 'Highlight the advert\'s keywords in this letter and list the missing ones (Ctrl+Shift+K)', 'aria-keyshortcuts': 'Control+Shift+K', text: 'Keywords'});
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

  async function check(editor, panel) {
    panel.hidden = false; panel.replaceChildren(el(doc, 'p', {text: 'Checking the advert\'s keywords…'}));
    try {
      const r = await fetchImpl('/api/reviews/' + encodeURIComponent(reviewId) + '/keywords', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({letterText: plainText(editor)})});
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'The keyword check failed.');
      const used = data.terms.filter(t => t.inLetter), backed = data.terms.filter(t => !t.inLetter && t.supported), unbacked = data.terms.filter(t => !t.inLetter && !t.supported);
      const marked = markTerms(editor, used);
      if (marked) editor.dispatchEvent(new (doc.defaultView?.InputEvent || doc.defaultView?.Event || Event)('input', {bubbles: true}));
      const detail = el(doc, 'p', {class: 'keyword-evidence', 'data-keyword-evidence': '', hidden: ''});
      const parts = [el(doc, 'p', {'data-keyword-summary': '', text: `${used.length} of ${data.terms.length} key terms from the advert are in this letter${marked ? `; ${marked} newly highlighted` : ''}. Keyword match: ${data.score}%.`})];
      if (backed.length) {
        const row = el(doc, 'div', {'data-keyword-missing-backed': ''}, [el(doc, 'strong', {text: 'Missing, backed by your evidence: '})]);
        for (const t of backed) {
          const c = chip(t.term, '#ecfdf5');
          c.addEventListener('click', () => {
            detail.hidden = false; detail.replaceChildren(el(doc, 'span', {text: `${t.evidence.source}: “${t.evidence.text}” `}));
            const copy = el(doc, 'button', {type: 'button', text: 'Copy line'});
            copy.addEventListener('click', async () => { try { await clipboard.writeText(t.evidence.text); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy blocked'; } });
            detail.append(copy);
          });
          row.append(c);
        }
        parts.push(row, detail);
      }
      if (unbacked.length) {
        const row = el(doc, 'div', {'data-keyword-missing-unbacked': ''}, [el(doc, 'strong', {text: 'Missing, not in your evidence (add only if true): '})]);
        for (const t of unbacked) { const c = chip(t.term, '#fff'); c.disabled = true; c.style.cursor = 'default'; c.style.color = '#64748b'; row.append(c); }
        parts.push(row);
      }
      if (!backed.length && !unbacked.length) parts.push(el(doc, 'p', {text: 'Every key term from the advert is already in this letter.'}));
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
    if (s.command === 'fitParagraph') { editor.dispatchEvent(new (doc.defaultView?.CustomEvent || CustomEvent)('fit-paragraph-open', {bubbles: false})); return; }
    const toolbar = doc.querySelector(`.rich-editor-toolbar[data-editor-target="${editor.id}"]`);
    const button = toolbar?.querySelector(`button[data-editor-command="${s.command}"]`);
    button?.dispatchEvent(new (doc.defaultView?.MouseEvent || Event)('mousedown', {bubbles: true, cancelable: true}));
  });
}

if (typeof document !== 'undefined') {
  const start = () => attachLetterKeywordControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
