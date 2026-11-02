from __future__ import annotations

from datetime import datetime
from pathlib import Path
import difflib
import shutil
import sys

APPLY = "--apply" in sys.argv

SERVER = Path("src/interfaces/http/create-local-server.js")
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


def update_server(original: str) -> str:
    content = original

    if "url.pathname === '/cover-letter-refinement/apply'" in content:
        fail("The refinement apply route already appears to be present.")

    import_anchor = """import { randomUUID } from 'node:crypto';
"""

    import_replacement = """import { randomUUID } from 'node:crypto';
import {
  acceptRefinedCoverLetter
} from '../../application/accept-refined-cover-letter.js';
"""

    content = replace_once(
        content,
        import_anchor,
        import_replacement,
        "randomUUID import"
    )

    proposal_markup_old = """  const proposalMarkup = refinementProposal?.proposedDraft
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
"""

    proposal_markup_new = """  const proposalMarkup = refinementProposal?.proposedDraft
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
"""

    content = replace_once(
        content,
        proposal_markup_old,
        proposal_markup_new,
        "proposal preview markup"
    )

    cover_letter_anchor = """    <h2>Cover letter draft</h2>
    <label for="cover-letter-draft">Generated cover letter</label>"""

    cover_letter_replacement = """    <h2>Cover letter draft</h2>
    ${
      refinementProposal?.appliedMessage
        ? `<p class="notice">${escapeHtml(refinementProposal.appliedMessage)}</p>`
        : ''
    }
    <label for="cover-letter-draft">Generated cover letter</label>"""

    content = replace_once(
        content,
        cover_letter_anchor,
        cover_letter_replacement,
        "cover-letter draft heading"
    )

    route_anchor = """    if (method !== 'GET' && method !== 'POST') {
"""

    apply_route = r'''    if (method === 'POST' && url.pathname === '/cover-letter-refinement/apply') {
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

'''

    content = insert_before_once(
        content,
        route_anchor,
        apply_route,
        "method fallback route"
    )

    return content


def update_tests(original: str) -> str:
    if "applies a refinement proposal only through the explicit local apply route" in original:
        fail("Refinement-apply HTTP tests already appear to be present.")

    tests = r'''

test('applies a refinement proposal only through the explicit local apply route', async (t) => {
  let refinementCalls = 0;

  const { server, baseUrl } = await startServer({
    researchOrganization: async () => ({
      status: 'found',
      companyValues: ['Delivery excellence'],
      summary: 'Summary',
      sources: []
    }),
    coverLetterRefinementPort: {
      async refine() {
        refinementCalls += 1;

        return {
          proposedDraft:
            'Dear Hiring Manager,\n\nThis is the approved refined draft.',
          warnings: []
        };
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

  const proposed = await request(baseUrl, '/cover-letter-refinement', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      reviewId,
      selectedResearchPointIds: 'company-value-1'
    })
  });

  assert.equal(proposed.status, 200);
  assert.equal(refinementCalls, 1);
  assert.match(
    proposed.text,
    /Use proposal as current draft/
  );
  assert.match(
    proposed.text,
    /Dear Hiring Manager,\n\nI am applying for the Project Manager role\./
  );

  const applied = await request(
    baseUrl,
    '/cover-letter-refinement/apply',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: formBody({ reviewId })
    }
  );

  assert.equal(applied.status, 200);
  assert.equal(refinementCalls, 1);
  assert.match(
    applied.text,
    /Current draft updated from your approved refinement proposal\./
  );
  assert.match(
    applied.text,
    /Dear Hiring Manager,\n\nThis is the approved refined draft\./
  );
  assert.doesNotMatch(
    applied.text,
    /<textarea id="proposed-cover-letter"/
  );
  assert.doesNotMatch(
    applied.text,
    /Use proposal as current draft/
  );
});

test('does not apply a refinement when no proposal exists', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const review = await prepareReview(baseUrl);
  const reviewId = extractReviewId(review.text);

  const response = await request(
    baseUrl,
    '/cover-letter-refinement/apply',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: formBody({ reviewId })
    }
  );

  assert.equal(response.status, 400);
  assert.match(
    response.text,
    /There is no refinement proposal available to apply\./
  );
  assert.match(
    response.text,
    /Dear Hiring Manager,\n\nI am applying for the Project Manager role\./
  );
});

test('returns 410 when applying a refinement for an expired review', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await request(
    baseUrl,
    '/cover-letter-refinement/apply',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: formBody({
        reviewId: 'missing-review'
      })
    }
  );

  assert.equal(response.status, 410);
  assert.match(
    response.text,
    /This application review is no longer available\. Please prepare the application again\./
  );
});
'''

    return original.rstrip() + "\n" + tests


def main() -> None:
    for target in (SERVER, TESTS):
        if not target.is_file():
            fail(f"Missing target file: {target}")

    original_server = SERVER.read_text(encoding="utf-8")
    original_tests = TESTS.read_text(encoding="utf-8")

    updated_server = update_server(original_server)
    updated_tests = update_tests(original_tests)

    changes = {
        SERVER: (original_server, updated_server),
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
                    tofile=f"{target} (apply refinement)",
                    n=2
                )
            )
        )

    if not APPLY:
        print("Preview only: no files were changed.\n")
        print("\n".join(diffs))
        print("\nApply with:")
        print("  py .\\scripts\\add-apply-refinement-proposal.py --apply")
        return

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    for target, (_, after) in changes.items():
        backup = target.with_name(
            f"{target.name}.{timestamp}.before-apply-refinement.bak"
        )

        shutil.copy2(target, backup)
        target.write_text(after, encoding="utf-8")

        print(f"Updated: {target}")
        print(f"Backup:  {backup}")

    print("Explicit local refinement-apply route added.")


if __name__ == "__main__":
    main()