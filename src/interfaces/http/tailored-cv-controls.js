// Tailored CV section on the review page. Drafting and building are local; only the optional Polish step makes one paid call, after the owner confirms its cost. No Gmail call.
const SOURCE = {cv: 'From your CV', selected: 'Selected for this application'};

export function parseProfile(value) { return String(value || '').split(/\n\s*\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean); }
export function parseBullets(value) { return String(value || '').split('\n').map(s => s.replace(/^\s*[-•*]\s*/, '').replace(/\s+/g, ' ').trim()).filter(Boolean); }

// Before/after rows for one box, line by line. Local only: used to show what a polish changed.
export const CHANGE_LABELS = {unchanged: 'Unchanged', changed: 'Reworded', added: 'Added', removed: 'Removed'};
export function compareLines(before = [], after = []) {
  const rows = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const b = before[i], a = after[i];
    rows.push({before: b ?? '', after: a ?? '', status: b === undefined ? 'added' : a === undefined ? 'removed' : a === b ? 'unchanged' : 'changed'});
  }
  return rows;
}

function el(doc, tag, props = {}, children = []) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') node.textContent = v; else if (k === 'class') node.className = v; else node.setAttribute(k, v);
  }
  for (const child of children) node.append(child);
  return node;
}

export function attachTailoredCvControls(doc = document, fetchImpl = fetch) {
  const reviewId = doc.querySelector('input[name="reviewId"]')?.value;
  if (!reviewId || doc.getElementById('tailored-cv')) return null;
  const api = '/api/reviews/' + encodeURIComponent(reviewId) + '/tailored-cv';
  const section = el(doc, 'section', {class: 'review-section tailored-cv', id: 'tailored-cv', 'aria-labelledby': 'tailored-cv-title'});
  const intro = el(doc, 'p', {class: 'tailored-cv-note', text: 'A job-specific copy of the Word CV selected above. Only the summary and bullets change, using your CV and the achievements selected for this application. Your original CV is never changed. Everything is free and local except the optional Polish step.'});
  // Step bar: where you are and what comes next. Steps 2 to 5 appear after drafting, step 6 after the first build.
  const STEPS = [['1', 'Draft'], ['2', 'Edit'], ['3', 'Polish (optional)'], ['4', 'ATS match'], ['5', 'Build'], ['6', 'Use it']];
  const stepBar = el(doc, 'ol', {class: 'tailored-steps', 'aria-label': 'Tailored CV steps'}, STEPS.map(([n, t]) => el(doc, 'li', {}, [el(doc, 'a', {href: '#tailored-step-' + n, text: `${n}. ${t}`})])));
  const stepHeading = (n, text) => el(doc, 'h3', {id: 'tailored-step-' + n, class: 'tailored-step', text: `${n}. ${text}`});
  const draftButton = el(doc, 'button', {type: 'button', text: 'Draft tailored CV'});
  const checkButton = el(doc, 'button', {type: 'button', text: 'Check all CVs'});
  const report = el(doc, 'div', {'data-tailored-library': '', hidden: ''});
  const status = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-tailored-status': ''});
  const latest = el(doc, 'p', {'data-tailored-latest': ''});
  const useBlock = el(doc, 'div', {class: 'tailored-use', hidden: ''}, [stepHeading('6', 'Use your tailored CV'), latest,
    el(doc, 'p', {class: 'tailored-cv-note', text: 'Download it, save it to your output folder (opens in Word without Unblock), or choose "Tailored CV (DOCX)" in the Export pack for a job portal. Emails to recruiters still attach the CV selected above, not the tailored one.'})]);
  const editor = el(doc, 'div', {'data-tailored-editor': '', hidden: ''});
  const chooser = el(doc, 'div', {'data-tailored-headings': '', hidden: ''});
  const wordChooser = el(doc, 'div', {'data-tailored-word': '', hidden: ''});
  section.append(el(doc, 'h2', {id: 'tailored-cv-title', text: 'Tailored CV'}), intro, stepBar, stepHeading('1', 'Draft from your CV'), el(doc, 'div', {class: 'actions'}, [draftButton, checkButton]), status, wordChooser, chooser, report, editor, useBlock);
  const anchor = doc.querySelector('.panel--decision') || doc.getElementById('email-domain-resolution');
  if (anchor?.parentNode) anchor.after(section); else (doc.querySelector('main') || doc.body).append(section);

  let draft = null, options = {};
  // Choices are saved on the server per CV once a draft works, so every application and the Export pack use them.
  function showWordChooser(data) {
    wordChooser.textContent = '';
    const files = data.word?.candidates || [];
    wordChooser.hidden = !files.length;
    if (!files.length) return;
    const select = el(doc, 'select', {id: 'tailored-word-file'});
    for (const name of files) select.append(el(doc, 'option', {value: name, text: name}));
    const use = el(doc, 'button', {type: 'button', text: 'Use this Word file'});
    use.addEventListener('click', () => runDraft({...options, wordFile: select.value}));
    wordChooser.append(el(doc, 'label', {for: select.id, text: `Which Word file is the source of "${data.word.pdfName}"?`}), select, el(doc, 'div', {class: 'actions'}, [use]));
  }

  function showChooser(data) {
    chooser.textContent = '';
    const make = (id, text, current) => {
      const select = el(doc, 'select', {id});
      select.append(el(doc, 'option', {value: '', text: 'Recognise automatically'}));
      for (const h of data.headings) { const o = el(doc, 'option', {value: h, text: h}); if (h === current) o.selected = true; select.append(o); }
      return [el(doc, 'label', {for: id, text}), select];
    };
    const [pl, ps] = make('tailored-profile-heading', 'Which heading is your Profile?', data.chosen?.profileHeading);
    const [al, as] = make('tailored-achievements-heading', 'Which heading is your Key achievements?', data.chosen?.achievementsHeading);
    const retry = el(doc, 'button', {type: 'button', text: 'Draft again with these headings'});
    retry.addEventListener('click', () => runDraft({...options, profileHeading: ps.value, achievementsHeading: as.value}));
    chooser.append(el(doc, 'p', {class: 'tailored-cv-note', text: data.headings.length ? 'Headings found in your Word CV:' : 'No heading-like lines were found in your Word CV.'}), pl, ps, al, as, el(doc, 'div', {class: 'actions'}, [retry]));
    chooser.hidden = !data.headings.length;
  }

  const showLatest = item => {
    latest.textContent = '';
    useBlock.hidden = !item;
    if (!item) return;
    const link = el(doc, 'a', {href: api + '/' + item.version + '.docx', 'data-tailored-download': '', text: `Download tailored CV (version ${item.version}, DOCX)`});
    // Save to folder: the app writes the file itself, so Word opens it without the Unblock step a browser download needs.
    const saveButton = el(doc, 'button', {type: 'button', 'data-tailored-save-folder': '', text: 'Save to folder', title: 'Write this DOCX into your application output folder (APPLICATION_OUTPUT_FOLDER). Opens in Word without Unblock.'});
    const saveStatus = el(doc, 'span', {role: 'status', 'aria-live': 'polite', 'data-tailored-save-status': ''});
    saveButton.addEventListener('click', async () => {
      saveButton.disabled = true; saveStatus.textContent = ' Saving…';
      try {
        const response = await fetchImpl(api + '/' + item.version + '/save-to-folder', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'Save to folder failed. Nothing was written.');
        saveStatus.textContent = ` Saved ${data.files.join(', ')} in ${data.folder}.`;
      } catch (error) { saveStatus.textContent = ' ' + error.message; }
      finally { saveButton.disabled = false; }
    });
    const ats = item.ats ? ` ATS match of this version: ${item.ats.after.score}% (base CV ${item.ats.before.score}%).` : '';
    latest.append(link, doc.createTextNode(' '), saveButton, saveStatus, doc.createTextNode(` Built from ${item.baseName}.${ats}`));
  };

  // Optional paid Polish: estimate first (free), then one request only after the owner confirms the cost.
  // The polished wording only fills the boxes above; nothing is built until the owner clicks Build.
  // Free, local ATS keyword match: the whole CV before tailoring against the CV with the wording in the boxes.
  function atsControls(currentBody) {
    const panel = el(doc, 'div', {class: 'tailored-ats', 'data-tailored-ats': ''});
    const check = el(doc, 'button', {type: 'button', text: 'Check ATS match (free)'});
    const status = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-tailored-ats-status': ''});
    const details = el(doc, 'div', {'data-tailored-ats-details': ''});
    panel.append(stepHeading('4', 'Check the ATS match (free)'),
      el(doc, 'p', {class: 'tailored-cv-note', text: 'How many of this job\'s keywords your whole CV contains, before tailoring and with the wording above. Free and local. Keywords with no evidence are never added for you.'}),
      el(doc, 'div', {class: 'actions'}, [check]), status, details);
    const list = (title, items, attr) => items.length ? [el(doc, 'p', {text: title}), el(doc, 'ul', {[attr]: ''}, items.map(t => el(doc, 'li', {text: t})))] : [];
    async function run() {
      check.disabled = true; status.classList.add('is-busy'); status.textContent = 'Checking keywords…';
      try {
        const response = await fetchImpl(api + '/ats', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(currentBody())});
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'The ATS match could not run.');
        const change = data.after.score - data.before.score;
        status.textContent = data.total
          ? `Base CV ${data.before.score}% → tailored CV ${data.after.score}% (${data.after.matched} of ${data.total} job keywords${change ? `, ${change > 0 ? '+' : ''}${change} points` : ', no change'}).`
          : 'No job keywords were found in this advert.';
        details.textContent = '';
        details.append(
          ...list('Now covered by your tailoring:', data.gained, 'data-ats-gained'),
          ...list('Lost by your tailoring (put back if relevant):', data.lost, 'data-ats-lost'),
          ...list('Missing, but in your CV lines or selected achievements (work these in):', data.workIn, 'data-ats-work-in'),
          ...list('Missing with no evidence (leave out; do not claim):', data.noEvidence, 'data-ats-no-evidence'),
          ...(data.wholeCv ? [] : [el(doc, 'p', {class: 'tailored-cv-note', text: 'Only the tailored sections could be read, so the score covers those sections.'})]));
      } catch (error) { status.textContent = error.message; }
      finally { check.disabled = false; status.classList.remove('is-busy'); }
    }
    check.addEventListener('click', run);
    return {panel, run};
  }

  function polishControls({profile, bullets, roleBoxes, currentBody, onPolished = () => {}}) {
    const panel = el(doc, 'div', {class: 'tailored-polish', 'data-tailored-polish': ''});
    const start = el(doc, 'button', {type: 'button', text: 'Polish wording (paid)…'});
    const choice = el(doc, 'div', {'data-tailored-polish-choice': '', hidden: ''});
    const status = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-tailored-polish-status': ''});
    const progress = el(doc, 'div', {class: 'busy-bar', role: 'progressbar', 'aria-label': 'Polishing in progress. Please wait; do not click again.', 'data-tailored-polish-progress': '', hidden: ''});
    // Busy look for this panel only: the boxes above stay editable.
    const busy = on => { progress.hidden = !on; status.classList.toggle('is-busy', on); panel.setAttribute('aria-busy', String(on)); };
    const result = el(doc, 'div', {'data-tailored-polish-result': '', hidden: ''});
    panel.append(stepHeading('3', 'Polish wording (optional, paid)'),
      el(doc, 'p', {class: 'tailored-cv-note', text: 'A model rewrites the wording above for this job: it rephrases to match the job description and leads with results, using only facts from your CV and the selected achievements. No web search. You see the estimated cost first; nothing is sent until you confirm, and nothing is built until you click Build.'}),
      el(doc, 'div', {class: 'actions'}, [start]), choice, status, progress, result);
    const values = () => ({profile: profile.value, bullets: bullets ? bullets.value : null, roles: roleBoxes.map(b => b.value)});
    const restore = v => { profile.value = v.profile; if (bullets) bullets.value = v.bullets; roleBoxes.forEach((b, i) => { b.value = v.roles[i]; }); };
    let estimate = null;
    async function post(path, body) {
      const response = await fetchImpl(api + path, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Polishing failed. Nothing was changed.');
      return data;
    }
    async function runEstimate(model) {
      start.disabled = true; busy(true); status.textContent = 'Estimating the cost (nothing is sent)…';
      try {
        estimate = await post('/polish/estimate', {...currentBody(), ...(model ? {model} : {})});
        choice.textContent = '';
        if (!estimate.available) { choice.hidden = true; status.textContent = estimate.message; return; }
        const select = el(doc, 'select', {id: 'tailored-polish-model'});
        for (const m of estimate.models) { const o = el(doc, 'option', {value: m.id, text: `${m.label} (${m.provider}), about $${m.estimatedTokenCostUsd.toFixed(4)}`}); if (m.id === estimate.model) o.selected = true; select.append(o); }
        select.addEventListener('change', () => runEstimate(select.value));
        const chosen = estimate.models.find(m => m.id === estimate.model);
        const send = el(doc, 'button', {type: 'button', 'data-tailored-polish-send': '', text: `Send to ${chosen.label} (about $${chosen.estimatedTokenCostUsd.toFixed(4)})`});
        const cancel = el(doc, 'button', {type: 'button', text: 'Cancel'});
        cancel.addEventListener('click', () => { choice.hidden = true; estimate = null; status.textContent = 'Cancelled. Nothing was sent.'; });
        send.addEventListener('click', () => runPolish(send, select, cancel));
        choice.append(el(doc, 'label', {for: select.id, text: 'Polishing model'}), select,
          el(doc, 'p', {class: 'tailored-cv-note', text: `About ${estimate.estimatedInputTokens} input tokens, up to ${estimate.outputTokenBudget} output tokens. ${estimate.limitation}`}),
          el(doc, 'div', {class: 'actions'}, [send, cancel]));
        choice.hidden = false; status.textContent = 'Check the model and estimated cost, then send or cancel.';
      } catch (error) { choice.hidden = true; status.textContent = error.message; } finally { start.disabled = false; busy(false); }
    }
    // One table per box: your wording before the polish next to the polished wording, with a choice per box.
    function comparison(before) {
      const boxes = [{box: profile, old: before.profile, parse: parseProfile, join: '\n\n'}, ...(bullets ? [{box: bullets, old: before.bullets, parse: parseBullets, join: '\n'}] : []),
        ...roleBoxes.map((box, i) => ({box, old: before.roles[i], parse: parseBullets, join: '\n'}))];
      const wrap = el(doc, 'div', {class: 'tailored-polish-compare', 'data-tailored-polish-compare': ''});
      wrap.append(el(doc, 'h4', {text: 'Before and after'}), el(doc, 'p', {class: 'tailored-cv-note', text: 'Each section shows your wording before the polish next to the polished wording. Edit any polished line here (it updates the box above), or choose which version to keep for each section. Build uses whatever is in the boxes.'}));
      for (const {box, old, parse, join} of boxes) {
        const polished = box.value, rows = compareLines(parse(old), parse(polished));
        const name = (doc.querySelector(`label[for="${box.id}"]`)?.textContent || 'Section').replace(/\s*\([^)]*\)\s*$/, '');
        const changed = rows.filter(r => r.status !== 'unchanged').length;
        const tone = [...box.classList].find(c => /^tone-\d$/.test(c)) || 'tone-0';
        const part = el(doc, 'section', {class: 'tailored-compare-section ' + tone, 'data-compare-section': name});
        const table = el(doc, 'table', {class: 'tailored-compare-table'});
        const head = el(doc, 'tr');
        for (const h of ['Before', 'Polished (you can edit)', 'Change']) head.append(el(doc, 'th', {scope: 'col', text: h}));
        const tbody = el(doc, 'tbody'), edits = [];
        // Editing a polished line updates the box above straight away; empty a line to leave it out.
        const sync = () => { box.value = edits.map(e => e.value.replace(/\s+/g, ' ').trim()).filter(Boolean).join(join); };
        for (const r of rows) {
          const edit = el(doc, 'textarea', {rows: '2', 'data-compare-edit': '', 'aria-label': `Polished line ${edits.length + 1}, ${name}`});
          edit.value = r.after;
          const changeCell = el(doc, 'td', {text: CHANGE_LABELS[r.status]}), tr = el(doc, 'tr', {'data-change': r.status}, [el(doc, 'td', {text: r.before}), el(doc, 'td', {}, [edit]), changeCell]);
          edit.addEventListener('input', () => {
            const now = edit.value.replace(/\s+/g, ' ').trim(), state = now === r.before ? 'unchanged' : !now ? 'removed' : !r.before ? 'added' : 'changed';
            tr.dataset.change = state; changeCell.textContent = CHANGE_LABELS[state]; sync(); using.textContent = 'Using the polished wording with your edits.';
          });
          edits.push(edit); tbody.append(tr);
        }
        table.append(el(doc, 'thead', {}, [head]), tbody);
        const using = el(doc, 'span', {role: 'status', 'aria-live': 'polite', 'data-compare-using': '', text: 'Using the polished wording.'});
        const usePrevious = el(doc, 'button', {type: 'button', text: 'Use previous wording'});
        const usePolished = el(doc, 'button', {type: 'button', text: 'Use polished wording'});
        usePrevious.addEventListener('click', () => { box.value = old; using.textContent = 'Using your previous wording.'; });
        usePolished.addEventListener('click', () => { sync(); using.textContent = 'Using the polished wording.'; });
        part.append(el(doc, 'h5', {text: `${name}: ${changed ? `${changed} of ${rows.length} lines changed` : 'no change'}`}), table, el(doc, 'div', {class: 'actions'}, [usePrevious, usePolished, using]));
        wrap.append(part);
      }
      return wrap;
    }
    async function runPolish(send, select, cancel) {
      send.disabled = true; select.disabled = true; cancel.disabled = true; start.disabled = true; busy(true); status.textContent = 'Polishing… waiting for the model (one paid request, no retries). You can keep editing other sections.';
      try {
        const data = await post('/polish', {...currentBody(), model: estimate.model, confirmedCostProof: estimate.costProof});
        const before = values();
        profile.value = data.proposal.profile.join('\n\n');
        if (bullets && data.proposal.achievements) bullets.value = data.proposal.achievements.join('\n');
        if (data.proposal.roles) roleBoxes.forEach((b, i) => { if (data.proposal.roles[i]) b.value = data.proposal.roles[i].join('\n'); });
        choice.hidden = true; estimate = null; result.textContent = '';
        const cost = data.attempt?.providerReportedCostUsd;
        status.textContent = `Polished wording is in the boxes above${cost != null ? ` (reported cost $${cost.toFixed(4)})` : ''}. Check every line, then Build.`;
        if (data.problems.length) { const list = el(doc, 'ul', {'data-tailored-polish-problems': ''}); for (const p of data.problems) list.append(el(doc, 'li', {text: p})); result.append(el(doc, 'p', {text: 'Fix these before building:'}), list); }
        if (data.notes) result.append(el(doc, 'p', {class: 'tailored-cv-note', text: 'Note from the polish: ' + data.notes}));
        result.append(comparison(before));
        const undo = el(doc, 'button', {type: 'button', text: 'Undo polish'});
        undo.addEventListener('click', () => { restore(before); result.hidden = true; status.textContent = 'Your previous wording is back.'; });
        result.append(el(doc, 'div', {class: 'actions'}, [undo])); result.hidden = false;
        onPolished();
      } catch (error) { status.textContent = error.message; send.disabled = false; select.disabled = false; cancel.disabled = false; } finally { start.disabled = false; busy(false); }
    }
    start.addEventListener('click', () => runEstimate(''));
    return panel;
  }

  function render(data) {
    editor.textContent = '';
    const parts = [stepHeading('2', 'Edit the wording'), el(doc, 'p', {class: 'tailored-cv-note', text: 'Each section has its own colour, here and in the before-and-after view.'})];
    const profile = el(doc, 'textarea', {id: 'tailored-profile', class: 'tone-box tone-0', rows: '7', 'aria-describedby': 'tailored-profile-help'});
    profile.value = data.profile.join('\n\n');
    parts.push(el(doc, 'label', {for: 'tailored-profile', class: 'tone-label tone-0', text: `${data.sections.profile.heading} (blank line between paragraphs)`}), profile,
      el(doc, 'p', {id: 'tailored-profile-help', class: 'tailored-cv-note', text: 'Starts as your current wording. Edit freely; figures must already be in your CV or selected evidence.'}));
    if (data.keywordsToWorkIn.length) parts.push(el(doc, 'p', {'data-tailored-hints': '', text: 'In your evidence but not yet in the draft: ' + data.keywordsToWorkIn.join(', ') + '.'}));
    if (data.keywordGaps.length) parts.push(el(doc, 'p', {class: 'tailored-cv-note', text: 'Job keywords with no evidence in your CV (not added): ' + data.keywordGaps.join(', ') + '.'}));
    if (!data.achievements && data.selected?.length) {
      const refs = el(doc, 'ul', {'data-tailored-selected': ''});
      for (const text of data.selected) refs.append(el(doc, 'li', {text}));
      parts.push(el(doc, 'p', {class: 'tailored-cv-note', text: 'Achievements selected for this application (for reference when wording your summary):'}), refs);
    }
    let bullets = null;
    if (data.achievements) {
      bullets = el(doc, 'textarea', {id: 'tailored-achievements', class: 'tone-box tone-1', rows: '9', 'aria-describedby': 'tailored-achievements-help'});
      bullets.value = data.achievements.map(x => x.text).join('\n');
      const list = el(doc, 'ul', {'data-tailored-suggestions': ''});
      for (const item of data.suggestions) {
        const add = el(doc, 'button', {type: 'button', text: 'Add'});
        add.addEventListener('click', () => { bullets.value = (bullets.value.trim() ? bullets.value.trim() + '\n' : '') + item.text; add.disabled = true; });
        list.append(el(doc, 'li', {}, [add, doc.createTextNode(' ' + item.text + ' '), el(doc, 'small', {text: '(' + (SOURCE[item.source] || item.source) + ')'})]));
      }
      parts.push(el(doc, 'label', {for: 'tailored-achievements', class: 'tone-label tone-1', text: `${data.sections.achievements.heading} (one bullet per line)`}), bullets,
        el(doc, 'p', {id: 'tailored-achievements-help', class: 'tailored-cv-note', text: 'Ordered by relevance to this job. Bullet style and fonts are copied from your CV.'}),
        ...(data.suggestions.length ? [el(doc, 'p', {text: 'More evidence you can add:'}), list] : []));
    }
    if (data.roles.length) parts.push(el(doc, 'h3', {text: `${data.sections.experience.heading}: bullets for each employer`}),
      el(doc, 'p', {class: 'tailored-cv-note', text: 'Most relevant first. One bullet per line; delete a line to leave it out. Employers, titles and dates stay as in your CV, and a bullet cannot move to another employer. Unchanged bullets keep their exact formatting.'}));
    const roleBoxes = data.roles.map((role, i) => {
      const box = el(doc, 'textarea', {id: 'tailored-role-' + i, class: 'tone-box tone-' + ((i + 2) % 8), rows: String(Math.min(8, Math.max(3, role.bullets.length + 1))), 'data-tailored-role': String(i)});
      box.value = role.bullets.map(x => x.text).join('\n');
      const original = el(doc, 'button', {type: 'button', text: 'Back to CV order'});
      const cvOrder = data.roleOrder?.[i];
      if (cvOrder) original.addEventListener('click', () => { box.value = cvOrder.join('\n'); }); else original.hidden = true;
      parts.push(el(doc, 'label', {for: box.id, class: 'tone-label tone-' + ((i + 2) % 8), text: role.title}), box, el(doc, 'div', {class: 'tailored-role-actions'}, [original]));
      return box;
    });
    const currentBody = () => {
      const body = {profile: parseProfile(profile.value), expectedSha256: data.baseSha256, expectedRoleCode: data.roleCode, ...(data.chosen || {}), ...(data.word?.match === 'chosen' ? {wordFile: data.word.name} : {})};
      if (bullets) body.achievements = parseBullets(bullets.value);
      if (roleBoxes.length) body.roles = roleBoxes.map(box => parseBullets(box.value));
      return body;
    };
    const ats = atsControls(currentBody);
    const polish = polishControls({profile, bullets, roleBoxes, currentBody, onPolished: ats.run});
    const build = el(doc, 'button', {type: 'button', text: 'Build tailored CV (DOCX)'});
    const message = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-tailored-build-status': ''});
    build.addEventListener('click', async () => {
      build.disabled = true; message.textContent = 'Checking wording and building the Word file…';
      try {
        const body = currentBody();
        const response = await fetchImpl(api, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Tailored CV was not built.');
        message.textContent = `Tailored CV version ${result.tailored.version} built.`;
        showLatest(result.tailored);
      } catch (error) { message.textContent = error.message; } finally { build.disabled = false; }
    });
    editor.append(...parts, polish, ats.panel, stepHeading('5', 'Build the Word file'), el(doc, 'p', {class: 'tailored-cv-note', text: 'Builds a new version from the wording in the boxes. The figures check runs first.'}), el(doc, 'div', {class: 'actions'}, [build]), message);
    editor.hidden = false;
    ats.run();
  }

  async function runDraft(next = {}) {
    options = next;
    draftButton.disabled = true; status.textContent = 'Reading the Word version of your CV…';
    try {
      const query = new URLSearchParams(Object.entries(next).filter(([, v]) => v)).toString();
      const response = await fetchImpl(api + (query ? '?' + query : ''), {cache: 'no-store'});
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not draft a tailored CV.');
      draft = data; showLatest(data.latest);
      if (data.needsWordFile) { editor.hidden = true; chooser.hidden = true; status.textContent = data.message; showWordChooser(data); return; }
      wordChooser.hidden = true;
      if (!data.ready) { editor.hidden = true; status.textContent = data.message; showChooser(data); return; }
      chooser.hidden = true;
      const sec = data.sections, found = [`"${sec.profile.heading}"`];
      if (sec.achievements?.supported) found.push(`"${sec.achievements.heading}"`);
      if (sec.experience?.supported) found.push(`"${sec.experience.heading}" (${sec.experience.roles} employers)`);
      status.textContent = `Drafted from ${data.baseName} (CV ${data.roleCode}; Word file: ${data.word?.label || 'same name as the PDF'}). Found ${found.join(' and ')}. Check the wording, then build.`;
      render(data);
    } catch (error) { status.textContent = error.message; } finally { draftButton.disabled = false; }
  }
  draftButton.addEventListener('click', () => runDraft({}));

  // Read-only health check of every CV in the library, so new or renamed CVs show up straight away.
  checkButton.addEventListener('click', async () => {
    checkButton.disabled = true; report.hidden = false; report.textContent = 'Checking every CV in the library…';
    try {
      const response = await fetchImpl('/api/tailored-cv/library-check', {cache: 'no-store'});
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'The CV check could not run.');
      const table = el(doc, 'table', {'data-tailored-library-table': ''});
      const head = el(doc, 'tr');
      for (const h of ['CV', 'Word file', 'Found by', 'Sections', 'Status']) head.append(el(doc, 'th', {scope: 'col', text: h}));
      table.append(el(doc, 'thead', {}, [head]));
      const body = el(doc, 'tbody');
      for (const r of data.rows) {
        const row = el(doc, 'tr', {'data-ready': String(r.ready)});
        for (const v of [r.roleName && r.roleName !== r.roleCode ? `${r.roleCode} (${r.roleName})` : r.roleCode, r.word || '—', r.label || '—', r.sections || '—', r.ready ? 'Ready' : r.problem || 'Not ready']) row.append(el(doc, 'td', {text: v}));
        body.append(row);
      }
      table.append(body);
      report.textContent = '';
      report.append(el(doc, 'p', {role: 'status', text: `${data.ready} of ${data.checked} CVs are ready for tailoring.`}), table);
    } catch (error) { report.textContent = error.message; } finally { checkButton.disabled = false; }
  });

  doc.addEventListener('change', event => {
    if (event.target?.name === 'selectedCvRoleCode' && draft && event.target.value !== draft.roleCode) {
      editor.hidden = true; chooser.hidden = true; wordChooser.hidden = true; draft = null; options = {}; status.textContent = 'The CV selection changed. Apply it, then draft again.';
    }
  });
  return section;
}

if (typeof document !== 'undefined') {
  const start = () => attachTailoredCvControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
