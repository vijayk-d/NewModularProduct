from __future__ import annotations

from datetime import datetime
from pathlib import Path
import difflib
import shutil
import sys

APPLY = "--apply" in sys.argv

SERVER = Path("src/interfaces/http/create-local-server.js")
RUN_SERVER = Path("src/interfaces/http/run-local-server.js")
TESTS = Path("tests/interfaces/http/create-local-server.test.js")


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    print("No changes were made.")
    raise SystemExit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)

    if count != 1:
        fail(f"Expected exactly one {label} anchor; found {count}.")

    return text.replace(old, new, 1)


def insert_before_once(
    text: str,
    anchor: str,
    insertion: str,
    label: str
) -> str:
    count = text.count(anchor)

    if count != 1:
        fail(f"Expected exactly one {label} anchor; found {count}.")

    return text.replace(anchor, insertion + anchor, 1)


def update_local_server(original: str) -> str:
    content = original

    if "coverLetterRefinementPort = null" in content:
        fail(
            "createLocalServer already appears to accept "
            "coverLetterRefinementPort."
        )

    signature_old = """  researchOrganization = null
} = {}) {"""

    signature_new = """  researchOrganization = null,
  coverLetterRefinementPort = null
} = {}) {"""

    content = replace_once(
        content,
        signature_old,
        signature_new,
        "createLocalServer dependency signature"
    )

    review_state_old = """      reviewStore.set(reviewId, {
        formData,
        prepared,
        research: null,
        createdAt: Date.now()
      });"""

    review_state_new = """      reviewStore.set(reviewId, {
        formData,
        prepared,
        research: null,
        originalDraftPlainText: prepared.coverLetter?.plainText || '',
        currentDraftPlainText: prepared.coverLetter?.plainText || '',
        refinementProposal: null,
        createdAt: Date.now()
      });"""

    content = replace_once(
        content,
        review_state_old,
        review_state_new,
        "initial review state"
    )

    review_signature_old = """function renderApplicationReview({
  formData,
  prepared,
  reviewId = '',
  research = null
}) {"""

    review_signature_new = """function renderApplicationReview({
  formData,
  prepared,
  reviewId = '',
  research = null,
  currentDraftPlainText = '',
  refinementProposal = null
}) {"""

    content = replace_once(
        content,
        review_signature_old,
        review_signature_new,
        "renderApplicationReview signature"
    )

    plain_text_old = """  const plainText = prepared.coverLetter?.plainText || '';
"""

    plain_text_new = """  const plainText =
    currentDraftPlainText || prepared.coverLetter?.plainText || '';
"""

    content = replace_once(
        content,
        plain_text_old,
        plain_text_new,
        "plainText declaration"
    )

    helper_anchor = """function renderApplicationReview({
"""

    refinement_helpers = r'''function getSelectableCompanyValues(research) {
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

'''.lstrip()

    content = insert_before_once(
        content,
        helper_anchor,
        refinement_helpers,
        "renderApplicationReview declaration"
    )

    research_markup_anchor = """  const researchMarkup = renderOrganisationResearch(
    research,
    formData.organisationUrl
  );
"""

    research_markup_replacement = """  const researchMarkup = renderOrganisationResearch(
    research,
    formData.organisationUrl
  );
  const refinementMarkup = renderRefinementPanel({
    reviewId,
    research,
    refinementProposal
  });
"""

    content = replace_once(
        content,
        research_markup_anchor,
        research_markup_replacement,
        "research markup declaration"
    )

    cover_letter_anchor = """    ${researchMarkup}

    <h2>Cover letter draft</h2>"""

    cover_letter_replacement = """    ${researchMarkup}

    ${refinementMarkup}

    <h2>Cover letter draft</h2>"""

    content = replace_once(
        content,
        cover_letter_anchor,
        cover_letter_replacement,
        "cover-letter heading"
    )

    research_render_old = """          research
        })
      );"""

    research_render_new = """          research,
          currentDraftPlainText: review.currentDraftPlainText,
          refinementProposal: review.refinementProposal
        })
      );"""

    content = replace_once(
        content,
        research_render_old,
        research_render_new,
        "organisation research review render"
    )

    route_anchor = """    if (method !== 'GET' && method !== 'POST') {
"""

    refinement_route = r'''    if (method === 'POST' && url.pathname === '/cover-letter-refinement') {
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
          selectedCvHighlights: review.formData.cvHighlights || [],
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

'''

    content = insert_before_once(
        content,
        route_anchor,
        refinement_route,
        "method fallback route"
    )

    return content


