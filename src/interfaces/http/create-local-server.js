import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  acceptRefinedCoverLetter
} from '../../application/accept-refined-cover-letter.js';

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

const reviewStore = new Map();

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
  organisationName: String(values.get('organisationName') || '').trim(),
  organisationUrl: String(values.get('organisationUrl') || '').trim(),
  stakeholderSource: String(
    values.get('stakeholderSource') || values.get('recruiterName') || ''
  ).trim(),
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
${renderField('organisationName', 'Organisation name', values.organisationName)}
${renderField('organisationUrl', 'Organisation website or LinkedIn page', values.organisationUrl, { type: 'url' })}
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
      'organisationName',
      'organisationUrl',
      'stakeholderSource',
      'jobAdvertLink',
      'jobReference',
      'preferredRoleCodes',
      'jobDescriptionText',
      'cvHighlights'
    ];

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

function renderResearchSource(source) {
  const title = String(
    source?.title || source?.url || 'Source'
  ).trim();

  const href = String(source?.url || '').trim();

  if (!href) {
    return `<li>${escapeHtml(title)}</li>`;
  }

  try {
    const url = new URL(href);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return `<li>${escapeHtml(title)}</li>`;
    }

    return `<li><a href="${escapeHtml(url.href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(title)}</a></li>`;
  } catch {
    return `<li>${escapeHtml(title)}</li>`;
  }
}

function renderOrganisationResearch(research, organisationUrl = '') {
  if (!research) {
    return '';
  }

  const status = String(research.status || 'unavailable');
  const provider = String(research.provider || 'Perplexity');
  const researchedAt = String(research.researchedAt || 'Not recorded');

  const summary = status === 'found'
    ? String(research.summary || 'No summary was returned.')
    : String(
        research.error ||
        'Organisation research is currently unavailable.'
      );

  const values = Array.isArray(research.companyValues)
    ? research.companyValues
    : [];

  const sources = Array.isArray(research.sources)
    ? research.sources
    : [];

  let organisationHost = '';

  try {
    organisationHost = new URL(organisationUrl).hostname
      .replace(/^www\./, '')
      .toLowerCase();
  } catch {
    organisationHost = '';
  }

  const officialSources = organisationHost
    ? sources.filter((source) => {
        try {
          const sourceHost = new URL(String(source?.url || '')).hostname
            .replace(/^www\./, '')
            .toLowerCase();

          return sourceHost === organisationHost ||
            sourceHost.endsWith(`.${organisationHost}`);
        } catch {
          return false;
        }
      })
    : [];

  const additionalSources = sources.filter(
    (source) => !officialSources.includes(source)
  );

  const valuesMarkup = values.length
    ? `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`
    : '<p>No distinct values were returned.</p>';

  const officialSourcesMarkup = officialSources.length
    ? `<ul>${officialSources.map(renderResearchSource).join('')}</ul>`
    : '<p>No official organisation sources were identified.</p>';

  const additionalSourcesMarkup = additionalSources.length
    ? `<details>
        <summary>Additional sources (${additionalSources.length})</summary>
        <ul>${additionalSources.map(renderResearchSource).join('')}</ul>
      </details>`
    : '';

  return `
    <section class="research-panel">
      <details open>
        <summary>Research result</summary>

        <p><strong>Provider:</strong> ${escapeHtml(provider)}</p>
        <p><strong>Status:</strong> ${escapeHtml(status)}</p>
        <p><strong>Research time:</strong> ${escapeHtml(researchedAt)}</p>

        <h3>Summary</h3>
        <pre class="research-summary">${escapeHtml(summary)}</pre>

        <h3>Values</h3>
        ${valuesMarkup}

        <h3>Official sources</h3>
        ${officialSourcesMarkup}

        ${additionalSourcesMarkup}
      </details>
    </section>
  `;
}

function getSelectableCompanyValues(research) {
  const values = Array.isArray(research?.companyValues)
    ? research.companyValues
    : [];

  return values
    .map((value, index) => ({
      id: `company-value-${index + 1}`,
      type: 'value',
      text: String(value || '').trim(),
      sourceUrl: ''
    }))
    .filter((value) => value.text);
}

