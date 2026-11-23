// "Fit paragraph" on the letter toolbars: a short "why I am a strong fit" paragraph from this application's evidence,
// editable, then inserted where the cursor is. The draft is free; "Polish with AI" uses the Application questions writer
// (estimate first, one paid request). Nothing is sent.
const el = (doc, tag, props = {}, children = []) => {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'text') node.textContent = v; else if (k === 'class') node.className = v; else node.setAttribute(k, v); }
  for (const c of children) node.append(c);
  return node;
};

// Inserts the paragraph at the remembered cursor: as a new paragraph after the current <p>/<li>, or as its own lines.
export function insertParagraph(editor, range, text) {
  const doc = editor.ownerDocument, value = String(text || '').trim();
  if (!value) return false;
  const inside = range && editor.contains(range.startContainer);
  const block = inside ? (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)?.closest('p,li') : null;
  if (block && editor.contains(block)) {
    // Cursor at the start of a paragraph: the new one goes before it; otherwise after it.
    const before = doc.createRange(); before.selectNodeContents(block); before.setEnd(range.startContainer, range.startOffset);
    const p = doc.createElement('p'); p.textContent = value;
    const anchor = block.closest('ul,ol') || block;
    if (before.toString().trim()) anchor.after(p); else anchor.before(p);
    return true;
  }
  const at = inside ? range.cloneRange() : (() => { const r = doc.createRange(); r.selectNodeContents(editor); r.collapse(false); return r; })();
  at.collapse(true);
  // Lines separated by <br>: never split a sentence; go to the start of the line the cursor is on.
  if (inside && at.startContainer.nodeType === 3 && at.startOffset > 0) at.setStartBefore(at.startContainer), at.collapse(true);
  const frag = doc.createDocumentFragment();
  frag.append(doc.createTextNode(value), doc.createElement('br'), doc.createElement('br'));
  at.insertNode(frag);
  return true;
}

