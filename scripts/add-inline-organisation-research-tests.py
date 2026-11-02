from __future__ import annotations

from datetime import datetime
from pathlib import Path
import difflib
import shutil
import sys

TARGET = Path("tests/interfaces/http/create-local-server.test.js")
APPLY = "--apply" in sys.argv


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    print("No changes were made.")
    raise SystemExit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)

    if count != 1:
        fail(f"Expected exactly one {label} anchor; found {count}.")

    return text.replace(old, new, 1)


def main() -> None:
    if not TARGET.is_file():
        fail(f"Could not find {TARGET}")

    original = TARGET.read_text(encoding="utf-8")

    if "re-renders an application review with inline organisation research" in original:
        print("Inline organisation research tests already appear present.")
        print("No changes were made.")
        return

    content = original

    old_start_server = """async function startServer({
  prepareApplication = async () => createPreparedApplication()
} = {}) {
  const server = createLocalServer({
    prepareApplication
  });"""

    new_start_server = """async function startServer({
  prepareApplication = async () => createPreparedApplication(),
  researchOrganization = null
} = {}) {
  const server = createLocalServer({
    prepareApplication,
    researchOrganization
  });"""

    content = replace_once(
        content,
        old_start_server,
        new_start_server,
        "startServer helper"
    )

    helpers_anchor = """function formBody(values) {
  return new URLSearchParams(values).toString();
}
"""

    helpers_replacement = """function formBody(values) {
  return new URLSearchParams(values).toString();
}

function extractReviewId(html) {
  const match = html.match(
    /name="reviewId" value="([^"]+)"/
  );

  assert.ok(match, 'Expected a reviewId hidden form field.');
  return match[1];
}

async function prepareReview(baseUrl, values = {}) {
  const response = await request(baseUrl, '/applications', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      jobTitle: 'Project Manager',
      organisationName: 'Example Ltd',
      organisationUrl: 'https://example.test',
      jobDescriptionText: 'Delivery leadership',
      ...values
    })
  });

  assert.equal(response.status, 200);
  return response;
}
"""

    content = replace_once(
        content,
        helpers_anchor,
        helpers_replacement,
        "formBody helper"
    )

    tests = r'''

test('includes a local review ID in the organisation research form', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await prepareReview(baseUrl);

  assert.match(
    response.text,
    /<form method="post" action="\/organisation-research">/
  );
  assert.match(
    response.text,
    /<input type="hidden" name="reviewId" value="[^"]+">/
  );
});

test('re-renders an application review with inline organisation research', async (t) => {
  const researchCalls = [];

  const { server, baseUrl } = await startServer({
    async researchOrganization(request) {
      researchCalls.push(request);

      return {
        status: 'found',
        provider: 'fake-research',
        researchedAt: '2026-10-05T12:00:00.000Z',
        summary: 'Example Ltd values delivery excellence.',
        companyValues: ['Delivery excellence', 'Collaboration'],
        sources: [
          {
            title: 'Example Ltd',
            url: 'https://example.test'
          },
          {
            title: 'Independent profile',
            url: 'https://directory.test/example-ltd'
          }
        ]
      };
    }
  });
  t.after(() => server.close());

  const review = await prepareReview(baseUrl, {
    jobTitle: 'Programme Manager',
    organisationName: 'Example Ltd',
    organisationUrl: 'https://example.test'
  });

  const reviewId = extractReviewId(review.text);

  const response = await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({ reviewId })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(researchCalls, [{
    companyName: 'Example Ltd',
    companyUrl: 'https://example.test',
    jobDescriptionSummary: 'Programme Manager',
    forceRefresh: false
  }]);
  assert.match(response.text, /<title>Application review<\/title>/);
  assert.match(response.text, /<h1>Application review<\/h1>/);
  assert.match(response.text, /<summary>Research result<\/summary>/);
  assert.match(response.text, /Provider:<\/strong> fake-research/);
  assert.match(response.text, /Example Ltd values delivery excellence\./);
  assert.match(response.text, /Delivery excellence/);
  assert.match(response.text, /Collaboration/);
  assert.match(
    response.text,
    /href="https:\/\/example\.test\/" target="_blank" rel="noreferrer noopener">Example Ltd/
  );
  assert.match(response.text, /Additional sources \(1\)/);
  assert.match(response.text, /Dear Hiring Manager,/);

  assert.ok(
    response.text.indexOf('Research result') <
      response.text.indexOf('Cover letter draft')
  );
});

test('escapes provider-supplied organisation research before rendering', async (t) => {
  const { server, baseUrl } = await startServer({
    async researchOrganization() {
      return {
        status: 'found',
        provider: '<script>provider()</script>',
        researchedAt: '2026-10-05T12:00:00.000Z',
        summary: '<img src=x onerror=alert(1)>',
        companyValues: ['<script>value()</script>'],
        sources: [{
          title: '<script>source()</script>',
          url: 'javascript:alert(1)'
        }]
      };
    }
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
  assert.doesNotMatch(response.text, /<script>provider\(\)<\/script>/);
  assert.doesNotMatch(response.text, /<img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(response.text, /href="javascript:alert\(1\)"/);
  assert.match(
    response.text,
    /&lt;script&gt;provider\(\)&lt;\/script&gt;/
  );
  assert.match(
    response.text,
    /&lt;img src=x onerror=alert\(1\)&gt;/
  );
  assert.match(
    response.text,
    /&lt;script&gt;value\(\)&lt;\/script&gt;/
  );
  assert.match(
    response.text,
    /&lt;script&gt;source\(\)&lt;\/script&gt;/
  );
});

test('returns 410 when organisation research has no active review', async (t) => {
  const { server, baseUrl } = await startServer({
    async researchOrganization() {
      throw new Error('Research should not be called.');
    }
  });
  t.after(() => server.close());

  const response = await request(baseUrl, '/organisation-research', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      reviewId: 'missing-review'
    })
  });

  assert.equal(response.status, 410);
  assert.match(
    response.text,
    /This application review is no longer available\. Please prepare the application again\./
  );
});

test('renders an inline error when organisation research is disabled', async (t) => {
  const { server, baseUrl } = await startServer();
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

  assert.equal(response.status, 503);
  assert.match(response.text, /<title>Application review<\/title>/);
  assert.match(response.text, /<h1>Application review<\/h1>/);
  assert.match(
    response.text,
    /Organisation research is disabled\. Set ENABLE_PERPLEXITY_RESEARCH=true and restart the local server\./
  );
  assert.match(response.text, /Dear Hiring Manager,/);
});

test('retains the review and shows an inline error when research throws', async (t) => {
  const { server, baseUrl } = await startServer({
    async researchOrganization() {
      throw new Error('Provider connection failed');
    }
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
  assert.match(response.text, /<title>Application review<\/title>/);
  assert.match(response.text, /<summary>Research result<\/summary>/);
  assert.match(response.text, /Provider connection failed/);
  assert.match(response.text, /Dear Hiring Manager,/);
});
'''.lstrip()

    content = content.rstrip() + "\n" + tests

    diff = ''.join(
        difflib.unified_diff(
            original.splitlines(keepends=True),
            content.splitlines(keepends=True),
            fromfile=str(TARGET),
            tofile=f'{TARGET} (with inline research tests)',
            n=2
        )
    )

    if not APPLY:
        print("Preview only: no files were changed.\n")
        print(diff)
        print("\nApply with:")
        print("  py .\\scripts\\add-inline-organisation-research-tests.py --apply")
        return

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = TARGET.with_name(
        f"{TARGET.name}.{timestamp}.before-inline-research-tests.bak"
    )

    shutil.copy2(TARGET, backup)
    TARGET.write_text(content, encoding="utf-8")

    print(f"Updated: {TARGET}")
    print(f"Backup:  {backup}")
    print("Inline organisation research tests added.")


if __name__ == "__main__":
    main()