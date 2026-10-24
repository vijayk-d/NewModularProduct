import {inspectApplicationRole} from '../../application/application-role-review.js';
import {roleConsistencyWarnings} from '../../application/contextual-highlights.js';
import {assessLetterQuality,lengthPolicy} from '../../domain/cover-letter/letter-quality-policy.js';
import {renderAchievementPreparation,renderAchievementSummary} from './achievement-preparation-view.js';
import {usesCandidateValues,contextMode} from '../../domain/cover-letter/advertiser-context.js';
import {sanitizeSnapshotHtml} from '../../application/outreach-message-snapshot.js';
import { LETTER_TONES, normalizeLetterTone } from '../../application/cover-letter-controls.js';
import crypto from 'node:crypto';
import { currentReviewSubject, MAX_SUBJECT_LENGTH } from '../../application/review-subject.js';
import { POLISHING_MODELS, DEFAULT_POLISHING_MODEL, PRICING_CHECKED_AT, normalizePolishingModel } from '../../application/polishing-model-catalog.js';
import { renderCoverLetterHtml } from './cover-letter-html.js';

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
<html lang="en" class="review-workspace">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Application preparation</title>
<link rel="stylesheet" href="/achievement-preparation.css">
<script type="module" src="/achievement-preparation.js" nonce="__SCRIPT_NONCE__"></script>
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