def update_run_local_server(original: str) -> str:
    if "coverLetterRefinementPort," in original:
        fail(
            "run-local-server already appears to inject "
            "coverLetterRefinementPort."
        )

    old = """const server = createLocalServer({
  researchOrganization: companyResearchPort
    ? (request) => researchOrganization(
        request,
        { companyResearchPort }
      )
    : null,
  prepareApplication(request) {"""

    new = """const server = createLocalServer({
  researchOrganization: companyResearchPort
    ? (request) => researchOrganization(
        request,
        { companyResearchPort }
      )
    : null,
  coverLetterRefinementPort,
  prepareApplication(request) {"""

    return replace_once(
        original,
        old,
        new,
        "run-local-server dependency injection"
    )


def update_tests(original: str) -> str:
    if "returns a refinement proposal without changing the current draft" in original:
        fail("Refinement HTTP tests already appear present.")

    content = original

    start_server_old = """async function startServer({
  prepareApplication = async () => createPreparedApplication(),
  researchOrganization = null
} = {}) {
  const server = createLocalServer({
    prepareApplication,
    researchOrganization
  });"""

    start_server_new = """async function startServer({
  prepareApplication = async () => createPreparedApplication(),
  researchOrganization = null,
  coverLetterRefinementPort = null
} = {}) {
  const server = createLocalServer({
    prepareApplication,
    researchOrganization,
    coverLetterRefinementPort
  });"""

    content = replace_once(
        content,
        start_server_old,
        start_server_new,
        "HTTP test startServer helper"
    )

    new_tests = r'''

test('renders refinement value selection after successful organisation research', async (t) => {
  const { server, baseUrl } = await startServer({
    researchOrganization: async () => ({
      status: 'found',
      provider: 'fake-research',
      researchedAt: '2026-10-05T12:00:00.000Z',
      summary: 'Example Ltd values delivery excellence.',
      companyValues: ['Delivery excellence', 'Collaboration'],
      sources: [{
        title: 'Example Ltd',
        url: 'https://example.test'
      }]
    })
  });
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  const response = await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({ reviewId })
  });

  assert.equal(response.status, 200);
  assert.match(
    response.text,
    /<form method="post" action="\/cover-letter-refinement">/
  );
  assert.match(response.text, /name="selectedResearchPointIds"/);
  assert.match(response.text, /value="company-value-1"/);
  assert.match(response.text, /Delivery excellence/);
  assert.match(response.text, /Collaboration/);
  assert.match(response.text, /Polish cover letter/);
});

test('returns a refinement proposal without changing the current draft', async (t) => {
  const refinementCalls = [];

  const { server, baseUrl } = await startServer({
    researchOrganization: async () => ({
      status: 'found',
      provider: 'fake-research',
      researchedAt: '2026-10-05T12:00:00.000Z',
      summary: 'Example Ltd values delivery excellence.',
      companyValues: ['Delivery excellence'],
      sources: [{
        title: 'Example Ltd',
        url: 'https://example.test'
      }]
    }),
    coverLetterRefinementPort: {
      async refine(request) {
        refinementCalls.push(request);

        return {
          proposedDraft: 'Proposed refined draft',
          warnings: [],
          appliedResearchPointIds: ['company-value-1'],
          provider: 'fake-refinement'
        };
      }
    }
  });
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  const researched = await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({ reviewId })
  });

  assert.equal(researched.status, 200);

  const refined = await request(baseUrl, '/cover-letter-refinement', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      reviewId,
      selectedResearchPointIds: 'company-value-1'
    })
  });

  assert.equal(refined.status, 200);
  assert.deepEqual(refinementCalls, [{
    draftPlainText:
      'Dear Hiring Manager,\n\nI am applying for the Project Manager role.',
    jobDescriptionSummary: 'Project Manager',
    selectedCvHighlights: [],
    companyValues: ['Delivery excellence'],
    selectedResearchPoints: [{
      id: 'company-value-1',
      type: 'value',
      text: 'Delivery excellence',
      sourceUrl: ''
    }],
    organisationUrl: 'https://example.test',
    instructions: '',
    maxWords: 450
  }]);
  assert.match(refined.text, /Proposed refined draft/);
  assert.match(
    refined.text,
    /This proposal has not changed the current draft\./
  );
  assert.match(refined.text, /Dear Hiring Manager,/);
  assert.ok(
    refined.text.indexOf('Proposed refined draft') <
      refined.text.indexOf('Cover letter draft')
  );
});

test('rejects refinement when no research value is selected', async (t) => {
  const { server, baseUrl } = await startServer({
    researchOrganization: async () => ({
      status: 'found',
      companyValues: ['Delivery excellence'],
      summary: 'Summary',
      sources: []
    }),
    coverLetterRefinementPort: {
      async refine() {
        throw new Error('Should not be called.');
      }
    }
  });
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({ reviewId })
  });

  const response = await request(baseUrl, '/cover-letter-refinement', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({ reviewId })
  });

  assert.equal(response.status, 400);
  assert.match(
    response.text,
    /Select at least one verified organisation value/
  );
});

test('retains the review when refinement is disabled', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  const response = await request(baseUrl, '/cover-letter-refinement', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      reviewId,
      selectedResearchPointIds: 'company-value-1'
    })
  });

  assert.equal(response.status, 503);
  assert.match(
    response.text,
    /Cover-letter refinement is disabled/
  );
  assert.match(response.text, /Dear Hiring Manager,/);
});
'''

    return content.rstrip() + "\n" + new_tests


