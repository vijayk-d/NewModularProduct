const $ = id => document.getElementById(id);
let state = null, busy = false;

function cell(text, className) { const td = document.createElement('td'); if (className) td.className = className; td.textContent = text; return td; }

function render(data) {
  state = data;
  $('env').textContent = data.environment; $('env').className = 'env ' + data.environment;
  $('release').textContent = String(data.release).slice(0, 12); $('file').textContent = data.file;
  if (data.environment !== 'production' && !data.fileExists) $('note').textContent = 'No toggle file yet, so the .env flags are used. Saving creates the file, and from the next restart it overrides the .env flags.';
  const body = $('features'); body.replaceChildren();
  const labels = Object.fromEntries(data.features.map(f => [f.id, f.label]));
  for (const f of data.features) {
    const tr = document.createElement('tr');
    const name = document.createElement('td'); const strong = document.createElement('strong'); strong.textContent = f.label; name.append(strong);
    const small = document.createElement('small'); small.textContent = f.description + (f.requires.length ? ' Needs: ' + f.requires.map(r => labels[r] || r).join(', ') + '.' : '') + ' (' + f.env + ')'; name.append(small);
    const saved = cell(f.saved ? 'On' : 'Off', 'state ' + (f.saved ? 'on' : 'off'));
    if (f.saved && !f.effective) { const w = document.createElement('small'); w.className = 'warn'; w.textContent = 'Stays off until its required features are on.'; saved.append(w); }
    const running = cell(f.running ? 'On' : 'Off', 'state ' + (f.running ? 'on' : 'off'));
    if (f.restartNeeded) { const w = document.createElement('small'); w.className = 'warn'; w.textContent = 'Restart needed'; running.append(w); }
    const action = document.createElement('td'); const button = document.createElement('button'); button.type = 'button';
    button.textContent = f.saved ? 'Turn off' : 'Turn on'; button.setAttribute('aria-label', button.textContent + ' ' + f.label); button.disabled = busy;
    button.addEventListener('click', () => toggle(f, !f.saved)); action.append(button);
    tr.append(name, saved, running, action); body.append(tr);
  }
  const list = $('dev-only'); list.replaceChildren();
  for (const f of data.developmentOnly) { const li = document.createElement('li'); li.textContent = f.label + ': ' + f.description; list.append(li); }
}

async function api(method, body) {
  const response = await fetch('/api/settings/features', { method, cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function toggle(f, enabled) {
  if (busy || !state) return;
  let confirmed = false;
  if (enabled && f.risk === 'sends-email') {
    confirmed = window.confirm(`Turn on "${f.label}" in ${state.environment}?\nAfter a restart, reviewed emails can be sent to real contacts from the configured Gmail account. Each send still needs a click and duplicate protection stays on.`);
    if (!confirmed) { $('status').textContent = 'Not changed.'; return; }
  } else if (enabled && f.risk === 'paid-api' && !window.confirm(`Turn on "${f.label}"? It makes paid Perplexity API calls after a restart.`)) { $('status').textContent = 'Not changed.'; return; }
  busy = true; render(state); $('status').textContent = 'Saving…';
  try {
    render(await api('POST', { id: f.id, enabled, expectedRevision: state.revision, confirmed }));
    $('status').textContent = `Saved: ${f.label} ${enabled ? 'on' : 'off'}. Restart ${state.environment} to apply.`;
  } catch (e) { $('status').textContent = e.message; }
  finally { busy = false; if (state) render(state); }
}

api('GET').then(render).catch(e => { $('status').textContent = e.message; });
