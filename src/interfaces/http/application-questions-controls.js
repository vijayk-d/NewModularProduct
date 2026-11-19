// Application questions section on the review page: answer a portal question within an exact limit, from this application's evidence.
const el = (doc, tag, props = {}, children = []) => {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'text') node.textContent = v; else if (k === 'class') node.className = v; else node.setAttribute(k, v); }
  for (const c of children) node.append(c);
  return node;
};
// Same counting as the server: words between spaces; characters including spaces.
export const countWords = t => (String(t || '').trim().match(/\S+/g) || []).length;
export const countCharacters = t => String(t || '').replace(/\r\n/g, '\n').trim().length;
export const countFor = (t, unit) => unit === 'characters' ? countCharacters(t) : countWords(t);
export function trimToLimit(answer, unit, limit) {
  const sentences = String(answer || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [];
  let out = '';
  for (const s of sentences) { const next = (out + ' ' + s.trim()).trim(); if (countFor(next, unit) > limit) break; out = next; }
  return out;
}

export function attachQuestionControls(doc = document, fetchImpl = fetch, clipboard = globalThis.navigator?.clipboard) {
  const reviewId = doc.querySelector('input[name="reviewId"]')?.value;
  if (!reviewId || doc.getElementById('application-questions')) return null;
  const api = '/api/reviews/' + encodeURIComponent(reviewId) + '/questions';
  const section = el(doc, 'section', {class: 'review-section application-questions', id: 'application-questions', 'aria-labelledby': 'application-questions-title'});
  const intro = el(doc, 'p', {class: 'questions-note', 'data-questions-evidence': '', text: 'Loading your evidence…'});
  const question = el(doc, 'textarea', {id: 'question-text', rows: '3', placeholder: 'Paste the question from the application form'});
  const limit = el(doc, 'input', {id: 'question-limit', type: 'number', min: '10', max: '10000', step: '1', value: '250'});
  const unit = el(doc, 'select', {id: 'question-unit'}, [el(doc, 'option', {value: 'words', text: 'words'}), el(doc, 'option', {value: 'characters', text: 'characters (including spaces)'})]);
  const draftButton = el(doc, 'button', {type: 'button', text: 'Draft from evidence (free)'});
  const estimateButton = el(doc, 'button', {type: 'button', text: 'Estimate: write with AI'});
  const aiLine = el(doc, 'div', {class: 'questions-ai', hidden: '', 'data-questions-ai': ''});
  const answer = el(doc, 'textarea', {id: 'question-answer', rows: '9'});
  const counter = el(doc, 'p', {'data-answer-count': '', 'aria-live': 'polite'});
  const trim = el(doc, 'button', {type: 'button', text: 'Trim to the limit', hidden: ''});
  const checkButton = el(doc, 'button', {type: 'button', text: 'Check figures'});
  const copy = el(doc, 'button', {type: 'button', text: 'Copy answer'});
  const save = el(doc, 'button', {type: 'button', text: 'Save answer'});
  const status = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-questions-status': ''});
  const savedList = el(doc, 'div', {'data-questions-saved': ''});
  // Collapsible: starts closed; this browser remembers whether you left it open.
  const savedCount = el(doc, 'span', {class: 'questions-saved-count', 'data-questions-saved-count': ''});
  const panel = el(doc, 'details', {class: 'questions-panel'});
  const OPEN_KEY = 'jobapp.questionsOpen';
  try { panel.open = doc.defaultView?.localStorage?.getItem(OPEN_KEY) === 'true'; } catch {}
  panel.addEventListener('toggle', () => { try { doc.defaultView?.localStorage?.setItem(OPEN_KEY, String(panel.open)); } catch {} });
  section.append(panel);
  panel.append(el(doc, 'summary', {}, [el(doc, 'h2', {id: 'application-questions-title', text: 'Application questions'}), savedCount]), intro,
    el(doc, 'label', {for: question.id, text: 'Question from the form'}), question,
    el(doc, 'div', {class: 'questions-limit'}, [el(doc, 'label', {for: limit.id, text: 'Limit'}), limit, el(doc, 'label', {for: unit.id, class: 'visually-hidden', text: 'Limit unit'}), unit]),
    el(doc, 'div', {class: 'actions'}, [draftButton, estimateButton]), aiLine,
    el(doc, 'label', {for: answer.id, text: 'Your answer'}), answer, counter,
    el(doc, 'div', {class: 'actions'}, [trim, checkButton, copy, save]), status, savedList);
  const anchor = doc.getElementById('tailored-cv') || doc.querySelector('.panel--decision') || doc.getElementById('email-domain-resolution');
  if (anchor?.parentNode) anchor.after(section); else (doc.querySelector('main') || doc.body).append(section);

  let origin = 'edited';
  const spec = () => ({question: question.value, unit: unit.value, limit: Number(limit.value)});
  const call = async (path, body) => {
    const r = await fetchImpl(api + path, body === undefined ? {cache: 'no-store'} : {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || 'The questions helper failed.');
    return data;
  };
  function recount() {
    const used = countFor(answer.value, unit.value), max = Number(limit.value) || 0, over = max && used > max;
    counter.textContent = `${used} / ${max} ${unit.value}${over ? ` — ${used - max} over the limit` : max ? ` — ${max - used} left` : ''} (${countWords(answer.value)} words, ${countCharacters(answer.value)} characters)`;
    counter.dataset.over = String(Boolean(over));
    trim.hidden = !over;
  }
  const figures = c => c.unsupportedFigures?.length ? ` Check these figures; they are not in your evidence: ${c.unsupportedFigures.join(', ')}.` : '';
  [answer, limit, unit].forEach(x => x.addEventListener('input', () => { if (x === answer) origin = 'edited'; recount(); }));
  unit.addEventListener('change', recount);

  draftButton.addEventListener('click', async () => {
    draftButton.disabled = true; status.textContent = 'Choosing the best evidence for this question…';
    try {
      const d = await call('/draft', spec());
      answer.value = d.answer; origin = 'evidence'; recount();
      status.textContent = d.answer ? `Drafted from ${d.used.length} evidence line${d.used.length === 1 ? '' : 's'}. Edit it into your own words before saving.${figures(d.check)}`
        : 'No evidence line fits this question within the limit. Try a larger limit, or write the answer yourself.';
    } catch (error) { status.textContent = error.message; } finally { draftButton.disabled = false; }
  });

  estimateButton.addEventListener('click', async () => {
    estimateButton.disabled = true; aiLine.hidden = true; status.textContent = 'Estimating the cost (nothing is sent)…';
    try {
      const e = await call('/estimate', {...spec(), currentDraft: answer.value});
      aiLine.replaceChildren();
      const model = e.models.find(m => m.id === e.model) || e.models[0];
      const cost = model ? `about $${Number(model.estimatedTokenCostUsd).toFixed(4)} with ${model.label}` : 'cost unknown';
      if (!e.available) { status.textContent = e.message; return; }
      const go = el(doc, 'button', {type: 'button', text: 'Write with AI (paid, one request)'});
      aiLine.append(el(doc, 'span', {text: `One request, ${cost}. It uses only your evidence lines and the question; no web search, no retry. `}), go);
      aiLine.hidden = false; status.textContent = '';
      go.addEventListener('click', async () => {
        go.disabled = true; status.textContent = 'Writing the answer (one paid request)…';
        try {
          const w = await call('/write', {...spec(), currentDraft: answer.value, model: e.model, confirmedCostProof: e.costProof});
          answer.value = w.answer; origin = 'ai'; recount(); aiLine.hidden = true;
          status.textContent = `Written with AI.${w.check.within ? '' : ' It is over the limit: edit it, or use Trim to the limit.'}${figures(w.check)}${w.notes ? ' Note: ' + w.notes : ''}`;
        } catch (error) { status.textContent = error.message; go.disabled = false; }
      });
    } catch (error) { status.textContent = error.message; } finally { estimateButton.disabled = false; }
  });

  trim.addEventListener('click', () => { answer.value = trimToLimit(answer.value, unit.value, Number(limit.value)); origin = 'edited'; recount(); status.textContent = 'Shortened to the limit at a sentence boundary.'; });
  checkButton.addEventListener('click', async () => {
    try { const c = await call('/check', {...spec(), answer: answer.value}); status.textContent = c.unsupportedFigures.length ? figures(c).trim() : 'All figures appear in your evidence.'; }
    catch (error) { status.textContent = error.message; }
  });
  copy.addEventListener('click', async () => { try { await clipboard.writeText(answer.value); status.textContent = 'Answer copied.'; } catch { answer.select(); status.textContent = 'Select-all done; press Ctrl+C to copy.'; } });
  save.addEventListener('click', async () => {
    save.disabled = true;
    try { await call('/save', {...spec(), answer: answer.value, origin}); await refresh(); status.textContent = 'Answer saved with this application.'; }
    catch (error) { status.textContent = error.message; } finally { save.disabled = false; }
  });

  function renderSaved(saved) {
    savedCount.textContent = saved.length ? `${saved.length} saved answer${saved.length === 1 ? '' : 's'}` : '';
    savedList.replaceChildren();
    if (!saved.length) return;
    savedList.append(el(doc, 'h3', {text: 'Saved answers'}));
    for (const s of saved) {
      const c = el(doc, 'button', {type: 'button', text: 'Copy'}), r = el(doc, 'button', {type: 'button', text: 'Remove'}), use = el(doc, 'button', {type: 'button', text: 'Edit again'});
      c.addEventListener('click', async () => { try { await clipboard.writeText(s.answer); status.textContent = 'Saved answer copied.'; } catch { status.textContent = 'Copy is blocked in this browser.'; } });
      use.addEventListener('click', () => { question.value = s.question; limit.value = String(s.limit); unit.value = s.unit; answer.value = s.answer; origin = 'edited'; recount(); answer.focus(); });
      r.addEventListener('click', async () => {
        if (r.dataset.armed !== 'true') { r.dataset.armed = 'true'; r.textContent = 'Click again to remove'; return; }
        try { renderSaved((await call('/' + s.id + '/remove', {})).saved); status.textContent = 'Saved answer removed.'; } catch (error) { status.textContent = error.message; }
      });
      savedList.append(el(doc, 'details', {'data-saved-answer': String(s.id)}, [
        el(doc, 'summary', {text: `${s.question.slice(0, 110)}${s.question.length > 110 ? '…' : ''} (${countFor(s.answer, s.unit)} / ${s.limit} ${s.unit})`}),
        el(doc, 'p', {class: 'saved-answer', text: s.answer}), el(doc, 'div', {class: 'actions'}, [c, use, r])]));
    }
  }
  async function refresh() {
    const o = await call('');
    intro.textContent = o.evidenceCount ? `Answers use only this application's evidence: ${o.evidenceCount} line${o.evidenceCount === 1 ? '' : 's'} from ${o.sources.join(', ')}. The draft is free and local.${o.aiAvailable ? ' Writing with AI is optional and paid, with an estimate first.' : ''}`
      : 'No evidence yet: select achievements for this application, build a tailored CV, or choose approved scenarios for polishing.';
    estimateButton.hidden = !o.aiAvailable;
    renderSaved(o.saved);
  }
  recount();
  refresh().catch(error => { intro.textContent = error.message; });
  return section;
}

if (typeof document !== 'undefined') {
  const start = () => attachQuestionControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
