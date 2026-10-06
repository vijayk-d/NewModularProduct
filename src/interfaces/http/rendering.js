import crypto from 'node:crypto';

export function sendHtml(response, statusCode, html) {
  const scriptNonce = crypto.randomUUID().replaceAll('-', '');

  const document = html.replaceAll('__SCRIPT_NONCE__', scriptNonce);

  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'nonce-${scriptNonce}'; base-uri 'none'; form-action 'self'`,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer'
  });

  response.end(document);
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderField(name, label, value, options = {}) {
  const {
    type = 'text',
    required = false,
    placeholder = '',
    textarea = false
  } = options;

  const requiredAttribute = required ? ' required' : '';
  const placeholderAttribute = placeholder
    ? ` placeholder="${escapeHtml(placeholder)}"`
    : '';

  if (textarea) {
    return `      <label>
        ${escapeHtml(label)}
        <textarea name="${escapeHtml(name)}"${requiredAttribute}${placeholderAttribute}>${escapeHtml(value)}</textarea>
      </label>`;
  }

  return `      <label>
        ${escapeHtml(label)}
        <input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}"${requiredAttribute}${placeholderAttribute}>
      </label>`;
}

export function renderApplicationForm({
  formData = {},
  errors = []
} = {}) {
  const values = formValues(formData);
  const errorSummary = errors.length
    ? `    <div class="errors" role="alert">
      <p>Please correct the following:</p>
      <ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>
    </div>
