// Reply assistant on the review page: get a recruiter's reply (found in Gmail, read-only, or pasted), then draft a polite,
// evidence-led answer to copy into Gmail. Nothing is sent from here. Drafting is optional and paid: estimate first.
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

const STYLE = `.recruiter-reply .reply-step{border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px 14px;margin:12px 0}
.recruiter-reply .reply-step legend{font-weight:600;padding:0 6px}
.recruiter-reply .reply-field{display:block;margin:.55rem 0 0}
.recruiter-reply .reply-field>span{display:block;font-weight:500;margin:0 0 .25rem}
.recruiter-reply .reply-field textarea,.recruiter-reply .reply-field input,.recruiter-reply .reply-field select{display:block;width:100%;box-sizing:border-box}
.recruiter-reply .reply-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.recruiter-reply .reply-hint{color:#475569;font-size:.92rem;margin:.35rem 0}
.recruiter-reply .reply-source{display:inline-block;background:#eff6ff;color:#1e40af;border-radius:6px;padding:.15rem .5rem;font-size:.9rem;margin:.35rem 0 0}
.recruiter-reply .reply-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:.6rem 0 0}
.recruiter-reply .reply-editor{min-height:8rem;border:1px solid #cbd5e1;border-radius:6px;padding:.6rem .8rem;background:#fff}
.recruiter-reply [hidden]{display:none!important}
@media (max-width:700px){.recruiter-reply .reply-grid{grid-template-columns:1fr}}`;

