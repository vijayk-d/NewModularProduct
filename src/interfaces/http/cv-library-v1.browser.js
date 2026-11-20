const $ = id => document.getElementById(id);
let state = null, token = '', editing = null, busy = false, checked = new Map();
const STATE = {indexed: ['Indexed', 'indexed'], changed: ['Changed since indexing', 'changed'], failed: ['Indexing failed', 'failed'], 'not indexed': ['Not indexed', 'not-indexed'], unavailable: ['File unavailable', 'unavailable']};
const MATCH = {library: 'listed in the library', 'same-name': 'same name as the PDF', chosen: 'chosen by you', 'only-word-file': 'only Word file in the folder', choose: 'several Word files: choose one in Tailored CV', none: 'no Word file found'};

async function api(url, body) {
  const response = await fetch(url, {cache: 'no-store', method: body ? 'POST' : 'GET', headers: body ? {'Content-Type': 'application/json', 'X-CV-Library-Token': token} : {}, body: body ? JSON.stringify({...body, confirm: true}) : undefined});
  const value = await response.json();
  if (!response.ok) throw Error(value.error || 'Request failed.');
  return value;
}
function node(tag, text, cls) { const x = document.createElement(tag); if (text !== undefined) x.textContent = text; if (cls) x.className = cls; return x; }
const when = iso => iso ? new Date(iso).toLocaleString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : 'never';

function stateFor(entry) { return checked.get(entry.role_code) || state.indexed.find(x => x.role_code === entry.role_code)?.status || 'not indexed'; }

function card(entry) {
  const info = state.indexed.find(x => x.role_code === entry.role_code) || {}, s = stateFor(entry), [label, cls] = STATE[s] || [s, 'not-indexed'];
  const article = node('article', undefined, 'cv-card'); article.dataset.code = entry.role_code; article.dataset.state = s;
  const header = node('header'), title = node('div');
  title.append(node('h2', entry.role_code), node('p', entry.role_name, 'role'));
  header.append(title, node('span', label, 'chip chip-' + cls));
  const dl = node('dl');
  const row = (k, v) => { dl.append(node('dt', k)); const dd = node('dd'); if (v instanceof Node) dd.append(v); else dd.textContent = v; dl.append(dd); };
  row('Document', entry.local_path);
  row('Word file', info.word ? (info.word.name ? `${info.word.name} (${MATCH[info.word.match] || info.word.match})` : MATCH[info.word.match] || 'not found') : info.describeError || 'checked when indexed');
  row('Sections', info.sections || '—');
  row('Indexed', `${when(info.indexedAt)}${info.wordCount ? ' · ' + info.wordCount + ' words' : ''}`);
  if (info.topTerms?.length) { const t = node('div', undefined, 'terms'); for (const term of info.topTerms) t.append(node('span', term)); row('Top terms', t); }
  if (entry.tags?.length) row('Tags', entry.tags.join(', '));
  const actions = node('div', undefined, 'actions');
  for (const [text, fn] of [['Edit', () => edit(entry)], ['Inspect text', () => run(async () => { const r = await api('/api/cv-library/inspect?code=' + encodeURIComponent(entry.role_code)); $('report').textContent = [r.role_code, 'SHA-256: ' + r.sha256, 'Inspected: ' + r.indexedAt, '', r.text].join('\n'); $('report').closest('details').open = true; })], ['Re-index', () => reindex('all', entry.role_code)]]) {
    const b = node('button', text); b.type = 'button'; b.onclick = fn; actions.append(b);
  }
  article.append(header, dl, node('p', 'Priority: ' + entry.priority, 'priority'), actions);
  return article;
}

function render() {
  const q = $('search').value.trim().toLowerCase(), filter = $('state-filter').value;
  const list = state.cvs.filter(entry => {
    const info = state.indexed.find(x => x.role_code === entry.role_code) || {}, s = stateFor(entry);
    if (filter === 'indexed' && s !== 'indexed') return false;
    if (filter === 'attention' && s === 'indexed') return false;
    return !q || [entry.role_code, entry.role_name, entry.local_path, ...(entry.tags || []), ...(info.topTerms || [])].join(' ').toLowerCase().includes(q);
  });
  $('cards').replaceChildren(...(list.length ? list.map(card) : [node('p', 'No CVs match.', 'empty')]));
  const counts = {indexed: 0, attention: 0};
  for (const entry of state.cvs) counts[stateFor(entry) === 'indexed' ? 'indexed' : 'attention']++;
  const auto = state.autoIndex?.lastRunAt ? ` Background indexing last ran ${when(state.autoIndex.lastRunAt)}.` : ' Background indexing runs shortly after start-up and every 30 minutes.';
  $('summary').textContent = `${state.cvs.length} CVs · ${counts.indexed} indexed and current · ${counts.attention} need attention.${auto}`;
}

