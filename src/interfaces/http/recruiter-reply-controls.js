// Reply assistant on the review page: paste a recruiter's reply, get a polite, evidence-led answer to copy into Gmail.
// Nothing is sent from here. Writing is optional and paid: estimate first, one request per confirmed click.
const el = (doc, tag, props = {}, children = []) => {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'text') node.textContent = v; else if (k === 'class') node.className = v; else node.setAttribute(k, v); }
  for (const c of children) node.append(c);
  return node;
};

// Plain-text reply (paragraphs separated by blank lines) into safe paragraphs, and back.
export function paragraphsOf(reply) { return String(reply || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean); }
export function fillEditor(doc, editor, reply) {
  editor.replaceChildren(...paragraphsOf(reply).map(p => { const node = el(doc, 'p'); p.split('\n').forEach((line, i) => { if (i) node.append(el(doc, 'br')); node.append(doc.createTextNode(line)); }); return node; }));
}
export function editorText(editor) { return [...editor.querySelectorAll('p')].map(p => p.innerText ?? p.textContent).join('\n\n').trim() || String(editor.innerText ?? editor.textContent ?? '').trim(); }

export function attachReplyControls(doc = document, fetchImpl = fetch, clipboard = globalThis.navigator?.clipboard) {
  const reviewId = doc.querySelector('input[name="reviewId"]')?.value;
  if (!reviewId || doc.getElementById('recruiter-reply')) return null;
  const api = '/api/reviews/' + encodeURIComponent(reviewId) + '/reply';
  const section = el(doc, 'section', {class: 'review-section recruiter-reply', id: 'recruiter-reply', 'aria-labelledby': 'recruiter-reply-title'});
  const panel = el(doc, 'details', {class: 'questions-panel'});
  const intro = el(doc, 'p', {class: 'questions-note', 'data-reply-intro': '', text: 'Loading…'});
  const theirs = el(doc, 'textarea', {id: 'reply-their-message', rows: '6', placeholder: 'Paste their email reply here, or fetch it from Gmail above'});
  // Read-only Gmail fetch: the replies in the thread of an email you sent for this application.
  const sentChoice = el(doc, 'select', {id: 'reply-sent-choice'}), fetchButton = el(doc, 'button', {type: 'button', text: 'Fetch their reply from Gmail (read-only)'});
  const replyChoice = el(doc, 'select', {id: 'reply-choice', hidden: ''});
  const gmailBox = el(doc, 'div', {class: 'reply-gmail', hidden: '', 'data-reply-gmail': ''}, [el(doc, 'label', {for: sentChoice.id, text: 'Email you sent'}), sentChoice, el(doc, 'div', {class: 'actions'}, [fetchButton]), el(doc, 'label', {for: replyChoice.id, class: 'visually-hidden', text: 'Which of their replies'}), replyChoice]);
  const name = el(doc, 'input', {id: 'reply-recipient-name', type: 'text', maxlength: '80', autocomplete: 'off'});
  const statusChoice = el(doc, 'select', {id: 'reply-application-status'});
  const note = el(doc, 'textarea', {id: 'reply-owner-note', rows: '2', placeholder: 'Optional: anything to add, for example the date you applied'});
  const estimate = el(doc, 'button', {type: 'button', text: 'Estimate: draft a reply with AI'});
  const aiLine = el(doc, 'div', {class: 'questions-ai', hidden: '', 'data-reply-ai': ''});
  const editor = el(doc, 'div', {id: 'reply-editor', class: 'reply-editor', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Suggested reply (editable)'});
  const copy = el(doc, 'button', {type: 'button', text: 'Copy reply'});
  const status = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-reply-status': ''});
  Object.assign(editor.style, {minHeight: '8rem', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '.6rem .8rem', background: '#fff'});
  const OPEN_KEY = 'jobapp.replyOpen';
  try { panel.open = doc.defaultView?.localStorage?.getItem(OPEN_KEY) === 'true'; } catch {}
  panel.addEventListener('toggle', () => { try { doc.defaultView?.localStorage?.setItem(OPEN_KEY, String(panel.open)); } catch {} });
  panel.append(el(doc, 'summary', {}, [el(doc, 'h2', {id: 'recruiter-reply-title', text: 'Reply assistant'})]), intro,
    gmailBox, el(doc, 'label', {for: theirs.id, text: 'Their reply'}), theirs,
    el(doc, 'label', {for: name.id, text: 'Their first name (optional)'}), name,
    el(doc, 'label', {for: statusChoice.id, text: 'Your online application'}), statusChoice,
    el(doc, 'label', {for: note.id, text: 'Anything to add (optional)'}), note,
    el(doc, 'div', {class: 'actions'}, [estimate]), aiLine,
    el(doc, 'p', {class: 'questions-note', text: 'Suggested reply. Edit it here, then copy it into your Gmail reply. Nothing is sent from this page.'}), editor,
    el(doc, 'div', {class: 'actions'}, [copy]), status);
  section.append(panel);
  const anchor = doc.getElementById('application-questions') || doc.getElementById('tailored-cv') || doc.querySelector('.panel--decision');
  if (anchor?.parentNode) anchor.after(section); else (doc.querySelector('main') || doc.body).append(section);

  const call = async (path, body) => {
    const r = await fetchImpl(api + path, body === undefined ? {cache: 'no-store'} : {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || 'The reply assistant failed.');
    return data;
  };
  const spec = () => ({theirMessage: theirs.value, recipientName: name.value, applicationStatus: statusChoice.value, ownerNote: note.value});

  estimate.addEventListener('click', async () => {
    estimate.disabled = true; aiLine.hidden = true; status.textContent = 'Estimating the cost (nothing is sent)…';
    try {
      const e = await call('/estimate', spec());
      if (!e.available) { status.textContent = e.message; return; }
      const model = e.models.find(m => m.id === e.model) || e.models[0];
      const cost = model ? `about $${Number(model.estimatedTokenCostUsd).toFixed(4)} with ${model.label}` : 'cost unknown';
      const go = el(doc, 'button', {type: 'button', text: 'Write reply with AI (paid, one request)'});
      aiLine.replaceChildren(el(doc, 'span', {text: `One request, ${cost}. It uses their message, your choices and ${e.evidenceCount} evidence line${e.evidenceCount === 1 ? '' : 's'}; no web search, no retry. `}), go);
      aiLine.hidden = false; status.textContent = '';
      go.addEventListener('click', async () => {
        go.disabled = true; status.textContent = 'Writing the reply (one paid request)…';
        try {
          const w = await call('/write', {...spec(), model: e.model, confirmedCostProof: e.costProof});
          fillEditor(doc, editor, w.reply); aiLine.hidden = true;
          status.textContent = 'Reply drafted. Read it, edit anything, then copy it.' + (w.unsupportedFigures.length ? ` Check these figures; they are not in your evidence: ${w.unsupportedFigures.join(', ')}.` : '') + (w.notes ? ' Note: ' + w.notes : '');
        } catch (error) { status.textContent = error.message; go.disabled = false; }
      });
    } catch (error) { status.textContent = error.message; } finally { estimate.disabled = false; }
  });

  copy.addEventListener('click', async () => {
    const plain = editorText(editor);
    if (!plain) { status.textContent = 'There is no reply to copy yet.'; return; }
    try {
      const Item = doc.defaultView?.ClipboardItem;
      if (Item && clipboard?.write) await clipboard.write([new Item({'text/html': new Blob([editor.innerHTML], {type: 'text/html'}), 'text/plain': new Blob([plain], {type: 'text/plain'})})]);
      else await clipboard.writeText(plain);
      status.textContent = 'Reply copied. Paste it into your Gmail reply.';
    } catch { status.textContent = 'Copy is blocked in this browser: select the reply and press Ctrl+C.'; }
  });

  let fetched = [];
  const useReply = r => { theirs.value = r.text; if (!name.value.trim() && r.fromName) name.value = String(r.fromName).trim().split(/\s+/)[0]; };
  replyChoice.addEventListener('change', () => { const r = fetched[Number(replyChoice.value)]; if (r) useReply(r); });
  fetchButton.addEventListener('click', async () => {
    fetchButton.disabled = true; status.textContent = 'Reading that Gmail thread (read-only)…';
    try {
      const d = await call('/fetch', {sentId: sentChoice.value});
      fetched = d.replies;
      if (!fetched.length) { replyChoice.hidden = true; status.textContent = 'No reply from them in that Gmail thread yet.'; return; }
      const latest = fetched.length - 1;
      replyChoice.replaceChildren(...fetched.map((r, i) => el(doc, 'option', {value: String(i), text: `${r.fromName || r.fromAddress} · ${r.date}`})));
      replyChoice.value = String(latest); replyChoice.hidden = fetched.length < 2; useReply(fetched[latest]);
      status.textContent = `Fetched ${fetched.length} ${fetched.length === 1 ? 'reply' : 'replies'} from ${fetched[latest].fromName || fetched[latest].fromAddress}; the latest is shown. Nothing in Gmail was changed.`;
    } catch (error) { status.textContent = error.message; } finally { fetchButton.disabled = false; }
  });
  call('').then(o => {
    const threads = (o.sentEmails || []).filter(x => x.hasThread);
    gmailBox.hidden = !o.gmailReadAvailable || !threads.length;
    sentChoice.replaceChildren(...threads.map(x => el(doc, 'option', {value: x.id, text: `${x.name ? x.name + ' · ' : ''}${x.email} · sent ${String(x.sentAt).slice(0, 10)}`})));
    statusChoice.replaceChildren(...Object.entries(o.statuses).map(([value, label]) => el(doc, 'option', {value, text: label})));
    intro.textContent = `Paste a recruiter's reply (for example "please apply online") to draft a polite answer that confirms your online application and explains why you also emailed. It uses only this application's evidence (${o.evidenceCount} line${o.evidenceCount === 1 ? '' : 's'}).${o.aiAvailable ? ' Drafting is paid, with a free estimate first.' : ' Drafting needs letter polishing switched on.'}`;
    estimate.hidden = !o.aiAvailable;
  }).catch(error => { intro.textContent = error.message; });
  return section;
}

if (typeof document !== 'undefined') {
  const start = () => attachReplyControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
