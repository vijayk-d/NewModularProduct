import { createServer } from 'node:http';

const MAX_FORM_BODY_BYTES = 64 * 1024;

function sendHtml(response, statusCode, html) {
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

function sendText(response, statusCode, text, headers = {}) {
  response.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
    ...headers
  });

  response.end(text);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function splitValues(value = '', separator) {
  return String(value)
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeFormData(values) {
  return {
    jobTitle: String(values.get('jobTitle') || '').trim(),
    recruiterName: String(values.get('recruiterName') || '').trim(),
    jobAdvertLink: String(values.get('jobAdvertLink') || '').trim(),
    jobReference: String(values.get('jobReference') || '').trim(),
    preferredRoleCodes: splitValues(
      values.get('preferredRoleCodes'),
      ','
    ),
    jobDescriptionText: String(
      values.get('jobDescriptionText') || ''
    ).trim(),
    cvHighlights: splitValues(values.get('cvHighlights'), /\r?\n/)
  };
}

function formValues(formData = {}) {
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

function validationErrors(formData) {
  const errors = [];

  if (!formData.jobTitle) {
    errors.push('Job title is required.');
  }

  if (!formData.jobDescriptionText) {
    errors.push('Job description is required.');
  }

  return errors;
}

function renderField(name, label, value, options = {}) {
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

function renderApplicationForm({
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
${errorSummary}    <form method="post" action="/applications">
${renderField('jobTitle', 'Job title', values.jobTitle, { required: true })}
${renderField('recruiterName', 'Recruiter or hiring manager', values.recruiterName)}
${renderField('jobAdvertLink', 'Job advert URL', values.jobAdvertLink, { type: 'url' })}
${renderField('jobReference', 'Vacancy reference', values.jobReference)}
${renderField('preferredRoleCodes', 'Preferred CV role codes', values.preferredRoleCodes, { placeholder: 'SM, ADL' })}
${renderField('jobDescriptionText', 'Job description', values.jobDescriptionText, { required: true, textarea: true })}
${renderField('cvHighlights', 'CV highlights', values.cvHighlights, { placeholder: 'One truthful, role-relevant item per line', textarea: true })}
      <button type="submit">Generate application</button>
    </form>

    <p class="notice">This local tool does not send email. Review and send manually.</p>
  </main>
</body>
</html>`;
}

function renderAdvertLink(value = '') {
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

function renderOptionalDetail(label, value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  return `    <p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(text)}</p>
`;
}

function renderApplicationReview({
  formData,
  prepared
}) {
  const bestCv = prepared.recommendation?.bestCv || {};
  const alternativeCv = prepared.recommendation?.alternativeCv || null;
  const atsScore = prepared.recommendation?.ats?.score;
  const plainText = prepared.coverLetter?.plainText || '';
  const subject = prepared.coverLetter?.subject || '';
  const role = prepared.jobDescription?.role || formData.jobTitle;
  const location = prepared.jobDescription?.location || 'Not specified';

  const alternative = alternativeCv
    ? `<p><strong>Alternative CV:</strong> ${escapeHtml(alternativeCv.role_name || alternativeCv.role_code || 'Available')}</p>`
    : '';

  const score = Number.isFinite(atsScore)
    ? `<p><strong>ATS score:</strong> ${escapeHtml(atsScore)}</p>`
    : '';

  const recruiter = renderOptionalDetail(
    'Recruiter or hiring manager',
    formData.recruiterName
  );

  const reference = renderOptionalDetail(
    'Vacancy reference',
    formData.jobReference
  );

  const advert = formData.jobAdvertLink
    ? `    <p><strong>Job advert:</strong> ${renderAdvertLink(formData.jobAdvertLink)}</p>
`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Application review</title>
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

    .notice {
      padding: 1rem;
      border-left: 0.25rem solid #2563eb;
      background: #eff6ff;
      color: #475569;
      line-height: 1.5;
    }

    .draft {
      box-sizing: border-box;
      width: 100%;
      min-height: 18rem;
      resize: vertical;
      padding: 1rem;
      border: 1px solid #d7deea;
      border-radius: 0.4rem;
      background: #f8fafc;
      font: inherit;
      line-height: 1.5;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      margin: 1rem 0;
    }

    button {
      padding: 0.7rem 1rem;
      border: 0;
      border-radius: 0.4rem;
      background: #2563eb;
      color: #ffffff;
      cursor: pointer;
      font: inherit;
    }

    a {
      color: #1d4ed8;
    }

    #copy-status {
      min-height: 1.5rem;
      color: #475569;
    }
  </style>
</head>
<body>
  <main>
    <h1>Application review</h1>
    <p>Review the prepared local draft before you send anything manually.</p>

    <h2>Vacancy details</h2>
    <p><strong>Role:</strong> ${escapeHtml(role)}</p>
    <p><strong>Location:</strong> ${escapeHtml(location)}</p>
${recruiter}${reference}${advert}
    <h2>Recommendation</h2>
    <p><strong>Recommended CV:</strong> ${escapeHtml(bestCv.role_name || bestCv.role_code || 'Not available')}</p>
${alternative}
${score}
    <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>

    <h2>Cover letter draft</h2>
    <label for="cover-letter-draft">Generated cover letter</label>
    <textarea id="cover-letter-draft" class="draft" readonly>${escapeHtml(plainText)}</textarea>

    <div class="actions">
      <button id="copy-cover-letter" type="button">Copy cover letter</button>
      <span id="copy-status" role="status" aria-live="polite"></span>
    </div>

    <p><a href="/">Prepare another application</a></p>
    <p class="notice">This local tool does not send email. Review and send manually.</p>
  </main>

  <script nonce="__SCRIPT_NONCE__">
    const copyButton = document.getElementById('copy-cover-letter');
    const draft = document.getElementById('cover-letter-draft');
    const copyStatus = document.getElementById('copy-status');

    function selectDraftForManualCopy() {
      draft.focus();
      draft.select();
      copyStatus.textContent = 'Cover letter selected. Copy it manually.';
    }

    copyButton.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          selectDraftForManualCopy();
          return;
        }

        const copied = await Promise.race([
          navigator.clipboard.writeText(draft.value).then(() => true),
          new Promise((resolve) => {
            window.setTimeout(() => resolve(false), 500);
          })
        ]);

        if (!copied) {
          selectDraftForManualCopy();
          return;
        }

        copyStatus.textContent = 'Cover letter copied to clipboard.';
      } catch {
        selectDraftForManualCopy();
      }
    });
  </script>
</body>
</html>`;
}

async function readFormBody(request) {
  const contentType = String(request.headers['content-type'] || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();

  if (contentType !== 'application/x-www-form-urlencoded') {
    return {
      error: {
        statusCode: 415,
        message: 'Unsupported Media Type'
      }
    };
  }

  let body = '';
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > MAX_FORM_BODY_BYTES) {
      return {
        error: {
          statusCode: 413,
          message: 'Payload Too Large'
        }
      };
    }

    body += chunk;
  }

  return {
    values: new URLSearchParams(body)
  };
}

export function createLocalServer({
  prepareApplication = async () => {
    throw new Error('Application preparation is not configured.');
  }
} = {}) {
  return createServer(async (request, response) => {
    const method = request.method || 'GET';
    const url = new URL(request.url || '/', 'http://localhost');

    if (method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, renderApplicationForm());
      return;
    }

    if (method === 'POST' && url.pathname === '/applications') {
      const formBody = await readFormBody(request);

      if (formBody.error) {
        sendText(
          response,
          formBody.error.statusCode,
          formBody.error.message
        );
        return;
      }

      const formData = normalizeFormData(formBody.values);
      const errors = validationErrors(formData);

      if (errors.length) {
        sendHtml(
          response,
          400,
          renderApplicationForm({
            formData,
            errors
          })
        );
        return;
      }

      try {
        const prepared = await prepareApplication({
          jobDescriptionText: formData.jobDescriptionText,
          jobDescriptionOverrides: {
            role: formData.jobTitle
          },
          recruiterName: formData.recruiterName,
          jobAdvertLink: formData.jobAdvertLink,
          jobReference: formData.jobReference,
          preferredRoleCodes: formData.preferredRoleCodes,
          cvHighlights: formData.cvHighlights
        });

        sendHtml(
          response,
          200,
          renderApplicationReview({
            formData,
            prepared
          })
        );
      } catch {
        sendHtml(
          response,
          500,
          renderApplicationForm({
            errors: [
              'The local application could not be prepared. Check local configuration and try again.'
            ]
          })
        );
      }

      return;
    }

    if (method !== 'GET' && method !== 'POST') {
      sendText(response, 405, 'Method Not Allowed', {
        allow: 'GET, POST'
      });
      return;
    }

    sendText(response, 404, 'Not Found');
  });
}
