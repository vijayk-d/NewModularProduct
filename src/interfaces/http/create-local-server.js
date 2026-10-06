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
    ? `
      <form method="post" action="/cover-letter-refinement">
        <input type="hidden" name="reviewId" value="${escapeHtml(reviewId)}">
        ${
          values.length
            ? `
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
            `
            : '<p class="rich-editor-notice">No verified organisation values were returned. You can still request a manual refinement.</p>'
        }
        <button type="submit">Polish cover letter</button>
      </form>
    `
    : '<p>Research the organisation successfully before requesting a refinement.</p>';

  const proposalMarkup = refinementProposal?.proposedDraft
    ? `
      <section class="refinement-proposal panel--proposal">
        <h2>Proposed cover-letter refinement</h2>
        <p>This proposal has not changed the current draft.</p>
        <label for="proposed-cover-letter">Proposed cover letter</label>
        <div class="rich-editor-toolbar" role="toolbar" aria-label="Proposed cover letter formatting" data-editor-target="proposed-cover-letter">
          <button type="button" data-editor-command="bold" title="Bold selected text"><strong>B</strong></button>
          <button type="button" data-editor-command="italic" title="Italic selected text"><em>I</em></button>
          <button type="button" data-editor-command="insertUnorderedList" title="Bullet list">&bull; List</button>
          <button type="button" data-editor-command="insertOrderedList" title="Numbered list">1. List</button>
          <button type="button" data-editor-command="hiliteColor" data-command-value="#fff2a8" title="Highlight selected text">Highlight</button>
          <button type="button" data-editor-command="createLink" title="Add a link">Link</button>
          <button type="button" data-editor-command="unlink" title="Remove link">Unlink</button>
          <button type="button" data-editor-command="removeFormat" title="Clear selected formatting">Clear format</button>
          <button type="button" data-editor-command="undo" title="Undo">Undo</button>
          <button type="button" data-editor-command="redo" title="Redo">Redo</button>
        </div>
        <div
          id="proposed-cover-letter"
          class="rich-editor rich-editor--proposal"
          contenteditable="true"
          role="textbox"
          aria-multiline="true"
          aria-label="Editable proposed cover letter"
          data-editor-name="Proposed cover letter">${escapeHtml(refinementProposal.proposedDraft).replace(/\n/g, '<br>')}</div>
        <div class="rich-editor-actions">
          <button
            type="button"
            class="rich-copy-button"
            data-copy-editor="proposed-cover-letter">Copy rich text</button>
          <span
            class="rich-editor-status"
            data-editor-status="proposed-cover-letter"
            role="status"
            aria-live="polite"></span>
        </div>
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
    <section class="refinement-panel panel--proposal">
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
  refinementProposal = null,
  selectedCvRoleCode = '',
  cvSelectionMessage = ''
}) {
  const bestCv = prepared.recommendation?.bestCv || {};
  const alternativeCv = prepared.recommendation?.alternativeCv || null;
  const atsScore = prepared.recommendation?.ats?.score;
  const rankedCvs = Array.isArray(prepared.rankedCvs)
    ? prepared.rankedCvs
    : [];
  const defaultCvRoleCode = String(bestCv.role_code || '').trim();
  const activeCvRoleCode = String(
    selectedCvRoleCode || defaultCvRoleCode
  ).trim();
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

  const renderKeywordChips = (keywords, emptyText, variant) => {
    const values = Array.isArray(keywords)
      ? keywords
        .map((value) => String(value || '').trim())
        .filter(Boolean)
      : [];

    return values.length
      ? `<ul class="cv-keywords cv-keywords--${escapeHtml(variant)}">${values
        .map((value) => `<li class="cv-keyword">${escapeHtml(value)}</li>`)
        .join('')}</ul>`
      : `<p>${escapeHtml(emptyText)}</p>`;
  };

  const renderSuggestions = (suggestions) => {
    const values = Array.isArray(suggestions)
      ? suggestions
        .map((value) => String(value || '').trim())
        .filter(Boolean)
      : [];

    return values.length
      ? `<ul class="cv-suggestions">${values
        .map((value) => `<li>${escapeHtml(value)}</li>`)
        .join('')}</ul>`
      : '';
  };

  const cvSelectionMarkup = rankedCvs.length
    ? `
      <form method="post" action="/review-cv-selection">
        <input type="hidden" name="reviewId" value="${escapeHtml(reviewId)}">
        <fieldset class="cv-selection-list">
          <legend>Select the CV to use for the next explicit action</legend>
          ${rankedCvs.map((candidate, index) => {
            const cv = candidate?.cv || {};
            const ats = candidate?.ats || {};
            const roleCode = String(cv.role_code || '').trim();
            const roleName = String(
              cv.role_name || roleCode || 'Unnamed CV'
            ).trim();
            const isSelected = roleCode === activeCvRoleCode;
            const isRecommended = roleCode === defaultCvRoleCode;

            return `
              <article class="cv-candidate${isSelected ? ' cv-candidate--selected' : ''}">
                <label class="cv-candidate__choice">
                  <input
                    type="radio"
                    name="selectedCvRoleCode"
                    value="${escapeHtml(roleCode)}"
                    ${isSelected ? 'checked' : ''}>
                  <span>
                    <strong>${escapeHtml(roleName)}</strong>
                    ${roleCode ? ` (${escapeHtml(roleCode)})` : ''}
                    ${isRecommended ? ' â€” recommended by local ATS ranking' : ''}
                  </span>
                </label>
                <p class="cv-candidate__score">
                  <strong>ATS score:</strong> ${escapeHtml(
                    Number.isFinite(ats.score) ? ats.score : 'Not available'
                  )}
                  <span class="cv-candidate__summary">
                    Â· Matched ${
                      Array.isArray(ats.matchedKeywords)
                        ? ats.matchedKeywords.length
                        : 0
                    }
                    Â· Missing ${
                      Array.isArray(ats.missingKeywords)
                        ? ats.missingKeywords.length
                        : 0
                    }
                  </span>
                </p>
                <details class="cv-candidate__details-toggle">
                  <summary>Show ATS evidence and CV profile</summary>
                  <div class="cv-candidate__details">
                    <div>
                      <h3>Matched keywords</h3>
                      ${renderKeywordChips(
                        ats.matchedKeywords,
                        'No matched keywords recorded.',
                        'matched'
                      )}
                    </div>
                    <div>
                      <h3>Missing keywords</h3>
                      ${renderKeywordChips(
                        ats.missingKeywords,
                        'No missing keywords recorded.',
                        'missing'
                      )}
                    </div>
                  </div>
                  ${
                    Array.isArray(ats.suggestions) && ats.suggestions.length
                      ? `<h3>ATS suggestions</h3>${renderSuggestions(
                          ats.suggestions
                        )}`
                      : ''
                  }
                  ${
                    Array.isArray(cv.tags) && cv.tags.length
                      ? `<h3>CV tags</h3>${renderKeywordChips(
                          cv.tags,
                          '',
                          'profile'
                        )}`
                      : ''
                  }
                  ${
                    Array.isArray(cv.use_cases) && cv.use_cases.length
                      ? `<h3>Best use cases</h3>${renderSuggestions(
                          cv.use_cases
                        )}`
                      : ''
                  }
                </details>
              </article>
            `;
          }).join('')}
        </fieldset>
        <button type="submit">Select CV for next action</button>
      </form>
    `
    : '<p>No ranked CV candidates are available for this review.</p>';

  const cvSelectionStatus = cvSelectionMessage
    ? `<p class="status--success" role="status">${escapeHtml(cvSelectionMessage)}</p>`
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
      width: min(96vw, 94rem);
      max-width: none;
      margin: 0 auto;
      padding: clamp(1rem, 2.5vw, 2.5rem);
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

    .panel {
      margin: 1.5rem 0;
      padding: 1.25rem;
      border: 1px solid #cbd5e1;
      border-left-width: 0.35rem;
      border-radius: 0.5rem;
    }

    .panel > h2:first-child {
      margin-top: 0;
    }

    .panel--vacancy {
      border-left-color: #2563eb;
      background: #eff6ff;
    }

    .panel--decision {
      border-left-color: #7c3aed;
      background: #f5f3ff;
    }

    .panel--research,
    .research-panel {
      border-left-color: #d97706;
      background: #fffbeb;
    }

    .panel--proposal,
    .refinement-panel {
      border-left-color: #15803d;
      background: #f0fdf4;
    }

    .refinement-proposal {
      margin: 1.5rem 0;
      padding: 1.25rem;
      border: 1px solid #86efac;
      border-left: 0.35rem solid #16a34a;
      border-radius: 0.5rem;
      background: #f0fdf4;
    }

    .panel--current {
      border-left-color: #0f766e;
      background: #f0fdfa;
    }

    .cv-selection-list {
      display: grid;
      grid-template-columns: repeat(
        auto-fit,
        minmax(min(100%, 32rem), 1fr)
      );
      gap: 1rem;
      margin: 1rem 0;
      padding: 0;
      border: 0;
    }

    .cv-selection-list > legend {
      font-weight: 700;
    }

    .cv-candidate {
      padding: 1rem;
      border: 1px solid #c4b5fd;
      border-radius: 0.4rem;
      background: #ffffff;
    }

    .cv-candidate--selected {
      border-left: 0.3rem solid #7c3aed;
      background: #faf5ff;
    }

    .cv-candidate__choice {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      font-weight: 600;
    }

    .cv-candidate__choice input {
      width: auto;
      margin-top: 0.3rem;
    }

    .cv-candidate__score {
      margin: 0.75rem 0 0;
    }

    .cv-candidate__summary {
      color: #475569;
      font-size: 0.9rem;
    }

    .cv-candidate__details-toggle {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #ddd6fe;
    }

    .cv-candidate__details-toggle > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-sizing: border-box;
      width: 100%;
      min-height: 2.5rem;
      padding: 0.55rem 0.7rem;
      border: 1px solid #c4b5fd;
      border-radius: 0.4rem;
      background: #ffffff;
      color: #5b21b6;
      cursor: pointer;
      font-weight: 700;
      list-style: none;
      user-select: none;
    }

    .cv-candidate__details-toggle > summary::-webkit-details-marker {
      display: none;
    }

    .cv-candidate__details-toggle > summary::marker {
      content: '';
    }

    .cv-candidate__details-toggle > summary::after {
      content: 'Show details +';
      flex: 0 0 auto;
      margin-left: 1rem;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .cv-candidate__details-toggle[open] > summary {
      border-color: #8b5cf6;
      background: #f5f3ff;
    }

    .cv-candidate__details-toggle[open] > summary::after {
      content: 'Hide details -';
    }

    .cv-candidate__details-toggle > summary:hover {
      border-color: #7c3aed;
      background: #faf5ff;
    }

    .cv-candidate__details-toggle > summary:focus-visible {
      outline: 3px solid #c4b5fd;
      outline-offset: 2px;
    }

    .cv-candidate__details {
      display: grid;
      grid-template-columns: repeat(
        auto-fit,
        minmax(min(100%, 14rem), 1fr)
      );
      gap: 1rem;
      margin-top: 1rem;
    }

    .cv-candidate h3 {
      margin: 0 0 0.5rem;
      font-size: 0.95rem;
    }

    .cv-keywords {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .cv-keyword {
      display: inline-flex;
      max-width: 100%;
      overflow-wrap: anywhere;
      padding: 0.25rem 0.55rem;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      background: #f8fafc;
      color: #334155;
      font-size: 0.86rem;
      line-height: 1.2;
    }

    .cv-keywords--matched .cv-keyword {
      border-color: #86efac;
      background: #f0fdf4;
      color: #166534;
    }

    .cv-keywords--missing .cv-keyword {
      border-color: #fdba74;
      background: #fff7ed;
      color: #9a3412;
    }

    .cv-keywords--profile .cv-keyword {
      border-color: #c4b5fd;
      background: #f5f3ff;
      color: #5b21b6;
    }

    .cv-suggestions {
      margin: 0.75rem 0 0;
      padding-left: 1.2rem;
    }

    .cv-suggestions li + li {
      margin-top: 0.35rem;
    }

    @media (max-width: 44rem) {
      main {
        width: auto;
        border-radius: 0.4rem;
      }

      .cv-selection-list {
        grid-template-columns: 1fr;
      }
    }

    .status--success {
      margin: 0 0 1rem;
      padding: 0.8rem 1rem;
      border-left: 0.25rem solid #15803d;
      border-radius: 0.25rem;
      background: #dcfce7;
      color: #14532d;
    }

    .research-panel,
    .refinement-panel {
      margin: 1.5rem 0;
      padding: 1.25rem;
      border: 1px solid #cbd5e1;
      border-left-width: 0.35rem;
      border-radius: 0.5rem;
    }

    .research-panel details {
      padding: 0.25rem 0;
    }

    .research-panel summary {
      cursor: pointer;
      font-weight: 700;
    }

    .refinement-panel fieldset {
      display: grid;
      gap: 0.65rem;
      margin: 1rem 0;
      padding: 0;
      border: 0;
    }

    .refinement-panel label {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font-weight: 400;
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
    .rich-editor-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      margin: 0.6rem 0;
      padding: 0.65rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.45rem;
      background: #f8fafc;
    }

    .rich-editor-toolbar button {
      min-height: 2.2rem;
      padding: 0.35rem 0.6rem;
      border: 1px solid #94a3b8;
      border-radius: 0.3rem;
      background: #ffffff;
      color: #1e293b;
    }

    .rich-editor-toolbar button:hover {
      border-color: #7c3aed;
      background: #faf5ff;
    }

    .rich-editor {
      box-sizing: border-box;
      width: 100%;
      min-height: 18rem;
      overflow-wrap: anywhere;
      padding: 1rem;
      border: 1px solid #94a3b8;
      border-radius: 0.45rem;
      background: #ffffff;
      color: #152033;
      line-height: 1.55;
      white-space: normal;
    }

    .rich-editor:focus {
      border-color: #7c3aed;
      outline: 3px solid #ddd6fe;
      outline-offset: 2px;
    }

    .rich-editor p {
      margin: 0 0 1rem;
    }

    .rich-editor p:last-child {
      margin-bottom: 0;
    }

    .rich-editor [data-highlight="true"] {
      background-color: #fff2a8;
    }

    .rich-editor-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      margin-top: 0.75rem;
    }

    .rich-editor-status {
      color: #475569;
    }

    .rich-editor-notice {
      margin: 0.75rem 0;
      color: #475569;
      font-size: 0.9rem;
    }

  </style>
</head>
<body>
  <main>
    <h1>Application review</h1>
    <p>Review the prepared local draft before you send anything manually.</p>

    <section class="panel panel--vacancy">
      <h2>Vacancy details</h2>
      <p><strong>Role:</strong> ${escapeHtml(role)}</p>
      <p><strong>Location:</strong> ${escapeHtml(location)}</p>
      ${organisation}${organisationUrl}${stakeholderSource}${reference}${advert}
    </section>

    <section class="panel panel--decision">
      <h2>CV selection and ATS comparison</h2>
      <p><strong>Recommended CV:</strong> ${escapeHtml(bestCv.role_name || bestCv.role_code || 'Not available')}</p>
${alternative}
${score}
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      ${cvSelectionStatus}
      ${cvSelectionMarkup}
      <p class="notice">Changing the selected CV does not alter the current cover letter. A future explicit generation or refinement action can use the selected CV.</p>
    </section>

    <section class="research-panel panel--research">
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

    <section class="panel panel--current">
      <h2>Current cover letter draft</h2>
      ${
        refinementProposal?.appliedMessage
          ? `<p class="status--success" role="status">${escapeHtml(refinementProposal.appliedMessage)}</p>`
          : ''
      }
      <label for="cover-letter-draft">Editable cover letter draft</label>
      <div class="rich-editor-toolbar" role="toolbar" aria-label="Cover letter formatting" data-editor-target="cover-letter-draft">
        <button type="button" data-editor-command="bold" title="Bold selected text"><strong>B</strong></button>
        <button type="button" data-editor-command="italic" title="Italic selected text"><em>I</em></button>
        <button type="button" data-editor-command="insertUnorderedList" title="Bullet list">â€¢ List</button>
        <button type="button" data-editor-command="insertOrderedList" title="Numbered list">1. List</button>
        <button type="button" data-editor-command="hiliteColor" data-command-value="#fff2a8" title="Highlight selected text">Highlight</button>
        <button type="button" data-editor-command="createLink" title="Add a link">Link</button>
        <button type="button" data-editor-command="unlink" title="Remove link">Unlink</button>
        <button type="button" data-editor-command="removeFormat" title="Clear selected formatting">Clear format</button>
        <button type="button" data-editor-command="undo" title="Undo">Undo</button>
        <button type="button" data-editor-command="redo" title="Redo">Redo</button>
      </div>
      <div
        id="cover-letter-draft"
        class="rich-editor rich-editor--current"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        aria-label="Editable current cover letter draft"
        data-editor-name="Current cover letter">${escapeHtml(plainText).replace(/\n/g, '<br>')}</div>
      <p class="rich-editor-notice">
        Formatting and text edits remain in this browser until a later explicit save action is added.
      </p>

      <div class="actions">
        <button id="copy-cover-letter" type="button">Copy rich text</button>
        <span id="copy-status" role="status" aria-live="polite"></span>
      </div>
    </section>

    <p><a href="/">Prepare another application</a></p>
    <p class="notice">This local tool does not send email. Review and send manually.</p>
  </main>

  <script nonce="__SCRIPT_NONCE__">
    const copyButton = document.getElementById('copy-cover-letter');
    const draft = document.getElementById('cover-letter-draft');
    const copyStatus = document.getElementById('copy-status');

    function selectDraftForManualCopy() {
      const range = document.createRange();
      range.selectNodeContents(draft);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      draft.focus();
      copyStatus.textContent = 'Text selected. Copy it manually.';
    }



    function editorPlainText(editor) {
      return String(editor?.innerText || '')
        .replace(/\\n{3,}/g, '\\n\\n')
        .trim();
    }

    async function copyRichEditor(editor, status) {
      const html = String(editor?.innerHTML || '').trim();
      const text = editorPlainText(editor);

      if (
        !navigator.clipboard ||
        !navigator.clipboard.write ||
        !window.ClipboardItem
      ) {
        return false;
      }

      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' })
          })
        ]);
        status.textContent = 'Rich text copied.';
        return true;
      } catch {
        return false;
      }
    }

    function selectEditorForManualCopy(editor, status) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
      status.textContent = 'Text selected. Copy it manually.';
    }

    function runEditorCommand(editor, status, command, value = null) {
      editor.focus();

      if (command === 'createLink') {
        const href = window.prompt(
          'Enter a full http(s) link for the selected text:'
        );

        if (!href) {
          return;
        }

        try {
          const url = new URL(href);

          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            status.textContent = 'Only http(s) links are allowed.';
            return;
          }

          document.execCommand('createLink', false, url.href);
          status.textContent = 'Link added locally.';
        } catch {
          status.textContent = 'Enter a valid full http(s) link.';
        }

        return;
      }

      document.execCommand(command, false, value);
      status.textContent =
        'Formatting updated locally; it is not saved yet.';
    }

    document.querySelectorAll('.rich-editor-toolbar').forEach((toolbar) => {
      const editor = document.getElementById(toolbar.dataset.editorTarget);
      const status = editor?.id === 'cover-letter-draft'
        ? copyStatus
        : document.querySelector(
            '[data-editor-status="' + editor?.id + '"]'
          );

      if (!editor || !status) {
        return;
      }

      toolbar.addEventListener('mousedown', (event) => {
        const button = event.target.closest('button[data-editor-command]');

        if (!button) {
          return;
        }

        event.preventDefault();
        runEditorCommand(
          editor,
          status,
          button.dataset.editorCommand,
          button.dataset.commandValue || null
        );
      });
    });

    document.querySelectorAll('.rich-copy-button').forEach((button) => {
      button.addEventListener('click', async () => {
        const editor = document.getElementById(button.dataset.copyEditor);
        const status = document.querySelector(
          '[data-editor-status="' + button.dataset.copyEditor + '"]'
        );

        if (!editor || !status) {
          return;
        }

        const copied = await copyRichEditor(editor, status);

        if (!copied) {
          selectEditorForManualCopy(editor, status);
        }
      });
    });

    document.querySelectorAll('.rich-editor').forEach((editor) => {
      editor.addEventListener('input', () => {
        const status = editor.id === 'cover-letter-draft'
          ? copyStatus
          : document.querySelector(
              '[data-editor-status="' + editor.id + '"]'
            );

        if (status) {
          status.textContent =
            'Local edits are not saved until an explicit save action is added.';
        }
      });
    });

    copyButton.addEventListener('click', async () => {
      try {
        const richCopied = await copyRichEditor(draft, copyStatus);

        if (richCopied) {
          return;
        }

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
  coverLetterRefinementPort = null,
  localDiagnosticsEnabled = false,
  diagnosticsWriter = process.stdout
} = {}) {
  const writeDiagnostic = (event, fields = {}) => {
    if (!localDiagnosticsEnabled) {
      return;
    }

    const safeFields = Object.entries(fields)
      .filter(([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== ''
      )
      .map(([key, value]) => {
        const normalized = typeof value === 'boolean'
          ? String(value)
          : String(value)
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 160);

        return `${key}=${JSON.stringify(normalized)}`;
      });

    diagnosticsWriter.write(
      `[LOCAL_DIAGNOSTICS] event=${event}` +
      `${safeFields.length ? ` ${safeFields.join(' ')}` : ''}\n`
    );
  };

  const wordCount = (value = '') => String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

  return createServer(async (request, response) => {
    const method = request.method || 'GET';
    const url = new URL(request.url || '/', 'http://localhost');
    const requestId = randomUUID();
    const requestStartedAt = Date.now();

    writeDiagnostic('request_received', {
      requestId,
      method,
      route: url.pathname
    });

    if (method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, renderApplicationForm());
      return;
    }

    if (method === 'POST' && url.pathname === '/applications') {
      const actionStartedAt = Date.now();

      writeDiagnostic('application_prepare_started', {
        requestId
      });

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
        writeDiagnostic('application_prepare_inputs_validated', {
          requestId,
          jobTitleProvided: Boolean(formData.jobTitle),
          organisationProvided: Boolean(formData.organisationName),
          organisationUrlProvided: Boolean(formData.organisationUrl),
          jobDescriptionCharacters: String(
            formData.jobDescriptionText || ''
          ).length,
          cvHighlightCount: Array.isArray(formData.cvHighlights)
            ? formData.cvHighlights.length
            : 0
        });

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

      writeDiagnostic('application_prepare_completed', {
        requestId,
        reviewId,
        selectedCvCode: prepared.recommendation?.bestCv?.role_code || 'none',
        atsScore: Number.isFinite(prepared.recommendation?.ats?.score)
          ? prepared.recommendation.ats.score
          : 'none',
        durationMs: Date.now() - actionStartedAt
      });

      reviewStore.set(reviewId, {
        formData,
        prepared,
        research: null,
        originalDraftPlainText: prepared.coverLetter?.plainText || '',
        currentDraftPlainText: prepared.coverLetter?.plainText || '',
        refinementProposal: null,
        selectedCvRoleCode: prepared.recommendation?.bestCv?.role_code || '',
        cvSelectionMessage: '',
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

        writeDiagnostic('application_prepare_failed', {
          requestId,
          errorType: error?.name || 'UnknownError',
          message,
          durationMs: Date.now() - actionStartedAt
        });

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

    if (method === 'POST' && url.pathname === '/review-cv-selection') {
      const actionStartedAt = Date.now();

      writeDiagnostic('cv_selection_requested', {
        requestId
      });

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

      const selectedCvRoleCode = String(
        formBody.values.get('selectedCvRoleCode') || ''
      ).trim();

      const rankedCvs = Array.isArray(review.prepared?.rankedCvs)
        ? review.prepared.rankedCvs
        : [];

      const selectedCandidate = rankedCvs.find((candidate) =>
        String(candidate?.cv?.role_code || '').trim() === selectedCvRoleCode
      );

      if (!selectedCandidate) {
        sendHtml(
          response,
          400,
          renderApplicationReview({
            formData: review.formData,
            prepared: review.prepared,
            reviewId,
            research: review.research,
            currentDraftPlainText: review.currentDraftPlainText,
            refinementProposal: review.refinementProposal,
            selectedCvRoleCode: review.selectedCvRoleCode,
            cvSelectionMessage: 'Select a CV from the available ranked candidates.'
          })
        );
        return;
      }

      const updatedReview = {
        ...review,
        selectedCvRoleCode,
        cvSelectionMessage:
          'Selected CV updated. The current cover letter has not changed.'
      };

      reviewStore.set(reviewId, updatedReview);

      writeDiagnostic('cv_selection_completed', {
        requestId,
        reviewId,
        selectedCvCode: selectedCvRoleCode,
        atsScore: Number.isFinite(selectedCandidate.ats?.score)
          ? selectedCandidate.ats.score
          : 'none',
        durationMs: Date.now() - actionStartedAt
      });

      sendHtml(
        response,
        200,
        renderApplicationReview({
          formData: updatedReview.formData,
          prepared: updatedReview.prepared,
          reviewId,
          research: updatedReview.research,
          currentDraftPlainText: updatedReview.currentDraftPlainText,
          refinementProposal: updatedReview.refinementProposal,
          selectedCvRoleCode: updatedReview.selectedCvRoleCode,
          cvSelectionMessage: updatedReview.cvSelectionMessage
        })
      );
      return;
    }

    if (method === 'POST' && url.pathname === '/organisation-research') {
      const actionStartedAt = Date.now();

      writeDiagnostic('organisation_research_started', {
        requestId
      });

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

      writeDiagnostic('organisation_research_requested', {
        requestId,
        reviewId,
        organisationProvided: Boolean(companyName),
        organisationUrlProvided: Boolean(companyUrl),
        roleProvided: Boolean(jobTitle)
      });

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

      writeDiagnostic('organisation_research_completed', {
        requestId,
        reviewId,
        status: research.status || 'unknown',
        valueCount: Array.isArray(research.companyValues)
          ? research.companyValues.length
          : 0,
        sourceCount: Array.isArray(research.sources)
          ? research.sources.length
          : 0,
        durationMs: Date.now() - actionStartedAt
      });

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
          refinementProposal: review.refinementProposal,
          selectedCvRoleCode: review.selectedCvRoleCode,
          cvSelectionMessage: review.cvSelectionMessage
        })
      );
      return;
    }

    if (method === 'POST' && url.pathname === '/cover-letter-refinement') {
      const actionStartedAt = Date.now();

      writeDiagnostic('refinement_requested', {
        requestId
      });

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
            refinementProposal,
            selectedCvRoleCode: review.selectedCvRoleCode,
            cvSelectionMessage: review.cvSelectionMessage
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

      writeDiagnostic('refinement_provider_requested', {
        requestId,
        reviewId,
        selectedValueCount: selectedResearchPoints.length,
        cvHighlightCount: Array.isArray(review.formData.cvHighlights)
          ? review.formData.cvHighlights.length
          : 0
      });

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

      writeDiagnostic('refinement_completed', {
        requestId,
        reviewId,
        proposalWordCount: wordCount(refinementProposal.proposedDraft),
        warningCount: Array.isArray(refinementProposal.warnings)
          ? refinementProposal.warnings.length
          : 0,
        durationMs: Date.now() - actionStartedAt
      });

      reviewStore.set(reviewId, {
        ...review,
        refinementProposal
      });

      renderReview(200, refinementProposal);
      return;
    }

    if (method === 'POST' && url.pathname === '/cover-letter-refinement/apply') {
      const actionStartedAt = Date.now();

      writeDiagnostic('refinement_apply_requested', {
        requestId
      });

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

      writeDiagnostic('refinement_applied', {
        requestId,
        reviewId,
        historyCount: updatedReview.refinementHistory.length,
        previousWordCount: wordCount(review.currentDraftPlainText),
        currentWordCount: wordCount(updatedReview.currentDraftPlainText),
        durationMs: Date.now() - actionStartedAt
      });

      sendHtml(
        response,
        200,
        renderApplicationReview({
          formData: updatedReview.formData,
          prepared: updatedReview.prepared,
          reviewId,
          research: updatedReview.research,
          currentDraftPlainText: updatedReview.currentDraftPlainText,
          refinementProposal: updatedReview.refinementProposal,
          selectedCvRoleCode: updatedReview.selectedCvRoleCode,
          cvSelectionMessage: updatedReview.cvSelectionMessage
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

