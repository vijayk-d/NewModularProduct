// Outcome section on the review page: what happened after applying. Recorded by you; nothing is sent or inferred.
const el = (doc, tag, props = {}, children = []) => {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'text') node.textContent = v; else if (k === 'class') node.className = v; else node.setAttribute(k, v); }
  for (const c of children) node.append(c);
  return node;
};
export const localToday = (now = new Date()) => new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const shortDate = iso => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}); };

export function attachOutcomeControls(doc = document, fetchImpl = fetch) {
  const reviewId = doc.querySelector('input[name="reviewId"]')?.value;
  if (!reviewId || doc.getElementById('application-outcome')) return null;
  const api = '/api/reviews/' + encodeURIComponent(reviewId) + '/outcomes';
  const section = el(doc, 'section', {class: 'review-section application-outcome', id: 'application-outcome', 'aria-labelledby': 'application-outcome-title'});
  const current = el(doc, 'p', {'data-outcome-current': '', role: 'status', 'aria-live': 'polite', text: 'Loading…'});
  const select = el(doc, 'select', {id: 'outcome-choice'});
  const date = el(doc, 'input', {id: 'outcome-date', type: 'date', max: localToday(), value: localToday()});
  const note = el(doc, 'input', {id: 'outcome-note', type: 'text', maxlength: '300', placeholder: 'Optional, for example who replied'});
  const record = el(doc, 'button', {type: 'button', text: 'Record outcome'});
  const message = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-outcome-message': ''});
  const list = el(doc, 'ul', {'data-outcome-history': ''});
  section.append(el(doc, 'h2', {id: 'application-outcome-title', text: 'Outcome'}),
    el(doc, 'p', {class: 'outcome-note', text: 'What happened after you applied. Recorded only here, on this PC, to show what works over time; nothing is sent.'}), current,
    el(doc, 'div', {class: 'outcome-form'}, [
      el(doc, 'label', {for: select.id, text: 'Outcome'}), select,
      el(doc, 'label', {for: date.id, text: 'Date'}), date,
      el(doc, 'label', {for: note.id, text: 'Note'}), note, record]),
    message, list);
  // After the vacancy/email-domain pair, never between them (they sit side by side on wide screens).
  const anchor = doc.querySelector('.workspace-vacancy-row') || doc.getElementById('email-domain-resolution') || doc.querySelector('.panel--vacancy');
  if (anchor?.parentNode) anchor.after(section); else (doc.querySelector('main') || doc.body).append(section);

  const call = async (url, body) => {
    const r = await fetchImpl(url, body === undefined ? {cache: 'no-store'} : {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || 'Outcome could not be saved.');
    return data;
  };
  function render(state) {
    if (!select.options.length) for (const o of state.options) select.append(el(doc, 'option', {value: o.id, text: o.label}));
    current.textContent = state.current ? `Current outcome: ${state.current.label}, ${shortDate(state.current.occurredOn)}.` : 'No outcome recorded yet.';
    section.dataset.outcome = state.current?.outcome || '';
    list.replaceChildren();
    for (const e of [...state.history].reverse()) {
      const remove = el(doc, 'button', {type: 'button', class: 'outcome-remove', text: 'Remove'});
      remove.addEventListener('click', async () => {
        // Two clicks, so a slip cannot delete an entry; no browser dialog.
        if (remove.dataset.armed !== 'true') { remove.dataset.armed = 'true'; remove.textContent = 'Click again to remove'; return; }
        remove.disabled = true;
        try { render(await call(api + '/' + e.id + '/remove', {})); message.textContent = 'Entry removed.'; } catch (error) { message.textContent = error.message; remove.disabled = false; }
      });
      list.append(el(doc, 'li', {}, [doc.createTextNode(`${shortDate(e.occurredOn)}: ${e.label}${e.note ? ' — ' + e.note : ''} `), remove]));
    }
  }
  record.addEventListener('click', async () => {
    record.disabled = true; message.textContent = 'Saving…';
    try { render(await call(api, {outcome: select.value, occurredOn: date.value, note: note.value})); note.value = ''; message.textContent = 'Outcome recorded.'; }
    catch (error) { message.textContent = error.message; }
    finally { record.disabled = false; }
  });
  call(api).then(render).catch(error => { current.textContent = error.message; record.disabled = true; });
  // The Reply assistant records replies here too; show them straight away.
  doc.addEventListener('application-outcome-changed', () => { call(api).then(state => { render(state); message.textContent = 'Updated from the Reply assistant.'; }).catch(() => {}); });
  return section;
}

if (typeof document !== 'undefined') {
  const start = () => attachOutcomeControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
