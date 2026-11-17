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
  const intro = el(doc, 'p', {class: 'tailored-cv-note', text: 'A copy of the selected Word CV with only the Profile and Key achievements sections changed. Wording comes from your CV and the achievements selected for this application. Free and local: nothing is sent anywhere, and your original CV is never changed.'});
  const draftButton = el(doc, 'button', {type: 'button', text: 'Draft tailored CV'});
  const status = el(doc, 'p', {role: 'status', 'aria-live': 'polite', 'data-tailored-status': ''});
  const latest = el(doc, 'p', {'data-tailored-latest': ''});
  const editor = el(doc, 'div', {'data-tailored-editor': '', hidden: ''});
  const chooser = el(doc, 'div', {'data-tailored-headings': '', hidden: ''});
  section.append(el(doc, 'h2', {id: 'tailored-cv-title', text: 'Tailored CV'}), intro, el(doc, 'div', {class: 'actions'}, [draftButton]), status, chooser, latest, editor);
  const anchor = doc.querySelector('.panel--decision') || doc.getElementById('email-domain-resolution');
  if (anchor?.parentNode) anchor.after(section); else (doc.querySelector('main') || doc.body).append(section);

  let draft = null;
  // Remembered per CV in this browser, so each CV's heading names are chosen once.
  const KEY = code => 'jobapp.cvHeadings.' + code;
  const remembered = code => { try { return JSON.parse(doc.defaultView?.localStorage?.getItem(KEY(code)) || '{}') || {}; } catch { return {}; } };
  const remember = (code, value) => { try { doc.defaultView?.localStorage?.setItem(KEY(code), JSON.stringify(value)); } catch {} };
  const cvCode = () => doc.querySelector('input[name="selectedCvRoleCode"]:checked')?.value || draft?.roleCode || '';

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
    retry.addEventListener('click', () => { remember(data.roleCode, {profileHeading: ps.value, achievementsHeading: as.value}); runDraft({profileHeading: ps.value, achievementsHeading: as.value}); });
    chooser.append(el(doc, 'p', {class: 'tailored-cv-note', text: data.headings.length ? 'Headings found in your Word CV:' : 'No heading-like lines were found in your Word CV.'}), pl, ps, al, as, el(doc, 'div', {class: 'actions'}, [retry]));
    chooser.hidden = !data.headings.length;
  }

  const showLatest = item => {
    latest.textContent = '';
    if (!item) return;
    const link = el(doc, 'a', {href: api + '/' + item.version + '.docx', 'data-tailored-download': '', text: `Download tailored CV (version ${item.version}, DOCX)`});
    latest.append(link, doc.createTextNode(` Built from ${item.baseName}. It can also go in the Export pack ("Tailored CV").`));
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
        const body = {profile: parseProfile(profile.value), expectedSha256: data.baseSha256, expectedRoleCode: data.roleCode, ...(data.chosen || {})};
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

  async function runDraft(headings) {
    draftButton.disabled = true; status.textContent = 'Reading the Word version of your CV…';
    try {
      const query = new URLSearchParams(Object.entries(headings || {}).filter(([, v]) => v)).toString();
      const response = await fetchImpl(api + (query ? '?' + query : ''), {cache: 'no-store'});
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not draft a tailored CV.');
      draft = data; showLatest(data.latest);
      if (!data.ready) { editor.hidden = true; status.textContent = data.message; showChooser(data); return; }
      chooser.hidden = true;
      const sec = data.sections, found = [`"${sec.profile.heading}"`];
      if (sec.achievements?.supported) found.push(`"${sec.achievements.heading}"`);
      if (sec.experience?.supported) found.push(`"${sec.experience.heading}" (${sec.experience.roles} employers)`);
      status.textContent = `Drafted from ${data.baseName} (CV ${data.roleCode}). Found ${found.join(' and ')}. Check the wording, then build.`;
      render(data);
    } catch (error) { status.textContent = error.message; } finally { draftButton.disabled = false; }
  }
  draftButton.addEventListener('click', () => runDraft(remembered(cvCode())));

  doc.addEventListener('change', event => {
    if (event.target?.name === 'selectedCvRoleCode' && draft && event.target.value !== draft.roleCode) {
      editor.hidden = true; chooser.hidden = true; draft = null; status.textContent = 'The CV selection changed. Apply it, then draft again.';
    }
  });
  return section;
}

if (typeof document !== 'undefined') {
  const start = () => attachTailoredCvControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