export function attachFitParagraphControls(doc = document, fetchImpl = fetch, clipboard = globalThis.navigator?.clipboard) {
  if (doc.__fitParagraphControls) return;
  doc.__fitParagraphControls = true;
  const reviewId = doc.querySelector('input[name="reviewId"]')?.value;
  if (!reviewId) return;
  const base = '/api/reviews/' + encodeURIComponent(reviewId);
  const call = async (path, body) => {
    const r = await fetchImpl(base + path, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body || {})});
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || 'The fit paragraph failed.');
    return data;
  };
  const ranges = new Map();
  doc.addEventListener('selectionchange', () => {
    const s = doc.defaultView?.getSelection?.();
    if (!s?.rangeCount) return;
    const r = s.getRangeAt(0), editor = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement)?.closest?.('#cover-letter-draft,#proposed-cover-letter');
    if (editor) ranges.set(editor, r.cloneRange());
  });

  for (const toolbar of doc.querySelectorAll('.rich-editor-toolbar')) {
    const editor = doc.getElementById(toolbar.dataset.editorTarget);
    if (!editor || !['cover-letter-draft', 'proposed-cover-letter'].includes(editor.id)) continue;
    const button = el(doc, 'button', {type: 'button', 'data-fit-paragraph': '', title: 'Draft a "why I am a strong fit" paragraph from your evidence (Ctrl+Shift+F)', 'aria-keyshortcuts': 'Control+Shift+F', text: 'Fit paragraph'});
    button.addEventListener('mousedown', e => e.preventDefault());
    toolbar.append(button);
    const panel = el(doc, 'div', {class: 'fit-panel', hidden: '', role: 'region', 'aria-label': 'Strong-fit paragraph', 'data-fit-panel': editor.id});
    Object.assign(panel.style, {border: '1px solid #e2e8f0', borderRadius: '8px', padding: '.6rem .8rem', margin: '.4rem 0', background: '#f0fdf4', fontSize: '.92rem'});
    (doc.querySelector(`[data-keyword-panel="${editor.id}"]`) || toolbar).after(panel);
    const used = el(doc, 'p', {'data-fit-used': ''});
    const text = el(doc, 'textarea', {rows: '5', 'aria-label': 'Strong-fit paragraph (editable)', 'data-fit-text': ''});
    Object.assign(text.style, {width: '100%', boxSizing: 'border-box'});
    const insert = el(doc, 'button', {type: 'button', text: 'Insert at cursor'}), polish = el(doc, 'button', {type: 'button', text: 'Polish with AI (estimate)'}), copy = el(doc, 'button', {type: 'button', text: 'Copy'});
    const ai = el(doc, 'div', {hidden: '', 'data-fit-ai': ''}), status = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-fit-status': ''});
    const actions = el(doc, 'div', {class: 'actions'}, [insert, polish, copy]);
    panel.append(el(doc, 'strong', {text: 'Why I am a strong fit'}), used, text, actions, ai, status);
    let draft = null;

    async function open() {
      panel.hidden = false; status.textContent = 'Drafting from your evidence (free)…'; ai.hidden = true;
      try {
        draft = await call('/fit-paragraph');
        text.value = draft.paragraph;
        const u = draft.used, bits = [];
        if (u.years) bits.push(u.years + ' (from your CV)');
        if (u.certifications.length) bits.push('certifications: ' + u.certifications.join(', ') + ' (from your CV)');
        if (u.terms.length) bits.push('advert terms your evidence supports: ' + u.terms.join(', '));
        bits.push(`${u.evidence.length} evidence line${u.evidence.length === 1 ? '' : 's'}`);
        used.textContent = 'Uses only your evidence: ' + bits.join('; ') + '. Edit it, then place your cursor in the letter and choose Insert.';
        status.textContent = '';
      } catch (error) { status.textContent = error.message; }
    }
    button.addEventListener('click', open);
    editor.addEventListener('fit-paragraph-open', open);
    insert.addEventListener('click', () => {
      if (!insertParagraph(editor, ranges.get(editor), text.value)) { status.textContent = 'There is no paragraph to insert.'; return; }
      editor.dispatchEvent(new (doc.defaultView?.InputEvent || doc.defaultView?.Event || Event)('input', {bubbles: true}));
      status.textContent = ranges.get(editor) ? 'Inserted at your cursor. The letter saves as usual.' : 'Inserted at the end of the letter (no cursor position was set). Move it if needed.';
    });
    copy.addEventListener('click', async () => { try { await clipboard.writeText(text.value); status.textContent = 'Copied.'; } catch { status.textContent = 'Copy is blocked: select the text and press Ctrl+C.'; } });
    polish.addEventListener('click', async () => {
      if (!draft) return;
      const spec = {question: draft.aiQuestion, unit: 'words', limit: draft.aiLimit, currentDraft: text.value};
      polish.disabled = true; status.textContent = 'Estimating the cost (nothing is sent)…';
      try {
        const e = await call('/questions/estimate', spec);
        if (!e.available) { status.textContent = e.message || 'Writing with AI is off.'; return; }
        const model = e.models.find(m => m.id === e.model) || e.models[0];
        const go = el(doc, 'button', {type: 'button', text: 'Write with AI (paid, one request)'});
        ai.replaceChildren(el(doc, 'span', {text: `One request, ${model ? `about $${Number(model.estimatedTokenCostUsd).toFixed(4)} with ${model.label}` : 'cost unknown'}; it uses only your evidence. `}), go);
        ai.hidden = false; status.textContent = '';
        go.addEventListener('click', async () => {
          go.disabled = true; status.textContent = 'Polishing the paragraph (one paid request)…';
          try {
            const w = await call('/questions/write', {...spec, model: e.model, confirmedCostProof: e.costProof});
            text.value = w.answer; ai.hidden = true;
            const figures = w.check?.unsupportedFigures?.length ? ` Check these figures; they are not in your evidence: ${w.check.unsupportedFigures.join(', ')}.` : '';
            status.textContent = 'Polished. Read it, then Insert.' + figures + (w.notes ? ' Note: ' + w.notes : '');
          } catch (error) { status.textContent = error.message; go.disabled = false; }
        });
      } catch (error) { status.textContent = error.message; } finally { polish.disabled = false; }
    });
  }
}

if (typeof document !== 'undefined') {
  const start = () => attachFitParagraphControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