async function run(fn) {
  if (busy) return; busy = true; document.querySelectorAll('button').forEach(b => b.disabled = true); $('status').textContent = 'Working locally…';
  try { const message = await fn(); $('status').textContent = typeof message === 'string' ? message : 'Done.'; } catch (e) { $('status').textContent = e.message; }
  finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false); }
}
async function reload() {
  state = await api('/api/cv-library'); checked = new Map();
  $('notice').textContent = state.storage === 'shared'
    ? `Shared CV catalogue (${state.environment}). Changes apply to new applications in both development and production. CV ranking uses each CV's indexed text while it matches the current file; otherwise its tags. Original documents are never overwritten.`
    : 'Development catalogue. CV ranking uses each CV\'s indexed text while it matches the current file; otherwise its tags. Original documents are never overwritten.';
  render();
}
function edit(entry = null) {
  if (busy) return; editing = entry;
  for (const [id, value] of [['code', entry?.role_code || ''], ['name', entry?.role_name || ''], ['path', entry?.local_path || ''], ['tags', (entry?.tags || []).join('\n')], ['cases', (entry?.use_cases || []).join('\n')], ['priority', entry?.priority || 'medium']]) $(id).value = value;
  $('code').readOnly = !!entry; $('edit-error').textContent = ''; $('editor').showModal();
}
async function reindex(mode, code) {
  await run(async () => {
    const result = await api('/api/cv-library/reindex', {mode, code});
    const failed = result.results.filter(r => r.status === 'failed').length, indexed = result.results.filter(r => r.status === 'indexed').length;
    $('report').textContent = JSON.stringify(result, null, 2);
    await reload();
    return `${indexed} indexed, ${result.results.length - indexed - failed} unchanged${failed ? ', ' + failed + ' failed (see the card)' : ''}.`;
  });
}
$('reload').onclick = () => run(reload);
$('add').onclick = () => edit();
$('cancel').onclick = () => $('editor').close();
$('search').addEventListener('input', () => state && render());
$('state-filter').addEventListener('change', () => state && render());
$('validate').onclick = () => run(async () => { const result = await api('/api/cv-library/validate'); checked = new Map(result.results.map(r => [r.role_code, r.status === 'current' ? 'indexed' : r.status === 'stale' ? 'changed' : r.status])); render(); $('report').textContent = JSON.stringify(result, null, 2); });
$('discover').onclick = () => run(async () => { const r = await api('/api/cv-library/discover'); $('report').textContent = r.files.length ? 'Not in the library yet:\n' + r.files.join('\n') : 'Every PDF and Word file in the CV folder is already in the library.'; $('report').closest('details').open = true; });
$('changed').onclick = () => reindex('changed');
$('all').onclick = () => reindex('all');
$('form').onsubmit = async event => {
  event.preventDefault(); if (busy) return;
  const lines = id => $(id).value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const entry = {...(editing || {}), role_code: $('code').value.trim(), role_name: $('name').value.trim(), local_path: $('path').value.trim(), tags: lines('tags'), use_cases: lines('cases'), priority: $('priority').value};
  if (!confirm(state.storage === 'shared' ? 'Save this SHARED catalogue entry? New applications in BOTH environments will see it. A backup is made first. Saved applications and scheduled messages are not rewritten.' : 'Save this catalogue entry? A backup is made first. Existing applications are not changed.')) return;
  await run(async () => {
    try { const cvs = editing ? state.cvs.map(e => e.role_code === editing.role_code ? entry : e) : [...state.cvs, entry]; await api('/api/cv-library/save', {etag: state.etag, cvs}); $('editor').close(); await reload(); }
    catch (e) { $('edit-error').textContent = e.message; throw e; }
  });
};
await run(async () => { token = (await api('/api/cv-library/session')).token; await reload(); });