def main() -> None:
    for target in (SERVER, RUN_SERVER, TESTS):
        if not target.is_file():
            fail(f"Missing target file: {target}")

    original_server = SERVER.read_text(encoding="utf-8")
    original_run_server = RUN_SERVER.read_text(encoding="utf-8")
    original_tests = TESTS.read_text(encoding="utf-8")

    if "url.pathname === '/cover-letter-refinement'" in original_server:
        fail("The refinement preview route already appears to be present.")

    updated_server = update_local_server(original_server)
    updated_run_server = update_run_local_server(original_run_server)
    updated_tests = update_tests(original_tests)

    changes = {
        SERVER: (original_server, updated_server),
        RUN_SERVER: (original_run_server, updated_run_server),
        TESTS: (original_tests, updated_tests)
    }

    diffs = []

    for target, (before, after) in changes.items():
        diffs.append(
            "".join(
                difflib.unified_diff(
                    before.splitlines(keepends=True),
                    after.splitlines(keepends=True),
                    fromfile=str(target),
                    tofile=f"{target} (refinement preview)",
                    n=2
                )
            )
        )

    if not APPLY:
        print("Preview only: no files were changed.\n")
        print("\n".join(diffs))
        print("\nApply with:")
        print("  py .\\scripts\\add-cover-letter-refinement-preview.py --apply")
        return

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    for target, (_, after) in changes.items():
        backup = target.with_name(
            f"{target.name}.{timestamp}.before-refinement-preview.bak"
        )
        shutil.copy2(target, backup)
        target.write_text(after, encoding="utf-8")

        print(f"Updated: {target}")
        print(f"Backup:  {backup}")

    print("Cover-letter refinement preview route applied.")


if __name__ == "__main__":
    main()