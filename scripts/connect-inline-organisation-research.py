from __future__ import annotations

from datetime import datetime
from pathlib import Path
import difflib
import re
import shutil
import sys

TARGET = Path("src/interfaces/http/create-local-server.js")
PREVIEW_ONLY = "--apply" not in sys.argv


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    print("No changes were made.")
    raise SystemExit(1)


def once_replace(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)

    if count != 1:
        fail(f"Expected one {label} anchor, found {count}.")

    return updated


def insert_once_before(
    text: str,
    anchor: str,
    insertion: str,
    label: str
) -> str:
    count = text.count(anchor)

    if count != 1:
        fail(f"Expected one {label} anchor, found {count}.")

    return text.replace(anchor, insertion + anchor, 1)


def extract_route(text: str, route_path: str, next_anchor: str) -> tuple[int, int, str]:
    start_marker = f"if (method === 'POST' && url.pathname === '{route_path}') {{"
    start = text.find(start_marker)

    if start == -1:
        fail(f"Could not find {route_path} route.")

    end = text.find(next_anchor, start)

    if end == -1:
        fail(f"Could not find end boundary after {route_path} route.")

    return start, end, text[start:end]


def replace_route(
    text: str,
    route_path: str,
    next_anchor: str,
    replacement: str
) -> str:
    start, end, _ = extract_route(text, route_path, next_anchor)
    return text[:start] + replacement + text[end:]


def main() -> None:
    if not TARGET.is_file():
        fail(f"Could not find target file: {TARGET}")

    original = TARGET.read_text(encoding="utf-8")
    content = original

    if "const reviewStore = new Map();" in content:
        print("Inline organisation research appears already connected.")
        print("No changes were made.")
        return

    import_anchor = "import { createServer } from 'node:http';"

    if import_anchor not in content:
        fail("Could not find node:http import.")

    if "from 'node:crypto'" not in content:
        content = content.replace(
            import_anchor,
            import_anchor + "\nimport { randomUUID } from 'node:crypto';",
            1
        )

    escape_anchor = "function escapeHtml(value = '') {"

    content = insert_once_before(
        content,
        escape_anchor,
        "const reviewStore = new Map();\n\n",
        "escapeHtml function"
    )

    helpers = r'''
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

'''.lstrip()

    review_signature = """function renderApplicationReview({
  formData,
  prepared
}) {"""

    if review_signature not in content:
        fail("Could not find the current renderApplicationReview signature.")

    content = content.replace(
        review_signature,
        helpers + """function renderApplicationReview({
  formData,
  prepared,
  reviewId = '',
  research = null
}) {""",
        1
    )

    plain_text_pattern = (
        r"(?m)^(?P<indent>\s*)const plainText = "
        r"prepared\.coverLetter\?\.plainText \|\| '';$"
    )

    def add_research_markup(match: re.Match[str]) -> str:
        indent = match.group("indent")
        return (
            match.group(0)
            + "\n"
            + f"{indent}const researchMarkup = renderOrganisationResearch(\n"
            + f"{indent}  research,\n"
            + f"{indent}  formData.organisationUrl\n"
            + f"{indent});"
        )

    content, count = re.subn(
        plain_text_pattern,
        add_research_markup,
        content,
        count=1
    )

    if count != 1:
        fail("Could not find the plainText declaration.")

    form_anchor = '<form method="post" action="/organisation-research">'

    if content.count(form_anchor) != 1:
        fail("Expected exactly one organisation research form.")

    content = content.replace(
        form_anchor,
        form_anchor
        + '\n        <input type="hidden" name="reviewId" value="${escapeHtml(reviewId)}">',
        1
    )

    cover_letter_heading = "    <h2>Cover letter draft</h2>"

    content = insert_once_before(
        content,
        cover_letter_heading,
        "    ${researchMarkup}\n\n",
        "cover letter heading"
    )

    css_anchor = "    .research-panel {"

    if css_anchor in content and ".research-summary {" not in content:
        css_rules = r'''
    .research-panel details {
      padding: 1rem;
      border: 1px solid #d7deea;
      border-radius: 0.5rem;
      background: #f8fafc;
    }

    .research-panel summary {
      cursor: pointer;
      font-weight: 700;
    }

    .research-panel details > *:not(summary) {
      margin-top: 1rem;
    }

    .research-summary {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      padding: 1rem;
      border: 1px solid #d7deea;
      border-radius: 0.375rem;
      background: #ffffff;
      font: inherit;
    }

'''
        content = insert_once_before(
            content,
            css_anchor,
            css_rules,
            "research panel CSS"
        )

    application_start, application_end, application_route = extract_route(
        content,
        "/applications",
        "    if (method === 'POST' && url.pathname === '/organisation-research') {"
    )

    if "const reviewId = randomUUID();" not in application_route:
        application_route, count = re.subn(
            r"(?m)^(?P<indent>\s*)const prepared = await prepareApplication\(",
            lambda match: (
                f"{match.group('indent')}const prepared = await prepareApplication("
            ),
            application_route,
            count=1
        )

        if count != 1:
            fail("Could not find prepareApplication call in /applications route.")

        render_match = re.search(
            r"sendHtml\(\s*"
            r"response,\s*"
            r"200,\s*"
            r"renderApplicationReview\(\{\s*"
            r"formData,\s*"
            r"prepared\s*"
            r"\}\)\s*"
            r"\);",
            application_route,
            flags=re.DOTALL
        )

        if not render_match:
            fail(
                "Could not find the application-review render call inside "
                "the /applications route."
            )

        replacement = """const reviewId = randomUUID();

      reviewStore.set(reviewId, {
        formData,
        prepared,
        research: null,
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
      );"""

        application_route = (
            application_route[:render_match.start()]
            + replacement
            + application_route[render_match.end():]
        )

        content = (
            content[:application_start]
            + application_route
            + content[application_end:]
        )

    research_start, research_end, research_route = extract_route(
        content,
        "/organisation-research",
        "    if (method !== 'GET' && method !== 'POST') {"
    )

    research_route_replacement = r'''if (method === 'POST' && url.pathname === '/organisation-research') {
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
          research
        })
      );
      return;
    }

'''

    content = (
        content[:research_start]
        + research_route_replacement
        + content[research_end:]
    )

    if content == original:
        fail("Patch produced no changes.")

    diff = "".join(
        difflib.unified_diff(
            original.splitlines(keepends=True),
            content.splitlines(keepends=True),
            fromfile=str(TARGET),
            tofile=f"{TARGET} (inline research)",
            n=2
        )
    )

    if PREVIEW_ONLY:
        print("Preview only: no files were changed.")
        print("Review the proposed diff below.")
        print()
        print(diff)
        print()
        print("If it looks correct, apply it with:")
        print("  py .\\scripts\\connect-inline-organisation-research.py --apply")
        return

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = TARGET.with_name(
        f"{TARGET.name}.{timestamp}.before-inline-research.bak"
    )

    shutil.copy2(TARGET, backup)
    TARGET.write_text(content, encoding="utf-8")

    print(f"Updated: {TARGET}")
    print(f"Backup:  {backup}")
    print("Inline organisation research patch applied successfully.")


if __name__ == "__main__":
    main()