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

  // Email opens: from your tracker's (Mailsuite) alert emails in Gmail, read-only and free.
  const opensApi = '/api/reviews/' + encodeURIComponent(reviewId) + '/email-opens';
  const opensLine = el(doc, 'p', {'data-email-opens': '', role: 'status', 'aria-live': 'polite'});
  const opensList = el(doc, 'ul', {'data-email-opens-contacts': ''});
  const checkOpens = el(doc, 'button', {type: 'button', text: 'Check email opens (read-only)', hidden: ''});
  const opensBox = el(doc, 'div', {class: 'email-opens', hidden: ''}, [el(doc, 'h3', {text: 'Email opens'}), opensLine, opensList,
    el(doc, 'p', {class: 'outcome-note', text: 'From the alerts and daily reports Mailsuite sends to your Gmail. Mailsuite tracks only emails you send one at a time from Gmail, not this app’s bulk sends. A hint, not proof: images can be blocked or pre-loaded, and a forward shows only as an open somewhere new.'}), checkOpens]);
  section.append(opensBox);
  const times = n => n === 1 ? 'once' : n + ' times';
  function renderOpens(o, fresh = false) {
    opensBox.hidden = false; checkOpens.hidden = !o.available;
    const r = o.review, when = o.checkedAt ? ` Last checked ${new Date(o.checkedAt).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}.` : '';
    const day = ms => new Date(ms).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
    const opened = r ? r.contacts.filter(c => c.state !== 'unopened').length : 0;
    opensLine.textContent = r ? `Tracked emails to ${r.tracked} contact${r.tracked === 1 ? '' : 's'}: ${opened} opened${r.clicks ? `, links clicked ${times(r.clicks)}` : ''}; latest report ${day(r.lastAt)}.${when}`
      : o.checkedAt ? `No Mailsuite alerts or reports mention this application's contacts yet.${when}` : o.available ? 'Not checked yet.' : 'Checking opens needs Gmail switched on.';
    if (fresh && o.newAlerts !== undefined) opensLine.textContent += ` ${o.newAlerts} new alert${o.newAlerts === 1 ? '' : 's'} read.`;
    const stateText = c => c.state === 'unopened' ? 'not opened yet' : `opened${c.opens ? ' (' + times(c.opens) + ' reported)' : ''}${c.clicks ? `, clicked ${times(c.clicks)}` : ''}`;
    opensList.replaceChildren(...(r?.contacts || []).map(c => el(doc, 'li', {'data-open-state': c.state, text: `${c.name || c.email}: ${stateText(c)}, latest ${day(c.lastAt)}`})));
  }
  checkOpens.addEventListener('click', async () => {
    checkOpens.disabled = true; opensLine.textContent = 'Reading open alerts in Gmail (read-only)…';
    try { renderOpens(await call(opensApi + '/check', {}), true); } catch (error) { opensLine.textContent = error.message; } finally { checkOpens.disabled = false; }
  });
  call(opensApi).then(o => renderOpens(o)).catch(() => {});

  // Link clicks: from your own link tracker (the LinkedIn advert and profile links in emails this app sent).
  const clicksApi = '/api/reviews/' + encodeURIComponent(reviewId) + '/link-clicks';
  const clicksLine = el(doc, 'p', {'data-link-clicks': '', role: 'status', 'aria-live': 'polite'});
  const clicksList = el(doc, 'ul', {'data-link-clicks-contacts': ''});
  const checkClicks = el(doc, 'button', {type: 'button', text: 'Check link clicks (read-only)', hidden: ''});
  const clicksBox = el(doc, 'div', {class: 'link-clicks', hidden: ''}, [el(doc, 'h3', {text: 'Link clicks'}), clicksLine, clicksList,
    el(doc, 'p', {class: 'outcome-note', text: 'Clicks on the LinkedIn advert and profile links in emails this app sent. Email security scanners and clicks within a minute of sending are left out. A hint, not proof: a forwarded email counts too.'}), checkClicks]);
  section.append(clicksBox);
  function renderClicks(c, fresh = false) {
    const noClicks = !c.available && !c.review && !c.checkedAt;
    clicksLine.hidden = noClicks; clicksList.hidden = noClicks;
    if (noClicks) { clicksBox.hidden = optBox.hidden; checkClicks.hidden = true; return; }
    clicksBox.hidden = false; checkClicks.hidden = !c.available;
    const r = c.review, day = iso => new Date(iso).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
    const when = c.checkedAt ? ` Last checked ${new Date(c.checkedAt).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}.` : '';
    const parts = x => [x.advert ? `advert ${times(x.advert)}` : '', x.profile ? `profile ${times(x.profile)}` : ''].filter(Boolean).join(', ');
    clicksLine.textContent = r ? `Links clicked: ${parts(r)}; latest ${day(r.lastAt)}.${when}` : c.checkedAt ? `No link clicks for this application yet.${when}` : 'Not checked yet.';
    if (fresh && c.newClicks !== undefined) clicksLine.textContent += ` ${c.newClicks} new click${c.newClicks === 1 ? '' : 's'} read.`;
    clicksList.replaceChildren(...(r?.contacts || []).map(p => el(doc, 'li', {text: `${p.email}: ${parts(p)}, latest ${day(p.lastAt)}`})));
  }
  checkClicks.addEventListener('click', async () => {
    checkClicks.disabled = true; clicksLine.textContent = 'Reading clicks from your link tracker (read-only)…';
    try { renderClicks(await call(clicksApi + '/check', {}), true); } catch (error) { clicksLine.textContent = error.message; } finally { checkClicks.disabled = false; }
  });
  call(clicksApi).then(c => renderClicks(c)).catch(() => {});

  // Opt-outs: people (or @domain for a whole organisation) who asked not to have clicks counted. Their emails get
  // plain links and no footnote, and clicks on links already sent to them stop counting.
  const optApi = '/api/link-tracking/opt-outs';
  const optInput = el(doc, 'input', {id: 'link-opt-out-value', type: 'text', maxlength: '254', placeholder: 'name@example.com or @example.com'});
  const optAdd = el(doc, 'button', {type: 'button', text: 'Stop counting'});
  const optMessage = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-link-opt-out-message': ''});
  const optList = el(doc, 'ul', {'data-link-opt-outs': ''});
  const optBox = el(doc, 'div', {class: 'link-opt-outs', hidden: ''}, [el(doc, 'h4', {text: 'Not counted'}),
    el(doc, 'p', {class: 'outcome-note', text: 'If someone asks not to be tracked, add their email address (or @ and their domain for a whole organisation). Their emails get plain links and no footnote, and clicks on links already sent stop counting.'}),
    el(doc, 'div', {class: 'outcome-form'}, [el(doc, 'label', {for: optInput.id, text: 'Email or @domain'}), optInput, optAdd]), optMessage, optList]);
  clicksBox.append(optBox);
  const refreshClicks = () => call(clicksApi).then(c => renderClicks(c)).catch(() => {});
  function renderOptOuts(list) {
    optBox.hidden = false; clicksBox.hidden = false;
    optList.replaceChildren(...list.map(o => {
      const remove = el(doc, 'button', {type: 'button', text: 'Count again', 'aria-label': 'Count clicks again for ' + o.value});
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try { renderOptOuts((await call(optApi, {value: o.value, optOut: false})).optOuts); optMessage.textContent = o.value + ' is counted again for new emails.'; refreshClicks(); }
        catch (error) { optMessage.textContent = error.message; remove.disabled = false; }
      });
      return el(doc, 'li', {'data-link-opt-out': o.value}, [doc.createTextNode(o.value + ' '), remove]);
    }));
  }
  optAdd.addEventListener('click', async () => {
    optAdd.disabled = true;
    try { const value = optInput.value; renderOptOuts((await call(optApi, {value, optOut: true})).optOuts); optInput.value = ''; optMessage.textContent = 'Saved: ' + value.trim().toLowerCase() + ' will not be counted.'; refreshClicks(); }
    catch (error) { optMessage.textContent = error.message; }
    finally { optAdd.disabled = false; }
  });
  call(optApi).then(o => { if (o.inUse) renderOptOuts(o.optOuts); }).catch(() => {});
  // The Reply assistant records replies here too; show them straight away.
  doc.addEventListener('application-outcome-changed', () => { call(api).then(state => { render(state); message.textContent = 'Updated from the Reply assistant.'; }).catch(() => {}); });
  return section;
}

if (typeof document !== 'undefined') {
  const start = () => attachOutcomeControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
