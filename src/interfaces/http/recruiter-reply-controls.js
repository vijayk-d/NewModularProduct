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
.recruiter-reply .reply-list{display:flex;flex-direction:column;gap:6px;margin:.5rem 0}
.recruiter-reply .reply-list-item{display:block;width:100%;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:.45rem .7rem;cursor:pointer;font:inherit;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.recruiter-reply .reply-list-item[aria-pressed="true"]{border-color:#2563eb;background:#eff6ff}
.recruiter-reply .reply-status-chip{display:inline-block;border-radius:999px;padding:0 .5rem;font-size:.8rem;background:#f1f5f9;color:#334155}
.recruiter-reply .reply-status-chip[data-reply-status-chip="drafted"]{background:#fef3c7;color:#92400e}
.recruiter-reply .reply-status-chip[data-reply-status-chip="in_gmail"]{background:#dcfce7;color:#166534}
.recruiter-reply .reply-snippet{color:#64748b}
.recruiter-reply .reply-topics-field{margin:.7rem 0 0}
.recruiter-reply .reply-topics-title{display:block;font-weight:500}
.recruiter-reply .reply-topics{display:grid;grid-template-columns:1fr 1fr;gap:2px 16px}
.recruiter-reply .reply-topic input[type=text]{display:block;width:calc(100% - 1.6rem);margin:.2rem 0 .35rem 1.6rem;box-sizing:border-box}
@media (max-width:700px){.recruiter-reply .reply-grid,.recruiter-reply .reply-topics{grid-template-columns:1fr}}`;

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
  // Their own address finds the exact conversation even when they replied from a different address than the one you emailed.
  const address = el(doc, 'input', {id: 'reply-their-address', type: 'text', inputmode: 'email', maxlength: '400', autocomplete: 'off', spellcheck: 'false', placeholder: 'name@company.com (several: separate with commas)', 'data-reply-address': ''});
  const addressField = field('Their email address (optional)', address);
  addressField.hidden = true;
  const ADDRESS_KEY = 'jobapp.replyAddress.' + reviewId;
  try { address.value = doc.defaultView?.localStorage?.getItem(ADDRESS_KEY) || ''; } catch {}
  address.addEventListener('change', () => { try { doc.defaultView?.localStorage?.setItem(ADDRESS_KEY, address.value.trim()); } catch {} });
  const findHint = el(doc, 'p', {class: 'reply-hint', 'data-reply-gmail': ''});
  // Every reply found for this application, newest first, each with its own saved draft and status.
  const repliesList = el(doc, 'div', {class: 'reply-list', role: 'list', 'aria-label': 'Replies found', 'data-reply-list': '', hidden: ''});
  const source = el(doc, 'span', {class: 'reply-source', 'data-reply-source': '', hidden: ''});
  const theirs = el(doc, 'textarea', {id: 'reply-their-message', rows: '7', placeholder: 'Their reply appears here when found in Gmail, or paste it'});
  const step1 = el(doc, 'fieldset', {class: 'reply-step'}, [el(doc, 'legend', {text: '1. Their reply'}), addressField, el(doc, 'div', {class: 'reply-actions'}, [find]), findHint, repliesList, source, field('Their reply', theirs)]);

  // Step 2: your answer.
  const name = el(doc, 'input', {id: 'reply-recipient-name', type: 'text', maxlength: '80', autocomplete: 'off'});
  const statusChoice = el(doc, 'select', {id: 'reply-application-status'});
  const note = el(doc, 'textarea', {id: 'reply-owner-note', rows: '3', maxlength: '2000', placeholder: 'Say it in your own words, for example: My salary expectation is £80,000 base and I am flexible for the right role. The reply keeps your meaning and every fact.'});
  // What they asked: ticked for you from their reply. Your answers are remembered in this browser for the next reply.
  const topicsBox = el(doc, 'div', {class: 'reply-topics', 'data-reply-topics': ''});
  const topicsHint = el(doc, 'p', {class: 'reply-hint', 'data-reply-topics-found': ''});
  const topicsField = el(doc, 'div', {class: 'reply-topics-field', role: 'group', 'aria-label': 'What they asked about'}, [el(doc, 'span', {class: 'reply-topics-title', text: 'What they asked about'}), topicsHint, topicsBox]);
  const step2 = el(doc, 'fieldset', {class: 'reply-step'}, [el(doc, 'legend', {text: '2. Your answer'}),
    el(doc, 'div', {class: 'reply-grid'}, [field('Their first name (optional)', name), field('Your online application', statusChoice)]), topicsField, field('Your own message (optional)', note)]);
  let topicRows = [];
  const answerKey = id => 'jobapp.replyAnswer.' + id;
  function buildTopics(list) {
    topicRows = (list || []).map(t => {
      const box = el(doc, 'input', {type: 'checkbox', 'data-topic': t.id});
      const row = el(doc, 'div', {class: 'reply-topic', 'data-reply-topic': t.id}, [el(doc, 'label', {}, [box, doc.createTextNode(' ' + t.label)])]);
      let answer = null;
      if (t.answer) {
        answer = el(doc, 'input', {type: 'text', maxlength: '300', autocomplete: 'off', 'aria-label': t.answer, placeholder: t.answer, 'data-topic-answer': t.id, hidden: ''});
        try { answer.value = doc.defaultView?.localStorage?.getItem(answerKey(t.id)) || ''; } catch {}
        answer.addEventListener('change', () => { try { doc.defaultView?.localStorage?.setItem(answerKey(t.id), answer.value.trim()); } catch {} });
        row.append(answer);
      }
      box.addEventListener('change', () => { if (answer) { answer.hidden = !box.checked; if (box.checked && !answer.value) answer.focus(); } });
      return {t, box, answer, row};
    });
    topicsBox.replaceChildren(...topicRows.map(r => r.row));
  }
  // Ticks the topics found in their reply (free, on this computer). The online-application choice moves to
  // "Not part of this reply" when they asked about something else and not about applying.
  let detectSeq = 0, detectTimer = null;
  async function detect(keepStatus = false) {
    const seq = ++detectSeq, message = theirs.value;
    if (!topicRows.length) return;
    if (message.trim().length < 20) { topicsHint.textContent = ''; return; }
    try {
      const d = await call('/topics', {theirMessage: message});
      if (seq !== detectSeq) return;
      for (const r of topicRows) { r.box.checked = d.topics.includes(r.t.id); if (r.answer) r.answer.hidden = !r.box.checked; }
      const labels = topicRows.filter(r => r.box.checked).map(r => r.t.label);
      topicsHint.textContent = labels.length ? `Found in their reply: ${labels.join(', ')}. Untick anything wrong, tick anything missed, and give your answers.`
        : 'Nothing specific found in their reply. Tick what they asked about, or write your own message below.';
      if (!keepStatus && labels.length && !d.topics.includes('apply-online') && statusChoice.querySelector('option[value="none"]')) statusChoice.value = 'none';
    } catch { topicsHint.textContent = ''; }
  }
  const patternsLine = el(doc, 'p', {class: 'reply-hint', 'data-reply-patterns': '', hidden: ''});

  // Step 3: draft, then the suggested reply.
  const estimate = el(doc, 'button', {type: 'button', text: 'Estimate: draft a reply with AI'});
  const aiLine = el(doc, 'div', {class: 'reply-actions', hidden: '', 'data-reply-ai': ''});
  const editor = el(doc, 'div', {id: 'reply-editor', class: 'reply-editor', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Suggested reply (editable)'});
  const copy = el(doc, 'button', {type: 'button', text: 'Copy reply'});
  const save = el(doc, 'button', {type: 'button', text: 'Save reply', hidden: ''});
  const gmailDraft = el(doc, 'button', {type: 'button', text: 'Create Gmail draft', hidden: '', 'data-reply-gmail-draft': ''});
  const draftHint = el(doc, 'p', {class: 'reply-hint', 'data-reply-draft-hint': ''});
  const result = el(doc, 'div', {class: 'reply-result', hidden: '', 'data-reply-result': ''}, [el(doc, 'h3', {text: 'Suggested reply'}),
    el(doc, 'p', {class: 'reply-hint', text: 'Edit it here if you like. Create a Gmail draft in their conversation, or copy it. Nothing is sent from this page.'}), editor, el(doc, 'div', {class: 'reply-actions'}, [gmailDraft, save, copy]), draftHint]);
  const status = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-reply-status': ''});
  const step3 = el(doc, 'fieldset', {class: 'reply-step'}, [el(doc, 'legend', {text: '3. Draft'}), el(doc, 'div', {class: 'reply-actions'}, [estimate]), aiLine, status, result]);

  const OPEN_KEY = 'jobapp.replyOpen';
  try { panel.open = doc.defaultView?.localStorage?.getItem(OPEN_KEY) === 'true'; } catch {}
  panel.addEventListener('toggle', () => { try { doc.defaultView?.localStorage?.setItem(OPEN_KEY, String(panel.open)); } catch {} });
  panel.append(el(doc, 'summary', {}, [el(doc, 'h2', {id: 'recruiter-reply-title', text: 'Reply assistant'})]), intro, patternsLine, step1, step2, step3);
  section.append(panel);
  const anchor = doc.getElementById('application-questions') || doc.getElementById('tailored-cv') || doc.querySelector('.panel--decision');
  if (anchor?.parentNode) anchor.after(section); else (doc.querySelector('main') || doc.body).append(section);

  const call = async (path, body) => {
    const r = await fetchImpl(api + path, body === undefined ? {cache: 'no-store'} : {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || 'The reply assistant failed.');
    return data;
  };
  // A reply updates the application's Outcome (forward only); the Outcome section refreshes itself.
  const outcomeText = o => o ? ` Outcome updated: ${o.label}.` : '';
  const outcomeChanged = o => { if (o) doc.dispatchEvent(new (doc.defaultView?.CustomEvent || CustomEvent)('application-outcome-changed', {detail: o})); };
  const spec = () => ({messageId: selected || undefined, theirMessage: theirs.value, recipientName: name.value, applicationStatus: statusChoice.value, ownerNote: note.value,
    topics: topicRows.filter(r => r.box.checked).map(r => ({id: r.t.id, answer: r.answer ? r.answer.value : ''}))});
  const shortDate = value => { const t = Date.parse(value); return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : String(value || ''); };

  // Replies kept with this application: newest first. Choosing one fills their reply, their name and its saved draft.
  let found = [], selected = null, canDraft = false, searchable = false;
  const STATUS_LABEL = {new: 'New', drafted: 'Reply drafted', in_gmail: 'In Gmail drafts'};
  const syncDraftButtons = () => {
    const item = found.find(r => r.messageId === selected);
    save.hidden = !item;
    gmailDraft.hidden = !item || !canDraft;
    gmailDraft.textContent = item?.gmailDraftId ? 'Update Gmail draft' : 'Create Gmail draft';
    draftHint.textContent = item ? '' : found.length ? 'Choose one of their replies above to save this reply with it or draft it in Gmail.' : '';
  };
  function renderList() {
    repliesList.hidden = !found.length;
    repliesList.replaceChildren(...found.map(r => {
      const b = el(doc, 'button', {type: 'button', role: 'listitem', class: 'reply-list-item', 'data-message-id': r.messageId, 'aria-pressed': String(r.messageId === selected)},
        [el(doc, 'strong', {text: r.fromName || r.fromAddress}), el(doc, 'span', {text: ' · ' + shortDate(r.date) + ' · '}),
          el(doc, 'span', {class: 'reply-status-chip', 'data-reply-status-chip': r.status || 'new', text: STATUS_LABEL[r.status] || 'New'}),
          el(doc, 'span', {class: 'reply-snippet', text: ' ' + String(r.text || '').replace(/\s+/g, ' ').slice(0, 90)})]);
      b.addEventListener('click', () => useReply(r));
      return b;
    }));
  }
  const useReply = r => {
    selected = r.messageId || null;
    theirs.value = r.text;
    name.value = r.recipientName || (r.fromName ? String(r.fromName).trim().split(/\s+/)[0] : name.value);
    if (r.applicationStatus) statusChoice.value = r.applicationStatus;
    note.value = r.ownerNote || '';
    source.textContent = `From Gmail: ${r.fromName || r.fromAddress}, ${shortDate(r.date)}`; source.hidden = false;
    if (r.draftText) { fillEditor(doc, editor, r.draftText); result.hidden = false; status.textContent = 'Your saved reply to this message is shown below.'; }
    else { editor.replaceChildren(); result.hidden = true; status.textContent = ''; }
    renderList(); syncDraftButtons();
    detect(Boolean(r.applicationStatus));
  };
  const remember = item => { found = found.map(r => r.messageId === item.messageId ? item : r); renderList(); syncDraftButtons(); };
  theirs.addEventListener('input', () => {
    source.hidden = true; selected = null; renderList(); syncDraftButtons();
    clearTimeout(detectTimer); detectTimer = setTimeout(() => detect(false), 400);
  });
  // Opening the Reply assistant looks in Gmail by itself once per page (read-only and free); the button searches again.
  let autoTried = false, overviewLoaded = false;
  const autoFind = () => {
    if (autoTried || !overviewLoaded || !panel.open || find.hidden || find.disabled || (!searchable && !address.value.trim())) return;
    autoTried = true; findReplies(true);
  };
  panel.addEventListener('toggle', autoFind);
  find.addEventListener('click', () => findReplies(false));
  async function findReplies(auto) {
    const typed = address.value.trim();
    if (!typed && !searchable) { findHint.textContent = 'Enter their email address above first, then find their reply.'; address.focus(); return; }
    find.disabled = true; findHint.textContent = auto ? 'Looking in Gmail for their reply automatically (read-only)…' : 'Looking in Gmail (read-only)…';
    try {
      const d = await call('/fetch', typed ? {theirEmail: typed} : {});
      try { doc.defaultView?.localStorage?.setItem(ADDRESS_KEY, typed); } catch {}
      found = d.replies;
      if (!found.length) { renderList(); findHint.textContent = 'No reply from them found in Gmail yet. You can paste it below.'; return; }
      useReply(found[0]);
      findHint.textContent = `Found ${found.length} ${found.length === 1 ? 'reply' : 'replies'}${found.length > 1 ? '; the latest is selected. Choose another to answer it' : ''}. Nothing in Gmail was changed.${outcomeText(d.outcome)}`;
      outcomeChanged(d.outcome);
    } catch (error) { findHint.textContent = error.message; } finally { find.disabled = false; }
  }
  const draftBody = () => ({messageId: selected, draftText: editorText(editor), draftHtml: editor.innerHTML, recipientName: name.value, applicationStatus: statusChoice.value, ownerNote: note.value});
  async function saveSelected(quiet = false) {
    if (!selected || !editorText(editor)) return null;
    const d = await call('/save', draftBody());
    remember(d.reply);
    if (!quiet) status.textContent = 'Reply saved with their message.';
    return d.reply;
  }
  save.addEventListener('click', async () => { try { await saveSelected(); } catch (error) { status.textContent = error.message; } });
  gmailDraft.addEventListener('click', async () => {
    if (!selected) return;
    gmailDraft.disabled = true; status.textContent = 'Creating the draft in your Gmail (nothing is sent)…';
    try {
      const d = await call('/gmail-draft', {messageId: selected, bodyPlainText: editorText(editor), bodyHtml: editor.innerHTML});
      remember(d.reply);
      status.replaceChildren(doc.createTextNode(`${d.updated ? 'Gmail draft updated' : 'Gmail draft created'} in their conversation (${d.subject}).${d.signed ? ' Your Gmail signature was added.' : ''}${d.linksTracked ? ' Advert and profile links are click-tracked, with the footnote.' : ''} Review and send it from Gmail. `),
        el(doc, 'a', {href: d.gmailDraftsUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Open Gmail drafts'}));
    } catch (error) { status.textContent = error.message; } finally { gmailDraft.disabled = false; }
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
          const writing = call('/write', {...spec(), model: e.model, confirmedCostProof: e.costProof});
          try { doc.dispatchEvent(new (doc.defaultView?.CustomEvent || CustomEvent)('nmp-activity-started')); } catch {}
          const w = await writing;
          fillEditor(doc, editor, w.reply); aiLine.hidden = true; result.hidden = false;
          try { await saveSelected(true); } catch { /* the reply stays on the page; Save reply can try again */ }
          status.textContent = 'Reply drafted. Read it, edit anything, then copy it.' + (w.unsupportedFigures.length ? ` Check these figures; they are not in your evidence: ${w.unsupportedFigures.join(', ')}.` : '') + (w.notes ? ' Note: ' + w.notes : '') + outcomeText(w.outcome);
          outcomeChanged(w.outcome);
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
    buildTopics(o.topics);
    const p = o.patterns || {total: 0, topics: []};
    patternsLine.hidden = !p.total;
    patternsLine.textContent = p.total ? `What recruiters have said in your ${p.total} saved repl${p.total === 1 ? 'y' : 'ies'} so far: ${p.topics.length ? p.topics.map(t => `${t.label} (${t.count})`).join(' · ') : 'nothing that matches a topic yet'}.` : '';
    intro.textContent = `Draft a polite answer to a recruiter's reply: whether they ask you to apply online, ask about salary, notice or a call, or say the role has moved on. Tick what they asked, give your answers, or write your own message. It uses only this application's evidence (${o.evidenceCount} line${o.evidenceCount === 1 ? '' : 's'}).${o.aiAvailable ? ' Drafting is paid, with a free estimate first.' : ' Drafting needs letter polishing switched on.'}`;
    estimate.hidden = !o.aiAvailable;
    canDraft = o.gmailDraftAvailable === true;
    found = o.savedReplies || [];
    if (found.length) { renderList(); syncDraftButtons(); }
    searchable = o.sentCount + o.contactCount > 0;
    find.hidden = !o.gmailReadAvailable;
    addressField.hidden = !o.gmailReadAvailable;
    const known = (o.contactAddresses || []).slice(0, 3).join(', ') + ((o.contactAddresses || []).length > 3 ? ` and ${o.contactAddresses.length - 3} more` : '');
    findHint.textContent = !o.gmailReadAvailable ? 'Finding replies in Gmail is off in this app (Gmail is switched off). Paste their reply below.'
      : !searchable ? 'This application has no sent email or contact address yet. Enter the address they replied from, then find their reply; or paste it below.'
      : `Looks in the Gmail threads of the ${o.sentCount} email${o.sentCount === 1 ? '' : 's'} sent for this application and at recent messages from ${known || 'its contacts'}. Add their address above if they replied from another one.`;
    overviewLoaded = true; autoFind();
  }).catch(error => { intro.textContent = error.message; });
  return section;
}

if (typeof document !== 'undefined') {
  const start = () => attachReplyControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