/* research-result-style-v1: scoped presentation only */
.research-panel > details {
  box-sizing: border-box;
  min-width: 0;
  padding: 1.25rem;
  border: 1px solid #dbe3ec;
  border-radius: .75rem;
  background: #fff;
  color: #172033;
  box-shadow: 0 2px 8px rgb(15 23 42 / 4%);
}
.research-panel > details > summary {
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  margin-bottom: .75rem;
}
.research-panel > details > p {
  display: inline-block;
  margin: .25rem .5rem .5rem 0;
  padding: .35rem .6rem;
  border-radius: .4rem;
  background: #f1f5f9;
  color: #475569;
  font-size: .875rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.research-panel > details h3 {
  margin: 1.2rem 0 .5rem;
  font-size: 1rem;
  color: #26364b;
}
.research-panel > details .research-summary {
  box-sizing: border-box;
  max-width: 100%;
  margin: .5rem 0;
  padding: .9rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: .5rem;
  background: #f8fafc;
  font-family: inherit;
  font-size: .95rem;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
}
.research-panel > details ul {
  padding-left: 1.25rem;
  line-height: 1.65;
  margin: .5rem 0;
}
.research-panel > details li { margin: .35rem 0; }
.research-panel > details a {
  color: #2455be;
  overflow-wrap: anywhere;
  text-underline-offset: .15em;
}
.research-panel > details > details {
  margin-top: 1rem;
  padding-top: .75rem;
  border-top: 1px solid #e2e8f0;
}
.research-panel > details > details > summary {
  cursor: pointer;
  font-weight: 600;
  color: #475569;
}
.research-panel > details summary:focus-visible,
.research-panel > details a:focus-visible {
  outline: 3px solid #93b4ef;
  outline-offset: 3px;
}
@media (max-width: 640px) {
  .research-panel > details { padding: .9rem; }
  .research-panel > details > p { display: block; margin-right: 0; }
}

</style>
<link rel="stylesheet" href="/review-workspace.css"><script type="module" src="/review-workspace.js" nonce="__SCRIPT_NONCE__"></script>
<script type="module" src="/job-import-controls.js" nonce="__SCRIPT_NONCE__"></script>
<script type="module" src="/saved-application-delete.js" nonce="__SCRIPT_NONCE__"></script>
</head>
<body>
  <main>
    <h1>Application preparation</h1><p><a href="/applications">Saved applications</a> <a href="/maintenance">Maintenance &amp; Commands</a> <a href="/evidence-library">Assignment evidence library (development)</a> · <a href="/outreach-queue">Outreach queue</a></p>
    <p class="intro">Prepare and review a local application draft before manually sending it.</p>
${errorSummary}    <form id="application-form" method="post" action="/applications" autocomplete="on">
<div class="form-draft-tools"><button id="clear-saved-form" type="button" class="secondary-button">Clear saved test data</button></div>
${renderField('jobAdvertLink', 'Job advert URL', values.jobAdvertLink, { type: 'url' })}
<div id="job-import-tools" class="notice"></div>
<input type="hidden" id="jobImportId" name="jobImportId" value="${escapeHtml(values.jobImportId||'')}">
<input type="hidden" id="jobImportRevision" name="jobImportRevision" value="${escapeHtml(values.jobImportRevision||'')}">
${renderField('organisationUrl', 'Organisation website or LinkedIn page', values.organisationUrl, { type: 'url' })}
<div class="preparation-fields-row">
${renderField('jobTitle', 'Job title', values.jobTitle, { required: true })}
${renderField('organisationName', 'Organisation / advertiser name', values.organisationName)}
${renderField('jobLocation', 'Job location', values.jobLocation)}
</div>
<input type="hidden" name="advertiserRelationship" value="${escapeHtml(values.advertiserRelationship||'unknown')}">
${renderField('stakeholderSource', 'Stakeholder source or recruiter page', values.stakeholderSource, {
  placeholder: 'Company People page or recruiter/source URL; recipient name is separate'
})}

${renderField('recruiterName', 'Recipient name (optional; never a URL)', values.recruiterName)}
${renderField('professionalValues', 'My professional values (optional, review before using)', values.professionalValues, {textarea:true,placeholder:'Your own approved values; leave blank rather than invent claims'})}
${renderField('jobReference', 'Vacancy reference', values.jobReference)}
<div id="preferred-role-fallback">${renderField('preferredRoleCodes', 'Preferred CV role codes', values.preferredRoleCodes, { placeholder: 'SM, ADL' })}</div>
<fieldset id="preferred-role-choices" class="preferred-role-choices" hidden><legend>Preferred CV role codes</legend><label>Filter role codes<input type="search" id="preferred-role-search" autocomplete="off"></label><div id="preferred-role-list" class="preferred-role-list"></div></fieldset>
${renderField('jobDescriptionText', 'Job description', values.jobDescriptionText, { required: true, textarea: true })}
${renderAchievementPreparation(values)}
<details data-legacy-highlights hidden><summary>Legacy manual highlights — not CV-verified</summary>${renderField('cvHighlights', 'CV highlights', values.cvHighlights, { placeholder: 'Legacy input retained for compatibility', textarea: true })}</details>
      <label><input id="import-job-posters" type="checkbox" name="importJobPosters" value="true"> Import/link explicit job poster(s) as unverified contacts when generating. No email inferred.</label>
      <div class="form-actions">
        <button type="submit">Generate application</button>
        
      </div>
    </form>

    <p class="notice">This local tool does not send email. Review and send manually.</p>
  </main>
  <script nonce="__SCRIPT_NONCE__">
    const storageKey = 'application-form-draft-v1';
    const form = document.getElementById('application-form');
    const clearButton = document.getElementById('clear-saved-form');

    const fieldNames = [
      'advertiserRelationship',
      'jobImportId',
      'jobImportRevision',
      'jobLocation',
      'professionalValues',
      'recruiterName',
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

        const vacancyFields=new Set(['jobImportId','jobImportRevision','jobLocation','recruiterName','advertiserRelationship','jobTitle','organisationUrl','organisationName','stakeholderSource','jobAdvertLink','jobReference','jobDescriptionText']);
        if (!vacancyFields.has(name) && field && !field.value && typeof draft[name] === 'string') {
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

export function renderOptionalDetail(label, value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  return `    <p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(text)}</p>
`;
}

export function renderResearchSource(source) {
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

export function getSelectableCompanyValues(research) {
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

export function renderOrganisationResearch(research, organisationUrl = '') {
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

function renderPolishingAttempt(attempt) {
  if (!attempt) return '';
  const count = value => typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Unreported';
  const cost = typeof attempt.providerReportedCostUsd === 'number' && Number.isFinite(attempt.providerReportedCostUsd)
    ? `$${attempt.providerReportedCostUsd.toFixed(6)} (provider-reported)` : 'Unavailable—not zero';
  return `<section class="polishing-attempt-summary"><h3>Latest polishing attempt</h3><dl>
    <dt>Requested model</dt><dd>${escapeHtml(attempt.requestedModel || 'Unreported')}</dd>
    <dt>Returned model</dt><dd>${escapeHtml(attempt.returnedModel || 'Unreported')}</dd>
    <dt>Result</dt><dd>${escapeHtml(attempt.outcome === 'passed' ? 'Passed local letter checks' : 'Failed — ' + (attempt.errorCode || 'Unreported category'))}</dd>
    <dt>Duration</dt><dd>${typeof attempt.durationMs === 'number' ? escapeHtml((attempt.durationMs/1000).toFixed(1)+' seconds') : 'Unreported'}</dd>
    <dt>Tone / web-search tool</dt><dd>${escapeHtml(attempt.tone || 'Unreported')} / ${attempt.webSearchEnabled === true ? 'Allowed' : attempt.webSearchEnabled === false ? 'Disabled' : 'Unreported'}</dd>
    <dt>Input / output / reasoning tokens</dt><dd>${escapeHtml(count(attempt.inputTokens)+' / '+count(attempt.outputTokens)+' / '+count(attempt.reasoningTokens))}</dd>
    <dt>Reported request cost (USD)</dt><dd>${escapeHtml(cost)}</dd>
  </dl></section>`;
}

function qualityMarkup(text,editor,{mode='standard',maxWords=500,advertUrl=''}={}){
 const q=assessLetterQuality(text,{mode,maxWords,advertUrl});
 return `<p data-letter-quality-for="${escapeHtml(editor)}" data-quality-mode="${escapeHtml(q.mode)}" data-quality-cap="${escapeHtml(String(maxWords))}" data-advert-url="${escapeHtml(advertUrl)}" role="status" aria-live="polite">${q.wordCount} words · ${q.mode} target ${q.targetMinimum}–${q.maximumWords} · ${q.narrativeParagraphs} narrative paragraphs. ${escapeHtml(q.warnings.join(' '))} Page fit not checked. Subject and Gmail signature excluded.</p>`;
}

export function renderRefinementPanel({
  reviewId,
  research,
  refinementProposal,
  letterTone = 'professional',
  polishingModel = DEFAULT_POLISHING_MODEL,
  refinementLastAttempt = null,
  polishingModelExplicit = false,
  currentSubject = '',
  polishingInstructions = '',
  scenarioSelectionReferences = [],
  applicationRoleVersion = '',
  advertiserRelationship = 'unknown',
  allowWithoutOrganisationResearch = false,
  letterLengthMode='standard',qualityMaximumWords=500,rejectedRefinementProposal=null
}) {
  const values = getSelectableCompanyValues(research);
  const selectedTone = normalizeLetterTone(letterTone);
  const selectedModel = normalizePolishingModel(polishingModel);

  const selectorMarkup = true
    ? `
      <form method="post" action="/cover-letter-refinement">
        <input type="hidden" name="reviewId" value="${escapeHtml(reviewId)}">
        ${applicationRoleVersion?`<input type="hidden" name="applicationRoleVersion" value="${escapeHtml(applicationRoleVersion)}">`:''}
        <fieldset class="workspace-choice-cards" data-advertiser-relationship><legend>Advertiser relationship for the next polish</legend><div class="workspace-choice-options">
        ${[['direct-employer','Direct employer','The advertiser is hiring for its own vacancy.'],['recruitment-intermediary','Recruitment agency / intermediary','The advertiser represents a client.'],['unknown','Unknown / unclear','Use neutral wording; do not assume the employer relationship.']].map(([value,label,note])=>`<label class="workspace-choice-card"><input type="radio" name="advertiserRelationship" value="${value}"${value===advertiserRelationship?' checked':''}><span><strong>${label}</strong><small>${note}</small></span></label>`).join('')}
        </div><p>Choose the relationship before requesting a second opinion. Switching does not rewrite the letter or make a paid call. Direct employer requires successful organisation research.</p></fieldset>

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
                      value="${escapeHtml(value.id)}" checked>
                    ${escapeHtml(value.text)}
                  </label>
                `).join('')}
              </fieldset>
            `
            : (allowWithoutOrganisationResearch?'<p class="rich-editor-notice">Employer/client unconfirmed. Optional polishing uses JD/CV evidence only; advertiser facts are not employer facts.</p>':'<p class="rich-editor-notice">`No verified organisation values were returned. You can still polish the cover letter using the organisation details and available research sources.`</p>')
        }
        <fieldset class="workspace-choice-cards" data-choice-kind="length"><legend>Letter length for the next polish</legend><div class="workspace-choice-options">
        ${['standard','extended'].map(mode=>{const p=lengthPolicy(mode,qualityMaximumWords);return `<label class="workspace-choice-card"><input type="radio" name="letterLengthMode" value="${mode}"${mode===letterLengthMode?' checked':''}><span><strong>${mode==='standard'?'Standard senior':'Extended strategic'}</strong><small>${p.targetMinimum}–${p.maximumWords} complete-letter words</small></span></label>`;}).join('')}
        </div></fieldset><p class="rich-editor-notice">Extended is an explicit choice. No padding, truncation or automatic paid retry. Existing .env caps are respected. Page fit requires a separate rendered check.</p>
        <label for="polishing-model">Polishing model</label>
        <input type="hidden" name="polishingCostGuard" value="required">
        <select id="polishing-model" name="polishingModel" data-selection-explicit="${polishingModelExplicit ? 'true' : 'false'}">
          ${POLISHING_MODELS.map(item=>`<option value="${item.id}"${item.id===selectedModel?' selected':''}>${escapeHtml(item.label)} (${escapeHtml(item.provider)}) — ${item.tierThreshold ? 'from ' : ''}$${item.inputUsdPerMillion.toFixed(2)} input / $${item.outputUsdPerMillion.toFixed(2)} output per 1M tokens${item.tierThreshold ? `; above ${item.tierThreshold.toLocaleString('en-US')} input tokens: $${item.highInputUsdPerMillion.toFixed(2)} / $${item.highOutputUsdPerMillion.toFixed(2)}` : ''}</option>`).join('')}
        </select>
        <p data-polishing-cost-status role="status" aria-live="polite">Local request-cost estimate loading. No provider call is made for estimation.</p>
        <button type="button" data-polishing-estimate>Refresh cost estimate</button>
        <button type="button" data-polishing-cheapest>Choose lowest estimated cost</button>
        <p class="rich-editor-notice">Lowest reference token cost first: 5,000 input + 1,500 output tokens. USD, uncached token rates; tool charges excluded. Pricing checked ${PRICING_CHECKED_AT}. Prices do not rank speed or quality. CV evidence is processed by the selected model provider through Perplexity. Changing selection makes no paid provider request; local estimates can refresh.</p>
        <label for="cover-letter-tone">Letter tone</label>
        <select id="cover-letter-tone" name="letterTone">
          ${LETTER_TONES.map(tone => `<option value="${tone.value}"${tone.value === selectedTone ? ' selected' : ''}>${escapeHtml(tone.label)}</option>`).join('')}
        </select>
        <input type="hidden" name="webSearchEnabled" value="false">
        <label>
          <input type="checkbox" name="webSearchEnabled" value="true"${refinementLastAttempt?.webSearchEnabled===false?'':' checked'}>
          Allow web search during polishing
        </label>
        <fieldset data-scenario-picker data-review-id="${escapeHtml(reviewId)}"><legend>Supporting assignment scenarios (optional; maximum two)</legend><input type="hidden" name="scenarioSelections" value="${escapeHtml(JSON.stringify(scenarioSelectionReferences))}"><p>Only currently approved wording is eligible. Private source passages, notes and confirmation comments are not sent. Approval is your assessment, not independent verification. Scenarios may be omitted if irrelevant, duplicated or outside the word budget.</p><p data-scenario-status role="status">Loading optional scenario choices…</p><div data-scenario-choices></div><button type="button" data-scenario-refresh>Refresh scenarios</button><button type="button" data-scenario-clear>Clear scenarios</button><button type="button" data-scenario-save>Save scenario selection</button></fieldset>
        <label for="personal-polishing-instructions" style="display:block">Personal polishing instructions (optional)</label>
        <textarea id="personal-polishing-instructions" name="instructions" rows="4" maxlength="4000" style="box-sizing:border-box;width:100%;resize:vertical;padding:0.65rem;font:inherit" placeholder="For example: make the opening more direct, emphasise relevant achievements, and remove repetition.">${escapeHtml(polishingInstructions)}</textarea>
        <p class="rich-editor-notice">Sent with your next polishing request only. Existing evidence, attribution and length rules still apply. Leave blank for normal polishing.</p>
        <button type="submit">Polish cover letter</button>
        <p class="rich-editor-notice">micro1 is excluded from application claims. Sources remain unchanged. Tone applies only when you polish.</p>
      </form>
    `
    : '<p>Research the organisation successfully before requesting a refinement.</p>';

  const proposalMarkup = refinementProposal?.proposedDraft
    ? `
      <section class="refinement-proposal panel--proposal">
        <h2>Proposed cover-letter refinement</h2>
        <p>This proposal has not changed the current draft.</p>
      ${refinementProposal.scenarioEvidenceSnapshot?.snapshots?.length?`<details data-scenario-provenance><summary>Scenario evidence used for this proposal</summary><ul>${refinementProposal.scenarioEvidenceSnapshot.snapshots.map(s=>`<li>${escapeHtml(s.scenarioId)} — scenario version ${s.scenarioRevision}, assignment version ${s.assignmentRevision}; ${escapeHtml(s.evidenceState)}<p>${escapeHtml(s.approvedWording)}</p></li>`).join('')}</ul><p>User-approved wording, not independently verified. Private passages are not included.</p></details>`:''}
        ${refinementProposal.attemptMetadata ? `<p class="rich-editor-notice">This proposal's requested model: ${escapeHtml(refinementProposal.attemptMetadata.requestedModel || 'Unreported')}; returned model: ${escapeHtml(refinementProposal.attemptMetadata.returnedModel || 'Unreported')}.</p>` : '<p class="rich-editor-notice">Model not recorded for this proposal.</p>'}
        <label for="proposed-cover-letter-subject">Proposed subject</label>
        <textarea id="proposed-cover-letter-subject" class="subject-editor-input" rows="2" wrap="soft"
          name="proposedSubject" form="apply-refinement-form" required maxlength="${MAX_SUBJECT_LENGTH}">${escapeHtml(refinementProposal.proposedSubject ?? currentSubject)}</textarea>
        <p class="rich-editor-notice">Subject edits are included when you accept this proposal. They do not change the current subject before acceptance.</p>
        ${qualityMarkup(refinementProposal.proposedDraft,'proposed-cover-letter',{mode:refinementProposal.letterLengthMode||'standard',maxWords:qualityMaximumWords,advertUrl:refinementProposal.qualityAdvertUrl||''})}
        <label for="proposed-cover-letter">Proposed cover letter</label>
        <div class="rich-editor-toolbar" role="toolbar" aria-label="Proposed cover letter formatting" data-editor-target="proposed-cover-letter">
          <button type="button" data-editor-command="bold" title="Bold selected text"><strong>B</strong></button>
          <button type="button" data-editor-command="italic" title="Italic selected text"><em>I</em></button>
          <button type="button" data-editor-command="insertUnorderedList" title="Bullet list">&bull; List</button>
          <button type="button" data-editor-command="insertOrderedList" title="Numbered list">1. List</button>
          <button type="button" data-editor-command="toggleJobHighlight" title="Toggle background highlighting on selected text">Highlight</button><button type="button" data-editor-command="clearAutoHighlights">Clear automatic highlights</button><button type="button" data-editor-command="clearAllHighlights">Clear all highlights</button>
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
          data-editor-name="Proposed cover letter">${refinementProposal.proposedDraftHtml?sanitizeSnapshotHtml(refinementProposal.proposedDraftHtml).html:renderCoverLetterHtml(refinementProposal.proposedDraft,refinementProposal.highlightSelections?.length?refinementProposal.highlightSelections:refinementProposal.highlightPhrases)}</div>
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
        <form id="apply-refinement-form" method="post" action="/cover-letter-refinement/apply">
          <input type="hidden" name="reviewId" value="${escapeHtml(reviewId)}"><input type="hidden" name="proposalBodyVersion" value="${crypto.createHash('sha256').update(String(refinementProposal.proposedDraft||'')).digest('hex')}">
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
      ${renderPolishingAttempt(refinementLastAttempt)}
      ${warningMarkup}
      ${rejectedRefinementProposal?.proposedDraft?`<details data-rejected-quality-proposal><summary>Retained over-limit proposal — not applied</summary><p>${escapeHtml((rejectedRefinementProposal.warnings||[]).join(' '))}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(rejectedRefinementProposal.proposedDraft)}</pre><form method="post" action="/cover-letter-refinement/reassess-length"><input type="hidden" name="reviewId" value="${escapeHtml(reviewId)}"><input type="hidden" name="letterLengthMode" value="extended"><button type="submit">Review retained proposal in Extended mode — no AI call</button></form></details>`:''}
    </section>
    ${proposalMarkup}
  `;
}

export function renderContactLinking(contactLinking = null) {
  if (!contactLinking) return "";

  const unlinkedContacts = contactLinking.unlinked || [];
  const linkedContacts = contactLinking.linked || [];
  const reviewId = escapeHtml(contactLinking.reviewId);

  const rows = (contacts, linked) => contacts.map((contact) => {
    const emails = [...new Set([
      contact.selectedEmail,
      ...(Array.isArray(contact.emailCandidates) ? contact.emailCandidates : [])
    ].filter((email) => typeof email === "string" && email.trim())
      .map((email) => email.trim()))];

    return `
      <tr>
        <td>
          <input type="checkbox"
            class="${linked ? "linked-contact-checkbox" : "contact-link-checkbox"}"
            ${linked ? "" : 'name="contactIds"'}
            value="${escapeHtml(contact.id)}"
            aria-label="${linked ? "Select linked contact" : "Select available contact"} ${escapeHtml(contact.fullName)}" />
        </td>
        <td>${escapeHtml(contact.fullName)}</td>
        <td class="contact-role-cell"
            style="max-width:28rem;white-space:normal;overflow-wrap:anywhere;">
          ${escapeHtml(contact.role || "")}
        </td>
        <td class="contact-email-cell"
            style="max-width:24rem;white-space:normal;overflow-wrap:anywhere;">
          ${emails.map((email) =>
            `<div><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></div>`
          ).join("") || "Not available"}
        </td>
        <td>
          <a href="${escapeHtml(contact.linkedinUrl)}"
             target="_blank" rel="noopener">LinkedIn profile</a>
        </td>
      </tr>`;
  }).join("");

  const header = (linked) => `
    <thead><tr>
      <th scope="col">
        Select
        <input type="checkbox"
          id="${linked ? "select-all-linked-contacts" : "select-all-contact-links"}"
          aria-label="${linked ? "Select all linked contacts" : "Select all available contacts"}" />
      </th>
      <th scope="col">Name</th>
      <th scope="col">Role</th>
      <th scope="col">Email</th>
      <th scope="col">LinkedIn</th>
    </tr></thead>`;

  return `
    <section class="review-section">
      <h2>Link imported contacts</h2>
      ${contactLinking.linkedMessage
        ? `<p>${escapeHtml(contactLinking.linkedMessage)}</p>` : ""}

      <h3>Linked contacts</h3>
      <p>Unlinking removes contacts from this application only.
         Contact records and links to other applications are kept.</p>
      <table>
        ${header(true)}
        <tbody class="linked-imported-contacts-body">${rows(linkedContacts, true)}</tbody>
      </table>
      <div class="linked-contact-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
        <button type="button" class="unlink-selected-contacts-button"
          data-review-id="${reviewId}">Unlink selected</button>
        <button type="button" class="clear-linked-contacts-button"
          data-review-id="${reviewId}">Clear linked contacts</button>
      </div>
      <p class="linked-contact-action-status" role="status" aria-live="polite"></p>

      <h3>Available imported contacts</h3>
      <form method="post" action="/recruiter-contacts/link">
        <input type="hidden" name="reviewId" value="${reviewId}" />
        <table>
          ${header(false)}
          <tbody class="available-imported-contacts-body">${rows(unlinkedContacts, false)}</tbody>
        </table>
        <button type="submit">Link selected contacts</button>
      </form>
      <div class="contact-linking-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
        <button type="button" class="refresh-imported-contacts-button"
          data-review-id="${reviewId}">Refresh contacts</button>
        <button type="button" class="delete-selected-contacts-button"
          data-review-id="${reviewId}">Delete selected</button>
        <button type="button" class="clear-imported-contacts-button"
          data-review-id="${reviewId}">Clear imported contacts</button>
        <button type="button" class="permanently-delete-selected-contacts-button"
          data-review-id="${reviewId}"
          style="background:#b91c1c;">Permanently delete selected</button>
      </div>
    </section>`;
}

export function renderApplicationReview({
  formData,
  prepared,
  reviewId = '',
  research = null,
  currentDraftPlainText = '',
  currentDraftHtml,
  currentDraftSubject,
  polishingInstructions = '',
  scenarioSelectionReferences = [],
  currentHighlightPhrases = [],
  applicationRoleReview = null,
  applicationRoleMessage = '',
  applicationRoleCsrfToken = '',
  polishingModel = DEFAULT_POLISHING_MODEL,
  refinementLastAttempt = null,
  polishingModelExplicit = false,
  letterTone = 'professional',
  letterLengthMode='standard',currentLetterLengthMode='standard',qualityMaximumWords=500,rejectedRefinementProposal=null,
  refinementProposal = null,
  selectedCvRoleCode = '',
  cvSelectionMessage = '',
  contacts = [],
  contactLinking = null
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
  const subject = currentReviewSubject({prepared,formData,currentDraftSubject});
  const roleState=applicationRoleReview||(formData.jobTitle?inspectApplicationRole(formData):null);
  if(refinementProposal?.proposedDraft)refinementProposal={...refinementProposal,warnings:[...new Set([...(refinementProposal.warnings||[]),...roleConsistencyWarnings(refinementProposal.proposedDraft,formData.jobTitle)])]};
  const refinementMarkup = renderRefinementPanel({
    reviewId,
    research,
    refinementProposal,
    letterTone,
    polishingModel,
    refinementLastAttempt,
    polishingModelExplicit,
    currentSubject: subject,
    polishingInstructions,
    scenarioSelectionReferences,
    applicationRoleVersion:roleState?.version||'',
    letterLengthMode,qualityMaximumWords,rejectedRefinementProposal,
    advertiserRelationship:contextMode(formData),
    allowWithoutOrganisationResearch:usesCandidateValues(formData)
  });

  const rolePanel=roleState?`<details class="application-role-title-review" ${roleState.needsConfirmation?'open':''}><summary>Application role title — ${roleState.needsConfirmation?'confirmation required':roleState.confirmationValid?'confirmed':'no explicit mismatch detected'}</summary>
 <p><strong>Original stored/application title:</strong> ${escapeHtml(roleState.sourceTitle)}</p><p><strong>Explicit description title:</strong> ${escapeHtml(roleState.descriptionTitle||'No reliable explicit heading found; no title was guessed.')}</p><p><strong>Application title for the next polish:</strong> ${escapeHtml(roleState.applicationTitle||'Choose below before polishing.')}</p>
 ${roleState.conflict||roleState.staleConfirmation?`<form method="post" action="/review-role-title"><input type="hidden" name="reviewId" value="${escapeHtml(reviewId)}"><input type="hidden" name="roleBinding" value="${roleState.binding}"><input type="hidden" name="roleCsrfToken" value="${escapeHtml(applicationRoleCsrfToken)}"><input type="hidden" name="expectedRoleVersion" value="${roleState.version}"><fieldset><legend>Choose the title to use for this application</legend>${roleState.choices.map(c=>`<label><input type="radio" name="roleChoice" value="${c.key}" required${roleState.confirmationValid&&formData.applicationRoleConfirmation?.choice===c.key?' checked':''}>${escapeHtml(c.title)} — ${c.key==='stored'?'retain the stored title explicitly':'use the explicit JD title'}</label>`).join('')}</fieldset><button type="submit" data-role-title-confirm disabled>Confirm application role</button></form>`:''}
 <p>Confirmation updates only saved role metadata. Pending current-letter edits are saved first, but title confirmation does not recompose the letter or change the effective subject, CV, queued snapshots or sent history, or make a paid request. The captured advert remains unchanged. Changed choices invalidate old proposals. Review a new polish and edit the proposed subject separately; update eligible unsent messages only through the existing explicit action.</p></details>`:'';
 const role=formData.applicationRoleConfirmation?formData.jobTitle:prepared.jobDescription?.role||formData.jobTitle;

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
        <div class="cv-applybar"><button type="submit">Apply CV selection</button><span>Current letter and existing queue snapshots are unchanged.</span></div>
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
                    ${isRecommended ? ' - recommended' : ''}
                  </span>
                </label>
                <p class="cv-candidate__score">
                  <strong>ATS score:</strong> ${escapeHtml(
                    Number.isFinite(ats.score) ? ats.score : 'Not available'
                  )}
                  <span class="cv-candidate__summary">
                    | Matched ${
                      Array.isArray(ats.matchedKeywords)
                        ? ats.matchedKeywords.length
                        : 0
                    }
                    | Missing shown ${
                      Array.isArray(ats.missingKeywords)
                        ? ats.missingKeywords.length
                        : 0
                    }
                  </span>
                </p>
                <button type="button" data-cv-inspect data-review-id="${escapeHtml(reviewId)}" data-role-code="${escapeHtml(roleCode)}">Inspect actual CV</button><div data-cv-document aria-live="polite"></div>
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
<html lang="en" class="review-workspace">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Application review</title>
<link rel="stylesheet" href="/achievement-preparation.css">
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

    .contact-role-cell {
  max-width: 28rem;
  overflow-wrap: anywhere;
  white-space: normal;
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


/* research-result-style-v1: scoped presentation only */
.research-panel > details {
  box-sizing: border-box;
  min-width: 0;
  padding: 1.25rem;
  border: 1px solid #dbe3ec;
  border-radius: .75rem;
  background: #fff;
  color: #172033;
  box-shadow: 0 2px 8px rgb(15 23 42 / 4%);
}
.research-panel > details > summary {
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  margin-bottom: .75rem;
}
.research-panel > details > p {
  display: inline-block;
  margin: .25rem .5rem .5rem 0;
  padding: .35rem .6rem;
  border-radius: .4rem;
  background: #f1f5f9;
  color: #475569;
  font-size: .875rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.research-panel > details h3 {
  margin: 1.2rem 0 .5rem;
  font-size: 1rem;
  color: #26364b;
}
.research-panel > details .research-summary {
  box-sizing: border-box;
  max-width: 100%;
  margin: .5rem 0;
  padding: .9rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: .5rem;
  background: #f8fafc;
  font-family: inherit;
  font-size: .95rem;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
}
.research-panel > details ul {
  padding-left: 1.25rem;
  line-height: 1.65;
  margin: .5rem 0;
}
.research-panel > details li { margin: .35rem 0; }
.research-panel > details a {
  color: #2455be;
  overflow-wrap: anywhere;
  text-underline-offset: .15em;
}
.research-panel > details > details {
  margin-top: 1rem;
  padding-top: .75rem;
  border-top: 1px solid #e2e8f0;
}
.research-panel > details > details > summary {
  cursor: pointer;
  font-weight: 600;
  color: #475569;
}
.research-panel > details summary:focus-visible,
.research-panel > details a:focus-visible {
  outline: 3px solid #93b4ef;
  outline-offset: 3px;
}
@media (max-width: 640px) {
  .research-panel > details { padding: .9rem; }
  .research-panel > details > p { display: block; margin-right: 0; }
}

</style>
<link rel="stylesheet" href="/review-workspace.css"><script type="module" src="/review-workspace.js" nonce="__SCRIPT_NONCE__"></script>
<script type="module" src="/job-import-controls.js" nonce="__SCRIPT_NONCE__"></script>
<script type="module" src="/saved-application-delete.js" nonce="__SCRIPT_NONCE__"></script>
<script type="module" src="/rich-highlight-controls.js" nonce="__SCRIPT_NONCE__"></script>
</head>
<body>
  <main>

    <h1>Application review</h1>
    <p>Review the prepared local draft before you send anything manually.</p>

    <section class="panel panel--vacancy">
      <h2>Vacancy details</h2>
      ${applicationRoleMessage?`<p class="notice" role="status">${escapeHtml(applicationRoleMessage)}</p>`:''}
      ${rolePanel}
      ${roleState?.confirmationValid&&roleState.applicationTitle!==roleState.sourceTitle&&subject.toLowerCase().includes(roleState.sourceTitle.toLowerCase())?`<p class="notice" data-role-subject-warning>The effective subject still contains the former stored role title. Review/edit the subject explicitly before applying or sending a new letter; title confirmation did not rewrite it.</p>`:''}
      <p><strong>Role:</strong> ${escapeHtml(role)}</p>
      <p><strong>Location:</strong> ${escapeHtml(location)}</p>
      ${organisation}${organisationUrl}${stakeholderSource}${reference}${advert}
${formData.organisationName ? `<nav aria-label="Additional stakeholder searches">${[['Directors','Director'],['Heads of function','Head'],['Talent and recruitment','Talent, Recruiter']].map(([label,keywords])=>{const query=[formData.organisationName,formData.jobLocation||prepared.jobDescription?.location,keywords].flatMap(v=>String(v||'').split(',').map(x=>x.trim()).filter(Boolean)).join(', ');const url='https://www.linkedin.com/search/results/people/?keywords='+encodeURIComponent(query)+'&origin=GLOBAL_SEARCH_HEADER';return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;}).join(' · ')}</nav>` : ''}
    </section>

    <section class="panel panel--decision">
      <h2>CV selection and ATS comparison</h2>
      <p class="cv-active-summary"><strong>Selected CV:</strong> ${escapeHtml((rankedCvs.find(item=>item.cv?.role_code===activeCvRoleCode)?.cv?.role_name)||activeCvRoleCode||'Not available')}</p>
      <details class="cv-ranking-summary"><summary>Ranking summary</summary>
      <p><strong>Recommended CV:</strong> ${escapeHtml(bestCv.role_name || bestCv.role_code || 'Not available')}</p>
${alternative}
${score}</details>
      <p data-subject-summary><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      ${cvSelectionStatus}
      ${cvSelectionMarkup}
      <p class="notice">Changing the selected CV does not alter the current cover letter. A future explicit generation or refinement action can use the selected CV.</p>
    </section>

${renderAchievementSummary(formData,activeCvRoleCode)}
${renderEmailDomainResolution(reviewId, formData, research)}

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
      <label for="current-cover-letter-subject">Current subject</label>
      <textarea id="current-cover-letter-subject" class="subject-editor-input" rows="2" wrap="soft"
        required maxlength="${MAX_SUBJECT_LENGTH}">${escapeHtml(subject)}</textarea>
      <button id="save-current-subject" type="button" data-review-id="${escapeHtml(reviewId)}">Save subject</button>
      <p id="current-subject-status" role="status" aria-live="polite">Save preserves this subject in the active review. Adding to the queue snapshots the visible subject, even before saving. Existing queue items are unchanged.</p>
      ${qualityMarkup(plainText,'cover-letter-draft',{mode:currentLetterLengthMode,maxWords:qualityMaximumWords,advertUrl:formData.jobAdvertLink})}
      <label for="cover-letter-draft">Editable cover letter draft</label>
      <div class="rich-editor-toolbar" role="toolbar" aria-label="Cover letter formatting" data-editor-target="cover-letter-draft">
        <button type="button" data-editor-command="bold" title="Bold selected text"><strong>B</strong></button>
        <button type="button" data-editor-command="italic" title="Italic selected text"><em>I</em></button>
        <button type="button" data-editor-command="insertUnorderedList" title="Bullet list">List</button>
        <button type="button" data-editor-command="insertOrderedList" title="Numbered list">1. List</button>
        <button type="button" data-editor-command="toggleJobHighlight" title="Toggle background highlighting on selected text">Highlight</button><button type="button" data-editor-command="clearAutoHighlights">Clear automatic highlights</button><button type="button" data-editor-command="clearAllHighlights">Clear all highlights</button>
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
        data-editor-name="Current cover letter">${typeof currentDraftHtml==='string'&&currentDraftHtml.trim()?sanitizeSnapshotHtml(currentDraftHtml).html:renderCoverLetterHtml(plainText, currentHighlightPhrases)}</div>
      ${roleConsistencyWarnings(plainText,formData.jobTitle).map(message=>`<p class="notice" data-role-consistency-warning>${escapeHtml(message)}</p>`).join('')}
      <p class="rich-editor-notice">
        Application text/formatting can be saved and resumed. Queue messages remain independent snapshots.
      </p>

      <div class="actions">
        <button id="copy-cover-letter" type="button">Copy rich text</button>
        <span id="copy-status" role="status" aria-live="polite"></span>
      </div>
    </section>


    <p class="notice">This local tool does not send email. Review and send manually.</p>
${renderRecruiterContacts(contacts)}

${renderContactLinking(contactLinking)}
<details class="review-section application-intelligence-collapsible"><summary>Application history and CV assessment</summary><section data-application-intelligence data-review-id="${escapeHtml(reviewId)}"><p>Loading local activity context...</p></section></details>



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
      if(['toggleJobHighlight','clearAutoHighlights','clearAllHighlights','undo','redo'].includes(command)){const detail={command,status,handled:false};editor.dispatchEvent(new CustomEvent('highlight-editor-command',{bubbles:true,detail}));if(detail.handled)return;if(!['undo','redo'].includes(command)){status.textContent='Highlight controls are loading; retry shortly.';return;}}

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
        'Formatting updated locally; current-draft application autosave is separate.';
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
            editor.id==='cover-letter-draft'?'Current-draft edit pending application autosave.':'Proposal edits stay local; copy them into the current draft to save.';
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
          navigator.clipboard.writeText(editorPlainText(draft)).then(() => true),
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


      <script type="module" src="/cv-documents.js" nonce="__SCRIPT_NONCE__"></script><script type="module" src="/application-intelligence.js" nonce="__SCRIPT_NONCE__"></script><script type="module" src="/review-page.js" nonce="__SCRIPT_NONCE__"></script><script type="module" src="/letter-quality-controls.js" nonce="__SCRIPT_NONCE__"></script><script type="module" src="/scenario-polishing-controls.js" nonce="__SCRIPT_NONCE__"></script>
</body>
</html>


`;
}

export function renderEmailDomainResolution(
  reviewId,
  formData = {},
  research = null
) {
  const savedDomain = String(formData.emailDomain || "").trim();
  const domainResearch = research?.emailDomainResearch;
  const researchedDomain = String(
    domainResearch?.emailDomain || ""
  ).trim();
  const displayedDomain = savedDomain || researchedDomain;

  return `
    <section class="review-section" id="email-domain-resolution">
      <h2>Email domain</h2>

      <label for="email-domain-input">Organisation email domain</label>
      <input
        id="email-domain-input"
        type="text"
        value="${escapeHtml(displayedDomain)}"
        placeholder="e.g. twinstream.com"
        autocomplete="off"
        spellcheck="false"
        data-manual="${savedDomain ? "true" : "false"}"
        style="display:block;width:min(100%,32rem);box-sizing:border-box;
               padding:0.65rem;margin:0.5rem 0;border:1px solid #94a3b8;
               border-radius:0.4rem;font:inherit;"
      />

      <p id="email-domain-status" role="status" aria-live="polite">
        ${savedDomain
          ? "Saved for this active review."
          : researchedDomain
            ? "Found during organisation research. Edit if needed, then save."
            : "No domain found yet. Research the organisation or enter one manually."}
      </p>

      ${researchedDomain
        ? `<p>Research suggestion: ${escapeHtml(researchedDomain)}
             (${escapeHtml(domainResearch.confidence || "low")} confidence)</p>`
        : ""}

      <div class="actions">
        <button
          type="button"
          class="save-email-domain-button"
          data-review-id="${escapeHtml(reviewId)}"
        >Save domain</button>

        <button
          type="button"
          class="find-email-domain-button"
          data-review-id="${escapeHtml(reviewId)}"
        >Find email domain</button>
      </div>

      <div id="email-domain-result"></div>
    </section>
  `;
}


export function renderRecruiterContacts(contacts = []) {
  const rows = contacts.map((contact) => `
    <tr>
      <td>${escapeHtml(contact.fullName)}</td>
      <td class="contact-role-cell">${escapeHtml(contact.role || "")}</td>
      <td>
        <a href="${escapeHtml(contact.linkedinUrl)}"
           target="_blank" rel="noopener">LinkedIn profile</a>
      </td>
      <td>${escapeHtml(contact.emailDomain || "Not resolved")}</td>
    </tr>
  `).join("");

  return `
    <section class="review-section organisation-contact-summary"
             ${contacts.length ? "" : "hidden"}>
      <h2>Organisation contacts</h2>
      <p>Contacts linked to this application. Select an email row to add the reviewed letter to the queue. Removing a contact link does not remove existing queued messages or mail history.</p>
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Role</th>
            <th scope="col">LinkedIn</th>
            <th scope="col">Email domain</th>
          </tr>
        </thead>
        <tbody class="organisation-contact-summary-body">${rows}</tbody>
      </table>
    </section>
  `;
}