`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Application preparation</title>
  <style>
    :root {
      color-scheme: light;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      background: #f5f7fb;
      color: #152033;
    }

    body {
      margin: 0;
      padding: 2rem 1rem;
    }

    main {
      max-width: 52rem;
      margin: 0 auto;
      padding: 2rem;
      background: #ffffff;
      border: 1px solid #d7deea;
      border-radius: 0.75rem;
      box-shadow: 0 0.5rem 1.5rem rgb(21 32 51 / 8%);
    }

    h1,
    h2 {
      margin-top: 0;
    }

    .intro,
    .notice {
      color: #475569;
      line-height: 1.5;
    }

    .notice {
      padding: 1rem;
      border-left: 0.25rem solid #2563eb;
      background: #eff6ff;
    }

    .errors {
      padding: 1rem;
      border-left: 0.25rem solid #b91c1c;
      background: #fef2f2;
      color: #7f1d1d;
    }

    form {
      display: grid;
      gap: 1rem;
    }

    label {
      display: grid;
      gap: 0.4rem;
      font-weight: 600;
    }

    input,
    textarea,
    button {
      font: inherit;
    }

    input,
    textarea {
      box-sizing: border-box;
      width: 100%;
      padding: 0.65rem;
      border: 1px solid #94a3b8;
      border-radius: 0.4rem;
      background: #ffffff;
    }

    textarea {
      min-height: 8rem;
      resize: vertical;
    }

    button {
      justify-self: start;
      padding: 0.7rem 1rem;
      border: 0;
      border-radius: 0.4rem;
      background: #2563eb;
      color: #ffffff;
      cursor: pointer;
    }

    .form-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }

    .secondary-button {
      background: #475569;
    }

    pre {
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      padding: 1rem;
      border: 1px solid #d7deea;
      border-radius: 0.4rem;
      background: #f8fafc;
    }
  </style>
</head>
<body>
  <main>
    <h1>Application preparation</h1>
    <p class="intro">Prepare and review a local application draft before manually sending it.</p>
${errorSummary}    <form id="application-form" method="post" action="/applications" autocomplete="on">
${renderField('jobTitle', 'Job title', values.jobTitle, { required: true })}
${renderField('organisationUrl', 'Organisation website or LinkedIn page', values.organisationUrl, { type: 'url' })}
${renderField('organisationName', 'Organisation name', values.organisationName)}
${renderField('stakeholderSource', 'Stakeholder source or recruiter page', values.stakeholderSource, {
  placeholder: 'Recruiter name or relevant source URL'
})}
${renderField('jobAdvertLink', 'Job advert URL', values.jobAdvertLink, { type: 'url' })}
${renderField('jobReference', 'Vacancy reference', values.jobReference)}
${renderField('preferredRoleCodes', 'Preferred CV role codes', values.preferredRoleCodes, { placeholder: 'SM, ADL' })}
${renderField('jobDescriptionText', 'Job description', values.jobDescriptionText, { required: true, textarea: true })}
${renderField('cvHighlights', 'CV highlights', values.cvHighlights, { placeholder: 'One truthful, role-relevant item per line', textarea: true })}
      <div class="form-actions">
        <button type="submit">Generate application</button>
        <button id="clear-saved-form" type="button" class="secondary-button">Clear saved test data</button>
      </div>
    </form>

    <p class="notice">This local tool does not send email. Review and send manually.</p>
  </main>
  <script nonce="__SCRIPT_NONCE__">
    const storageKey = 'application-form-draft-v1';
    const form = document.getElementById('application-form');
    const clearButton = document.getElementById('clear-saved-form');

    const fieldNames = [
      'jobTitle',
      'organisationUrl',
      'organisationName',
      'stakeholderSource',
      'jobAdvertLink',
      'jobReference',
      'preferredRoleCodes',
      'jobDescriptionText',
      'cvHighlights'
    ];

    const organisationUrlField = form.elements.namedItem('organisationUrl');
    const organisationNameField = form.elements.namedItem('organisationName');
    const stakeholderSourceField = form.elements.namedItem('stakeholderSource');

    function normalizeLinkedInCompanyUrl(value) {
      const text = String(value || '').trim();

      if (!text) {
        return null;
      }

      let url;

      try {
        url = new URL(text);
      } catch {
        return null;
      }

      const hostname = url.hostname.toLowerCase()
        .replace(/^www\./, '');

      if (hostname !== 'linkedin.com') {
        return null;
      }

      const segments = url.pathname
        .split('/')
        .filter(Boolean);

      if (segments[0]?.toLowerCase() !== 'company' || !segments[1]) {
        return null;
      }

      const slug = decodeURIComponent(segments[1]).trim();

      if (!slug) {
        return null;
      }

      const page = String(segments[2] || '').toLowerCase();

      return {
        slug,
        companyUrl:
          'https://www.linkedin.com/company/' + encodeURIComponent(slug),
        peopleUrl:
          'https://www.linkedin.com/company/' +
          encodeURIComponent(slug) +
          '/people'
      };
    }

    function applyLinkedInCompanyDetails() {
      const normalized = normalizeLinkedInCompanyUrl(
        organisationUrlField?.value
      );

      if (!normalized) {
        return;
      }

      if (organisationUrlField) {
        organisationUrlField.value = normalized.companyUrl;
      }

      if (organisationNameField && !organisationNameField.value.trim()) {
        organisationNameField.value = normalized.slug;
      }

      if (
        stakeholderSourceField &&
        normalized.peopleUrl &&
        !stakeholderSourceField.value.trim()
      ) {
        stakeholderSourceField.value = normalized.peopleUrl;
      }

      saveDraft();
    }

    function readSavedDraft() {
      try {
        const value = window.localStorage.getItem(storageKey);

        return value ? JSON.parse(value) : {};
      } catch {
        return {};
      }
    }

    function saveDraft() {
      const draft = {};

      for (const name of fieldNames) {
        const field = form.elements.namedItem(name);

        if (field) {
          draft[name] = field.value;
        }
      }

      try {
        window.localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        // Local storage may be unavailable or full. Form submission still works.
      }
    }

    function restoreDraft() {
      const draft = readSavedDraft();

      for (const name of fieldNames) {
        const field = form.elements.namedItem(name);

        if (field && !field.value && typeof draft[name] === 'string') {
          field.value = draft[name];
        }
      }
    }

    restoreDraft();
    applyLinkedInCompanyDetails();

    organisationUrlField?.addEventListener(
      'change',
      applyLinkedInCompanyDetails
    );

    organisationUrlField?.addEventListener(
      'blur',
      applyLinkedInCompanyDetails
    );

    form.addEventListener('input', saveDraft);

    clearButton.addEventListener('click', () => {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Clearing local storage is best effort.
      }

      form.reset();
    });
  </script>
</body>
</html>`;
}

export function formValues(formData = {}) {
  return {
    ...formData,
    preferredRoleCodes: Array.isArray(formData.preferredRoleCodes)
      ? formData.preferredRoleCodes.join(', ')
      : String(formData.preferredRoleCodes || ''),
    cvHighlights: Array.isArray(formData.cvHighlights)
      ? formData.cvHighlights.join('\n')
      : String(formData.cvHighlights || '')
  };
}

export function renderAdvertLink(value = '') {
  const text = String(value).trim();

  if (!text) {
    return '';
  }

  try {
    const url = new URL(text);

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(url.href)}</a>`;
    }
  } catch {
    // Render invalid URLs as plain text below.
  }

  return escapeHtml(text);
}