function renderRefinementPanel({
  reviewId,
  research,
  refinementProposal
}) {
  const values = getSelectableCompanyValues(research);

  const selectorMarkup = research?.status === 'found'
    ? values.length
      ? `
        <form method="post" action="/cover-letter-refinement">
          <input type="hidden" name="reviewId" value="${escapeHtml(reviewId)}">
          <fieldset>
            <legend>Select verified organisation values for a proposed refinement</legend>
            ${values.map((value) => `
              <label>
                <input
                  type="checkbox"
                  name="selectedResearchPointIds"
                  value="${escapeHtml(value.id)}">
                ${escapeHtml(value.text)}
              </label>
            `).join('')}
          </fieldset>
          <button type="submit">Polish cover letter</button>
        </form>
      `
      : '<p>No selectable organisation values are available yet. Research can still be reviewed manually.</p>'
    : '<p>Research the organisation successfully before requesting a refinement.</p>';

  const proposalMarkup = refinementProposal?.proposedDraft
    ? `
      <section class="refinement-proposal">
        <h2>Proposed cover-letter refinement</h2>
        <p>This proposal has not changed the current draft.</p>
        <label for="proposed-cover-letter">Proposed cover letter</label>
        <textarea id="proposed-cover-letter" class="draft" readonly>${escapeHtml(refinementProposal.proposedDraft)}</textarea>
        ${
          Array.isArray(refinementProposal.warnings) &&
          refinementProposal.warnings.length
            ? `<h3>Warnings</h3><ul>${refinementProposal.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`
            : ''
        }
        <form method="post" action="/cover-letter-refinement/apply">
          <input type="hidden" name="reviewId" value="${escapeHtml(reviewId)}">
          <button type="submit">Use proposal as current draft</button>
        </form>
      </section>
    `
    : '';

  const warningMarkup =
    !refinementProposal?.proposedDraft &&
    Array.isArray(refinementProposal?.warnings) &&
    refinementProposal.warnings.length
      ? `<div class="errors" role="alert"><ul>${refinementProposal.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></div>`
      : '';

  return `
    <section class="refinement-panel">
      <h2>Polish cover letter</h2>
      <p>Research is reviewed manually first. Any refinement is a proposal and will not alter the current draft automatically.</p>
      ${selectorMarkup}
      ${warningMarkup}
    </section>
    ${proposalMarkup}
  `;
}

function renderApplicationReview({
  formData,
  prepared,
  reviewId = '',
  research = null,
  currentDraftPlainText = '',
  refinementProposal = null
}) {
  const bestCv = prepared.recommendation?.bestCv || {};
  const alternativeCv = prepared.recommendation?.alternativeCv || null;
  const atsScore = prepared.recommendation?.ats?.score;
  const plainText =
    currentDraftPlainText || prepared.coverLetter?.plainText || '';
  const researchMarkup = renderOrganisationResearch(
    research,
    formData.organisationUrl
  );
  const refinementMarkup = renderRefinementPanel({
    reviewId,
    research,
    refinementProposal
  });
  const subject = prepared.coverLetter?.subject || '';
  const role = prepared.jobDescription?.role || formData.jobTitle;
  const location = String(prepared.jobDescription?.location || '').trim() || 'Not specified';

  const alternative = alternativeCv
    ? `<p><strong>Alternative CV:</strong> ${escapeHtml(alternativeCv.role_name || alternativeCv.role_code || 'Available')}</p>`
    : '';

  const score = Number.isFinite(atsScore)
    ? `<p><strong>ATS score:</strong> ${escapeHtml(atsScore)}</p>`
    : '';

  const organisation = renderOptionalDetail(
    'Organisation',
    formData.organisationName
  );

  const organisationUrl = formData.organisationUrl
    ? `    <p><strong>Organisation website or LinkedIn page:</strong> ${renderAdvertLink(formData.organisationUrl)}</p>
  `
    : '';

  const stakeholderSource = formData.stakeholderSource
    ? `    <p><strong>Stakeholder source:</strong> ${renderAdvertLink(formData.stakeholderSource)}</p>
  `
    : '';
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
    ${organisation}${organisationUrl}${stakeholderSource}${reference}${advert}
    <h2>Recommendation</h2>
    <p><strong>Recommended CV:</strong> ${escapeHtml(bestCv.role_name || bestCv.role_code || 'Not available')}</p>
${alternative}
${score}
    <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>

    <section class="research-panel">
      <h2>Organisation research</h2>
      <p>Research is optional. It will not alter the cover letter automatically.</p>
      <form method="post" action="/organisation-research">
        <input type="hidden" name="reviewId" value="${escapeHtml(reviewId)}">
        <input type="hidden" name="organisationName" value="${escapeHtml(formData.organisationName || '')}">
        <input type="hidden" name="organisationUrl" value="${escapeHtml(formData.organisationUrl || '')}">
        <input type="hidden" name="jobTitle" value="${escapeHtml(role)}">
        <button type="submit">Research organisation</button>
      </form>
    </section>

    ${researchMarkup}

    ${refinementMarkup}

    <h2>Cover letter draft</h2>
    ${
      refinementProposal?.appliedMessage
        ? `<p class="notice">${escapeHtml(refinementProposal.appliedMessage)}</p>`
        : ''
    }
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
  },
  researchOrganization = null,
  coverLetterRefinementPort = null
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
        recruiterName: formData.stakeholderSource,
        jobAdvertLink: formData.jobAdvertLink,
        jobReference: formData.jobReference,
        preferredRoleCodes: formData.preferredRoleCodes,
        cvHighlights: formData.cvHighlights
      });

        const reviewId = randomUUID();

      reviewStore.set(reviewId, {
        formData,
        prepared,
        research: null,
        originalDraftPlainText: prepared.coverLetter?.plainText || '',
        currentDraftPlainText: prepared.coverLetter?.plainText || '',
        refinementProposal: null,
        createdAt: Date.now()
      });

      sendHtml(
        response,
        200,
        renderApplicationReview({
          formData,
          prepared,
          reviewId
        })
      );
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : 'Unknown application preparation error';

        process.stderr.write(
          `[LOCAL_DIAGNOSTICS] application_prepare_failed ` +
          `errorType=${error?.name || 'UnknownError'} ` +
          `message=${JSON.stringify(message)}\n`
        );

        sendHtml(
          response,
          500,
          renderApplicationForm({
            errors: [
              'The local application could not be prepared. Check the local server terminal for a diagnostic message, then try again.'
            ]
          })
        );
      }

      return;
    }

    if (method === 'POST' && url.pathname === '/organisation-research') {
      const formBody = await readFormBody(request);

      if (formBody.error) {
        sendText(
          response,
          formBody.error.statusCode,
          formBody.error.message
        );
        return;
      }

      const reviewId = String(
        formBody.values.get('reviewId') || ''
      ).trim();

      const review = reviewStore.get(reviewId);

      if (!review) {
        sendHtml(
          response,
          410,
          renderApplicationForm({
            errors: [
              'This application review is no longer available. Please prepare the application again.'
            ]
          })
        );
        return;
      }

      const companyName = String(
        review.formData.organisationName || ''
      ).trim();

      const companyUrl = String(
        review.formData.organisationUrl || ''
      ).trim();

      const jobTitle = String(
        review.formData.jobTitle || ''
      ).trim();

      if (!companyName) {
        sendHtml(
          response,
          400,
          renderApplicationReview({
            formData: review.formData,
            prepared: review.prepared,
            reviewId,
            research: {
              status: 'error',
              provider: 'Perplexity',
              researchedAt: new Date().toISOString(),
              error: 'Organisation name is required for organisation research.'
            }
          })
        );
        return;
      }

      if (typeof researchOrganization !== 'function') {
        sendHtml(
          response,
          503,
          renderApplicationReview({
            formData: review.formData,
            prepared: review.prepared,
            reviewId,
            research: {
              status: 'error',
              provider: 'Perplexity',
              researchedAt: new Date().toISOString(),
              error: 'Organisation research is disabled. Set ENABLE_PERPLEXITY_RESEARCH=true and restart the local server.'
            }
          })
        );
        return;
      }

      let research;

      try {
        research = await researchOrganization({
          companyName,
          companyUrl,
          jobDescriptionSummary: jobTitle,
          forceRefresh: false
        });
      } catch (error) {
        research = {
          status: 'error',
          provider: 'Perplexity',
          researchedAt: new Date().toISOString(),
          error: error instanceof Error
            ? error.message
            : 'Organisation research failed unexpectedly.'
        };
      }

      reviewStore.set(reviewId, {
        ...review,
        research,
        researchedAt: Date.now()
      });

      sendHtml(
        response,
        200,
        renderApplicationReview({
          formData: review.formData,
          prepared: review.prepared,
          reviewId,
          research,
          currentDraftPlainText: review.currentDraftPlainText,
          refinementProposal: review.refinementProposal
        })
      );
      return;
    }

    if (method === 'POST' && url.pathname === '/cover-letter-refinement') {
      const formBody = await readFormBody(request);

      if (formBody.error) {
        sendText(
          response,
          formBody.error.statusCode,
          formBody.error.message
        );
        return;
      }

      const reviewId = String(
        formBody.values.get('reviewId') || ''
      ).trim();

      const review = reviewStore.get(reviewId);

      if (!review) {
        sendHtml(
          response,
          410,
          renderApplicationForm({
            errors: [
              'This application review is no longer available. Please prepare the application again.'
            ]
          })
        );
        return;
      }

      const renderReview = (statusCode, refinementProposal = null) => {
        sendHtml(
          response,
          statusCode,
          renderApplicationReview({
            formData: review.formData,
            prepared: review.prepared,
            reviewId,
            research: review.research,
            currentDraftPlainText: review.currentDraftPlainText,
            refinementProposal
          })
        );
      };

      if (typeof coverLetterRefinementPort?.refine !== 'function') {
        renderReview(503, {
          proposedDraft: '',
          warnings: [
            'Cover-letter refinement is disabled. Enable ENABLE_COVER_LETTER_REFINEMENT and restart the local server.'
          ]
        });
        return;
      }

      if (!review.research || review.research.status !== 'found') {
        renderReview(400, {
          proposedDraft: '',
          warnings: [
            'Research the organisation successfully before requesting a refinement.'
          ]
        });
        return;
      }

      const selectedIds = formBody.values
        .getAll('selectedResearchPointIds')
        .map((value) => String(value).trim())
        .filter(Boolean);

      const selectedResearchPoints = getSelectableCompanyValues(
        review.research
      ).filter((point) => selectedIds.includes(point.id));

      if (!selectedResearchPoints.length) {
        renderReview(400, {
          proposedDraft: '',
          warnings: [
            'Select at least one verified organisation value before requesting a refinement.'
          ]
        });
        return;
      }

      let refinementProposal;

      try {
        refinementProposal = await coverLetterRefinementPort.refine({
          draftPlainText: review.currentDraftPlainText,
          jobDescriptionSummary: review.formData.jobTitle,
          selectedCvHighlights: Array.isArray(review.formData.cvHighlights)
            ? review.formData.cvHighlights
                .map((highlight) => String(highlight ?? '').trim())
                .filter((highlight) =>
                  highlight && highlight.toLowerCase() !== 'null'
                )
            : [],
          companyValues: selectedResearchPoints.map((point) => point.text),
          selectedResearchPoints,
          organisationUrl: review.formData.organisationUrl,
          instructions: '',
          maxWords: 450
        });
      } catch {
        refinementProposal = {
          proposedDraft: '',
          warnings: [
            'Cover-letter refinement is currently unavailable.'
          ]
        };
      }

      reviewStore.set(reviewId, {
        ...review,
        refinementProposal
      });

      renderReview(200, refinementProposal);
      return;
    }

    if (method === 'POST' && url.pathname === '/cover-letter-refinement/apply') {
      const formBody = await readFormBody(request);

      if (formBody.error) {
        sendText(
          response,
          formBody.error.statusCode,
          formBody.error.message
        );
        return;
      }

      const reviewId = String(
        formBody.values.get('reviewId') || ''
      ).trim();

      const review = reviewStore.get(reviewId);

      if (!review) {
        sendHtml(
          response,
          410,
          renderApplicationForm({
            errors: [
              'This application review is no longer available. Please prepare the application again.'
            ]
          })
        );
        return;
      }

      const proposedDraftPlainText = String(
        review.refinementProposal?.proposedDraft || ''
      ).trim();

      if (!proposedDraftPlainText) {
        sendHtml(
          response,
          400,
          renderApplicationReview({
            formData: review.formData,
            prepared: review.prepared,
            reviewId,
            research: review.research,
            currentDraftPlainText: review.currentDraftPlainText,
            refinementProposal: {
              proposedDraft: '',
              warnings: [
                'There is no refinement proposal available to apply.'
              ]
            }
          })
        );
        return;
      }

      let acceptance;

      try {
        acceptance = acceptRefinedCoverLetter({
          originalDraftPlainText: review.currentDraftPlainText,
          proposedDraftPlainText,
          accepted: true
        });
      } catch {
        sendHtml(
          response,
          400,
          renderApplicationReview({
            formData: review.formData,
            prepared: review.prepared,
            reviewId,
            research: review.research,
            currentDraftPlainText: review.currentDraftPlainText,
            refinementProposal: {
              proposedDraft: '',
              warnings: [
                'The refinement proposal could not be applied.'
              ]
            }
          })
        );
        return;
      }

      const appliedAt = new Date().toISOString();

      const updatedReview = {
        ...review,
        currentDraftPlainText: acceptance.finalDraftPlainText,
        refinementProposal: {
          appliedMessage:
            'Current draft updated from your approved refinement proposal.'
        },
        refinementHistory: [
          ...(Array.isArray(review.refinementHistory)
            ? review.refinementHistory
            : []),
          {
            appliedAt,
            previousDraft: review.currentDraftPlainText,
            appliedDraft: acceptance.finalDraftPlainText
          }
        ]
      };

      reviewStore.set(reviewId, updatedReview);

      sendHtml(
        response,
        200,
        renderApplicationReview({
          formData: updatedReview.formData,
          prepared: updatedReview.prepared,
          reviewId,
          research: updatedReview.research,
          currentDraftPlainText: updatedReview.currentDraftPlainText,
          refinementProposal: updatedReview.refinementProposal
        })
      );
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
