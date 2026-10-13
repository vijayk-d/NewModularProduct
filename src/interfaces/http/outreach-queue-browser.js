function startOutreachQueue() {
  if (document.__outreachQueueAttached) return;
  document.__outreachQueueAttached = true;
  const main = document.querySelector('main');
  if (!main) return;
  const section = document.createElement('section');
  section.className = 'review-section outreach-queue-section';
  section.innerHTML = `<h2>Outreach queue</h2>
    <p>Queued messages are snapshots. Later cover-letter edits do not change them.
    Gmail drafting and sending are not enabled. <a href="/outreach-queue">Open standalone queue</a></p>
    <button type="button" data-queue-action="refresh">Refresh queue</button>
    <button type="button" data-queue-action="prepare-drafts">Prepare selected draft payloads</button>
    <pre class="prepared-draft-payloads" hidden></pre>
    <button type="button" data-queue-action="delete">Delete selected</button>
    <button type="button" data-queue-action="clear">Clear queue</button>
    <p class="outreach-queue-status" role="status" aria-live="polite"></p>
    <table><thead><tr><th><input type="checkbox" aria-label="Select all queue items" class="queue-select-all"></th>
    <th>Name</th><th>Role</th><th>Email</th><th>Status</th><th>Last outcome</th><th>Message</th></tr></thead>
    <tbody class="outreach-queue-body"></tbody></table>`;
  main.appendChild(section);
  const status = section.querySelector('.outreach-queue-status');
  const tbody = section.querySelector('tbody');
  const textCell = (row, value) => { const td = row.insertCell(); td.textContent = value || ''; return td; };
  async function request(url, payload) {
    const response = await fetch(url, payload === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Queue request failed.');
    return result;
  }
  async function refresh() {
    const { items } = await request('/api/outreach-queue');
    tbody.replaceChildren();
    for (const item of items) {
      const row = tbody.insertRow();
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
      checkbox.className = 'outreach-queue-checkbox'; checkbox.value = item.id;
      checkbox.setAttribute('aria-label', `Select queued recipient ${item.fullName || item.email}`);
      row.insertCell().appendChild(checkbox);
      textCell(row, item.fullName); textCell(row, item.role);
      textCell(row, `${item.email} (${item.verified ? 'verified' : item.emailSource || 'unknown'})`);
      textCell(row, item.status); textCell(row, item.lastOutcome);
      const details = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = 'Review message';
      const subject = document.createElement('p'); subject.textContent = `Subject: ${item.subject}`;
      const body = document.createElement('pre'); body.textContent = item.bodyPlainText;
      const context = document.createElement('p');
      context.textContent = `${item.application?.organisationName || ''} — ${item.application?.jobTitle || ''}`;
      details.append(summary, context, subject, body);
      if(item.bodyHtml) {
        const frame=document.createElement('iframe');frame.setAttribute('sandbox','');frame.title='Formatted queued message';
        frame.srcdoc=`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><body>${item.bodyHtml}</body>`;
        details.appendChild(frame);
      } row.insertCell().appendChild(details);
    }
    if (!items.length) { const td = tbody.insertRow().insertCell(); td.colSpan = 7; td.textContent = 'No recipients queued.'; }
    section.querySelector('.queue-select-all').checked = false;
    return items.length;
  }
  function recipientSelectors() {
    const linkedBody = document.querySelector('.linked-imported-contacts-body');
    if (!linkedBody) return;
    for (const row of [...linkedBody.querySelectorAll('tr')]) {
      if (row.dataset.outreachEmailRow === 'true') continue;
      const cell = row.querySelector('.contact-email-cell');
      const box = row.querySelector('.linked-contact-checkbox');
      if (!cell || !box) continue;
      const emails = [...new Set([...cell.querySelectorAll('a[href^="mailto:"]')]
        .map(link => link.textContent.trim()).filter(Boolean))];
      const template = row.cloneNode(true);
      let insertAfter = row;
      for (const [index, email] of (emails.length ? emails : ['']).entries()) {
        const emailRow = index === 0 ? row : template.cloneNode(true);
        emailRow.dataset.outreachEmailRow = 'true';
        emailRow.dataset.outreachEmail = email;
        const emailCell = emailRow.querySelector('.contact-email-cell');
        emailCell.replaceChildren();
        if (email) {
          const link = document.createElement('a');
          link.href = `mailto:${email}`; link.textContent = email;
          emailCell.appendChild(link);
        } else {
          emailCell.textContent = 'No email available — cannot queue';
        }
        const checkbox = emailRow.querySelector('.linked-contact-checkbox');
        checkbox.checked = false;
        const name = emailRow.querySelectorAll('td')[1]?.textContent.trim() || checkbox.value;
        checkbox.setAttribute('aria-label', `Select linked contact ${name}${email ? ' ' + email : ''}`);
        if (index !== 0) row.parentNode.insertBefore(emailRow, insertAfter.nextSibling);
        insertAfter = emailRow;
      }
    }
  }
  const actions = document.querySelector('.linked-contact-actions');
  if (actions) {
    const add = document.createElement('button'); add.type = 'button'; add.textContent = 'Add selected to queue';
    add.className = 'add-selected-outreach-button'; actions.appendChild(add);
    add.addEventListener('click', async () => {
      add.disabled = true;
      let saved = false;
      try {
        const selected = [...document.querySelectorAll('.linked-imported-contacts-body .linked-contact-checkbox:checked')];
        if (!selected.length) throw new Error('Select at least one linked contact.');
        const recipients = selected.map(box => ({ contactId: box.value, email: box.closest('tr').dataset.outreachEmail || '' }));
        if (recipients.some(recipient => !recipient.email)) throw new Error('A selected row has no email address. Select email rows only.');
        const reviewId = actions.querySelector('[data-review-id]')?.dataset.reviewId;
        const editor = document.getElementById('cover-letter-draft');
        const bodyPlainText = editor?.innerText || '';
        const bodyHtml = editor?.innerHTML || '';
        const subject = document.getElementById('current-cover-letter-subject')?.value;
        const result = await request('/api/outreach-queue/add', { reviewId, recipients, bodyPlainText, bodyHtml,
          ...(subject === undefined ? {} : {subject}) });
        saved = true;
        selected.forEach(box => { box.checked = false; });
        await refresh();
        status.textContent = `${result.added} added; ${result.duplicates} already queued. Nothing sent.`;
      } catch (error) {
        status.textContent = saved ? 'Queue saved, but refresh failed. Click Refresh queue.' : error.message;
      } finally { add.disabled = false; }
    });
    recipientSelectors();
    const linkedBody = document.querySelector('.linked-imported-contacts-body');
    if (linkedBody) new MutationObserver(recipientSelectors).observe(linkedBody, { childList: true, subtree: true });
  }
  section.querySelector('.queue-select-all').addEventListener('change', event => {
    tbody.querySelectorAll('.outreach-queue-checkbox').forEach(box => { box.checked = event.target.checked; });
  });
  section.addEventListener('click', async event => {
    const button = event.target.closest('[data-queue-action]'); if (!button) return;
    const buttons = [...section.querySelectorAll('[data-queue-action]')];
    if (buttons.some(b => b.disabled)) return;
    let saved = false; let message = '';
    try {
      const action = button.dataset.queueAction;
      if (action === 'clear' && !window.confirm('Clear all queue items? Sent-email history will be kept.')) return;
      const ids = [...tbody.querySelectorAll('.outreach-queue-checkbox:checked')].map(box => box.value);
      if (['delete','prepare-drafts'].includes(action) && !ids.length) throw new Error('Select at least one queue item.');
      buttons.forEach(b => { b.disabled = true; });
      if(action==='prepare-drafts') {
        const result=await request('/api/outreach-queue/prepare-drafts',{ids});
        const preview=section.querySelector('.prepared-draft-payloads');preview.hidden=false;
        preview.textContent=JSON.stringify({action:'draft',drafts:result.drafts},null,2);
        status.textContent=`${result.prepared} draft payload(s) prepared locally. No Gmail drafts created; nothing sent.`;
        return;
      }
      section.querySelector('.prepared-draft-payloads').hidden=true;
      if (action !== 'refresh') {
        const result = await request(`/api/outreach-queue/${action}`, action === 'clear' ? { confirmed: true } : { ids });
        saved = true; message = `${result.deleted} queue item(s) removed. Sent history kept.`;
      }
      const count = await refresh(); status.textContent = message || `${count} queued recipient(s).`;
    } catch (error) { status.textContent = saved ? message + ' Refresh failed; click Refresh queue.' : error.message; }
    finally { buttons.forEach(b => { b.disabled = false; }); }
  });
  refresh().then(count => { status.textContent = `${count} queued recipient(s).`; }).catch(error => { status.textContent = error.message; });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startOutreachQueue, { once: true });
  else startOutreachQueue();
}
