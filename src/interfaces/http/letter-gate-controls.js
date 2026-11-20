// Shows whether this application's letter may be drafted or sent, above the outreach area.
// Draft and Send stay blocked until the polished proposal is applied, unless you tick "Send without polishing".
export function attachLetterGate(doc = document, fetchImpl = fetch) {
  const reviewId = doc.querySelector('input[name="reviewId"]')?.value;
  if (!reviewId || doc.getElementById('letter-gate')) return null;
  const api = '/api/reviews/' + encodeURIComponent(reviewId) + '/letter-gate';
  const box = doc.createElement('div');
  box.id = 'letter-gate'; box.className = 'letter-gate'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
  const text = doc.createElement('p'), label = doc.createElement('label'), check = doc.createElement('input');
  check.type = 'checkbox'; check.id = 'send-without-polish';
  label.htmlFor = check.id; label.append(check, doc.createTextNode(' Send without polishing (I have checked this letter myself)'));
  box.append(text, label);
  const anchor = doc.querySelector('.outreach-queue-section') || doc.querySelector('form[action="/recruiter-contacts/link"]')?.closest('section') || doc.querySelector('.panel--current');
  if (anchor?.parentNode) anchor.before(box); else (doc.querySelector('main') || doc.body).append(box);
  function render(g) {
    box.dataset.allowed = String(g.allowed);
    text.textContent = g.applied ? 'Polished letter applied: Draft and Send use it.' + (g.pending ? ' A newer proposal is waiting; apply it first if you prefer it.' : '')
      : g.overridden ? 'Sending without polishing: you chose to draft and send this letter as it is.'
      : g.message + ' Draft and Send are blocked until then.';
    check.checked = g.overridden;
    label.hidden = g.applied;
  }
  const call = async body => {
    const r = await fetchImpl(api, body === undefined ? {cache: 'no-store'} : {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || 'The letter check failed.');
    return data;
  };
  check.addEventListener('change', async () => {
    check.disabled = true;
    try { render(await call({sendWithoutPolish: check.checked})); doc.dispatchEvent(new CustomEvent('nmp-letter-gate-changed')); doc.querySelector('[data-queue-action="refresh"]')?.click(); }
    catch (error) { text.textContent = error.message; check.checked = !check.checked; }
    finally { check.disabled = false; }
  });
  call().then(render).catch(error => { text.textContent = error.message; });
  return box;
}

if (typeof document !== 'undefined') {
  const start = () => attachLetterGate();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