export function attachReplyControls(doc = document, fetchImpl = fetch, clipboard = globalThis.navigator?.clipboard) {
  const reviewId = doc.querySelector('input[name="reviewId"]')?.value;
  if (!reviewId || doc.getElementById('recruiter-reply')) return null;
  const api = '/api/reviews/' + encodeURIComponent(reviewId) + '/reply';
  if (!doc.getElementById('recruiter-reply-style')) doc.head?.append(el(doc, 'style', {id: 'recruiter-reply-style', text: STYLE}));
  const field = (label, control) => el(doc, 'label', {class: 'reply-field'}, [el(doc, 'span', {text: label}), control]);

  const section = el(doc, 'section', {class: 'review-section recruiter-reply', id: 'recruiter-reply', 'aria-labelledby': 'recruiter-reply-title'});
  const panel = el(doc, 'details', {class: 'questions-panel'});
  const intro = el(doc, 'p', {class: 'reply-hint', 'data-reply-intro': '', text: 'Loading…'});

  // Step 1: their reply.
  const find = el(doc, 'button', {type: 'button', text: 'Find their reply in Gmail (read-only)', hidden: ''});
  const findHint = el(doc, 'p', {class: 'reply-hint', 'data-reply-gmail': ''});
  const replyChoice = el(doc, 'select', {id: 'reply-choice'});
  const choiceField = field('Replies found', replyChoice); choiceField.hidden = true;
  const source = el(doc, 'span', {class: 'reply-source', 'data-reply-source': '', hidden: ''});
  const theirs = el(doc, 'textarea', {id: 'reply-their-message', rows: '7', placeholder: 'Their reply appears here when found in Gmail, or paste it'});
  const step1 = el(doc, 'fieldset', {class: 'reply-step'}, [el(doc, 'legend', {text: '1. Their reply'}), el(doc, 'div', {class: 'reply-actions'}, [find]), findHint, choiceField, source, field('Their reply', theirs)]);

  // Step 2: your answer.
  const name = el(doc, 'input', {id: 'reply-recipient-name', type: 'text', maxlength: '80', autocomplete: 'off'});
  const statusChoice = el(doc, 'select', {id: 'reply-application-status'});
  const note = el(doc, 'textarea', {id: 'reply-owner-note', rows: '2', placeholder: 'For example the date you applied, or a question they asked'});
  const step2 = el(doc, 'fieldset', {class: 'reply-step'}, [el(doc, 'legend', {text: '2. Your answer'}),
    el(doc, 'div', {class: 'reply-grid'}, [field('Their first name (optional)', name), field('Your online application', statusChoice)]), field('Anything to add (optional)', note)]);

  // Step 3: draft, then the suggested reply.
  const estimate = el(doc, 'button', {type: 'button', text: 'Estimate: draft a reply with AI'});
  const aiLine = el(doc, 'div', {class: 'reply-actions', hidden: '', 'data-reply-ai': ''});
  const editor = el(doc, 'div', {id: 'reply-editor', class: 'reply-editor', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Suggested reply (editable)'});
  const copy = el(doc, 'button', {type: 'button', text: 'Copy reply'});
  const result = el(doc, 'div', {class: 'reply-result', hidden: '', 'data-reply-result': ''}, [el(doc, 'h3', {text: 'Suggested reply'}),
    el(doc, 'p', {class: 'reply-hint', text: 'Edit it here if you like, then copy it into your Gmail reply. Nothing is sent from this page.'}), editor, el(doc, 'div', {class: 'reply-actions'}, [copy])]);
  const status = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-reply-status': ''});
  const step3 = el(doc, 'fieldset', {class: 'reply-step'}, [el(doc, 'legend', {text: '3. Draft'}), el(doc, 'div', {class: 'reply-actions'}, [estimate]), aiLine, status, result]);

  const OPEN_KEY = 'jobapp.replyOpen';
  try { panel.open = doc.defaultView?.localStorage?.getItem(OPEN_KEY) === 'true'; } catch {}
  panel.addEventListener('toggle', () => { try { doc.defaultView?.localStorage?.setItem(OPEN_KEY, String(panel.open)); } catch {} });
  panel.append(el(doc, 'summary', {}, [el(doc, 'h2', {id: 'recruiter-reply-title', text: 'Reply assistant'})]), intro, step1, step2, step3);
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
  const shortDate = value => { const t = Date.parse(value); return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : String(value || ''); };

  // Found replies: newest first; choosing one fills their reply and their first name.
  let found = [];
  const useReply = r => {
    theirs.value = r.text;
    if (r.fromName) name.value = String(r.fromName).trim().split(/\s+/)[0];
    source.textContent = `From Gmail: ${r.fromName || r.fromAddress}, ${shortDate(r.date)}`; source.hidden = false;
  };
  replyChoice.addEventListener('change', () => { const r = found[Number(replyChoice.value)]; if (r) useReply(r); });
  theirs.addEventListener('input', () => { source.hidden = true; });
  find.addEventListener('click', async () => {
    find.disabled = true; findHint.textContent = 'Looking in Gmail (read-only)…';
    try {
      const d = await call('/fetch', {});
      found = d.replies;
      if (!found.length) { choiceField.hidden = true; findHint.textContent = 'No reply from them found in Gmail yet. You can paste it below.'; return; }
      replyChoice.replaceChildren(...found.map((r, i) => el(doc, 'option', {value: String(i), text: `${r.fromName || r.fromAddress} · ${shortDate(r.date)} · ${r.text.replace(/\s+/g, ' ').slice(0, 60)}`})));
      replyChoice.value = '0'; choiceField.hidden = found.length < 2; useReply(found[0]);
      findHint.textContent = `Found ${found.length} ${found.length === 1 ? 'reply' : 'replies'}${found.length > 1 ? '; the latest is shown, choose another below' : ''}. Nothing in Gmail was changed.`;
    } catch (error) { findHint.textContent = error.message; } finally { find.disabled = false; }
  });

  estimate.addEventListener('click', async () => {
    estimate.disabled = true; aiLine.hidden = true; status.textContent = 'Estimating the cost (nothing is sent)…';
    try {
      const e = await call('/estimate', spec());
      if (!e.available) { status.textContent = e.message; return; }
      const model = e.models.find(m => m.id === e.model) || e.models[0];
      const cost = model ? `about $${Number(model.estimatedTokenCostUsd).toFixed(4)} with ${model.label}` : 'cost unknown';
      const go = el(doc, 'button', {type: 'button', text: 'Write reply with AI (paid, one request)'});
      aiLine.replaceChildren(el(doc, 'span', {text: `One request, ${cost}. It uses their message, your choices and ${e.evidenceCount} evidence line${e.evidenceCount === 1 ? '' : 's'}; no web search, no retry.`}), go);
      aiLine.hidden = false; status.textContent = '';
      go.addEventListener('click', async () => {
        go.disabled = true; status.textContent = 'Writing the reply (one paid request)…';
        try {
          const w = await call('/write', {...spec(), model: e.model, confirmedCostProof: e.costProof});
          fillEditor(doc, editor, w.reply); aiLine.hidden = true; result.hidden = false;
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

  call('').then(o => {
    statusChoice.replaceChildren(...Object.entries(o.statuses).map(([value, label]) => el(doc, 'option', {value, text: label})));
    intro.textContent = `Draft a polite answer to a recruiter's reply (for example "please apply online") that confirms your online application and explains why you also emailed. It uses only this application's evidence (${o.evidenceCount} line${o.evidenceCount === 1 ? '' : 's'}).${o.aiAvailable ? ' Drafting is paid, with a free estimate first.' : ' Drafting needs letter polishing switched on.'}`;
    estimate.hidden = !o.aiAvailable;
    const searchable = o.sentCount + o.contactCount > 0;
    find.hidden = !o.gmailReadAvailable || !searchable;
    findHint.textContent = !o.gmailReadAvailable ? 'Finding replies in Gmail is off in this app (Gmail is switched off). Paste their reply below.'
      : !searchable ? 'This application has no sent email or contact address yet, so there is nothing to look for in Gmail. Paste their reply below.'
      : `Looks in the Gmail threads of the ${o.sentCount} email${o.sentCount === 1 ? '' : 's'} sent for this application and at recent messages from its ${o.contactCount} contact${o.contactCount === 1 ? '' : 's'}.`;
  }).catch(error => { intro.textContent = error.message; });
  return section;
}

if (typeof document !== 'undefined') {
  const start = () => attachReplyControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
