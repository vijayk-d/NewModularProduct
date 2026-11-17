// Tailored CV section on the review page. Local only: drafting and building make no paid or Gmail call.
const SOURCE = {cv: 'From your CV', selected: 'Selected for this application'};

export function parseProfile(value) { return String(value || '').split(/\n\s*\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean); }
export function parseBullets(value) { return String(value || '').split('\n').map(s => s.replace(/^\s*[-•*]\s*/, '').replace(/\s+/g, ' ').trim()).filter(Boolean); }

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
  const intro = el(doc, 'p', {class: 'tailored-cv-note', text: 'A copy of the selected Word CV with only the summary and the bullets changed. Wording comes from your CV and the achievements selected for this application. Free and local: nothing is sent anywhere, and your original CV is never changed.'});
  const draftButton = el(doc, 'button', {type: 'button', text: 'Draft tailored CV'});
  const checkButton = el(doc, 'button', {type: 'button', text: 'Check all CVs'});
  const report = el(doc, 'div', {'data-tailored-library': '', hidden: ''});
  const status = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-tailored-status': ''});
  const latest = el(doc, 'p', {'data-tailored-latest': ''});
  const editor = el(doc, 'div', {'data-tailored-editor': '', hidden: ''});
  const chooser = el(doc, 'div', {'data-tailored-headings': '', hidden: ''});
  const wordChooser = el(doc, 'div', {'data-tailored-word': '', hidden: ''});
  section.append(el(doc, 'h2', {id: 'tailored-cv-title', text: 'Tailored CV'}), intro, el(doc, 'div', {class: 'actions'}, [draftButton, checkButton]), status, wordChooser, chooser, latest, editor, report);
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
    latest.append(link, doc.createTextNode(' '), saveButton, saveStatus, doc.createTextNode(` Built from ${item.baseName}. It can also go in the Export pack ("Tailored CV").`));
  };

  function render(data) {
    editor.textContent = '';
    const parts = [];
    const profile = el(doc, 'textarea', {id: 'tailored-profile', rows: '7', 'aria-describedby': 'tailored-profile-help'});
    profile.value = data.profile.join('\n\n');
    parts.push(el(doc, 'label', {for: 'tailored-profile', text: `${data.sections.profile.heading} (blank line between paragraphs)`}), profile,
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
      bullets = el(doc, 'textarea', {id: 'tailored-achievements', rows: '9', 'aria-describedby': 'tailored-achievements-help'});
      bullets.value = data.achievements.map(x => x.text).join('\n');
      const list = el(doc, 'ul', {'data-tailored-suggestions': ''});
      for (const item of data.suggestions) {
        const add = el(doc, 'button', {type: 'button', text: 'Add'});
        add.addEventListener('click', () => { bullets.value = (bullets.value.trim() ? bullets.value.trim() + '\n' : '') + item.text; add.disabled = true; });
        list.append(el(doc, 'li', {}, [add, doc.createTextNode(' ' + item.text + ' '), el(doc, 'small', {text: '(' + (SOURCE[item.source] || item.source) + ')'})]));
      }
      parts.push(el(doc, 'label', {for: 'tailored-achievements', text: `${data.sections.achievements.heading} (one bullet per line)`}), bullets,
        el(doc, 'p', {id: 'tailored-achievements-help', class: 'tailored-cv-note', text: 'Ordered by relevance to this job. Bullet style and fonts are copied from your CV.'}),
        ...(data.suggestions.length ? [el(doc, 'p', {text: 'More evidence you can add:'}), list] : []));
    }
    if (data.roles.length) parts.push(el(doc, 'h3', {text: `${data.sections.experience.heading}: bullets for each employer`}),
      el(doc, 'p', {class: 'tailored-cv-note', text: 'Most relevant first. One bullet per line; delete a line to leave it out. Employers, titles and dates stay as in your CV, and a bullet cannot move to another employer. Unchanged bullets keep their exact formatting.'}));
    const roleBoxes = data.roles.map((role, i) => {
      const box = el(doc, 'textarea', {id: 'tailored-role-' + i, rows: String(Math.min(8, Math.max(3, role.bullets.length + 1))), 'data-tailored-role': String(i)});
      box.value = role.bullets.map(x => x.text).join('\n');
      const original = el(doc, 'button', {type: 'button', text: 'Back to CV order'});
      const cvOrder = data.roleOrder?.[i];
      if (cvOrder) original.addEventListener('click', () => { box.value = cvOrder.join('\n'); }); else original.hidden = true;
      parts.push(el(doc, 'label', {for: box.id, text: role.title}), box, el(doc, 'div', {class: 'tailored-role-actions'}, [original]));
      return box;
    });
    const build = el(doc, 'button', {type: 'button', text: 'Build tailored CV (DOCX)'});
    const message = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-tailored-build-status': ''});
    build.addEventListener('click', async () => {
      build.disabled = true; message.textContent = 'Checking wording and building the Word file…';
      try {
        const body = {profile: parseProfile(profile.value), expectedSha256: data.baseSha256, expectedRoleCode: data.roleCode, ...(data.chosen || {}), ...(data.word?.match === 'chosen' ? {wordFile: data.word.name} : {})};
        if (bullets) body.achievements = parseBullets(bullets.value);
        if (roleBoxes.length) body.roles = roleBoxes.map(box => parseBullets(box.value));
        const response = await fetchImpl(api, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Tailored CV was not built.');
        message.textContent = `Tailored CV version ${result.tailored.version} built.`;
        showLatest(result.tailored);
      } catch (error) { message.textContent = error.message; } finally { build.disabled = false; }
    });
    editor.append(...parts, el(doc, 'div', {class: 'actions'}, [build]), message);
    editor.hidden = false;
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
