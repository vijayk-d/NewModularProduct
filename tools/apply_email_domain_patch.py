from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SERVER = ROOT / "src" / "interfaces" / "http" / "create-local-server.js"
RENDERING = ROOT / "src" / "interfaces" / "http" / "rendering.js"
PERPLEXITY = ROOT / "src" / "infrastructure" / "perplexity-client.js"


def replace_once(path, old, new, label):
    text = path.read_text(encoding="utf-8")

    if old not in text:
        raise SystemExit(f"ERROR: Could not find anchor for: {label}")

    if text.count(old) != 1:
        raise SystemExit(
            f"ERROR: Anchor for '{label}' occurs {text.count(old)} times; "
            "expected exactly once."
        )

    path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")
    print(f"PATCHED: {label}")


# 1. Make the Perplexity client validate its API key only when used.
replace_once(
    PERPLEXITY,
    '''export function createPerplexityClient({ apiKey }) {
  if (!apiKey) {
    throw new Error(
      "PERPLEXITY_API_KEY is not configured. Add it to the local .env file."
    );
  }

  return {''',
    '''export function createPerplexityClient({ apiKey }) {
  return {''',
    "Perplexity client: remove startup API-key check"
)

replace_once(
    PERPLEXITY,
    '''    async resolveEmailDomain({
      organisationName,
      organisationUrl,
      linkedinUrl
    }) {
      const prompt = `''',
    '''    async resolveEmailDomain({
      organisationName,
      organisationUrl,
      linkedinUrl
    }) {
      if (!apiKey) {
        throw new Error(
          "PERPLEXITY_API_KEY is not configured. Add it to the local .env file."
        );
      }

      const prompt = `''',
    "Perplexity client: add request-time API-key check"
)

# 2. Create the email-domain service inside createLocalServer.
replace_once(
    SERVER,
    '''  async function loadReviewContacts(reviewId) {
    if (!recruiterContactStore) {
      return [];
    }

    return recruiterContactStore.listByReview(reviewId);
  }
''',
    '''  async function loadReviewContacts(reviewId) {
    if (!recruiterContactStore) {
      return [];
    }

    return recruiterContactStore.listByReview(reviewId);
  }

  const perplexityClient = createPerplexityClient({
    apiKey: process.env.PERPLEXITY_API_KEY
  });

  const emailDomainResolutionService = createEmailDomainResolutionService({
    perplexityClient,
    recruiterContactStore
  });
''',
    "Server: create email-domain resolution service"
)

# 3. Add the three email-domain API routes.
replace_once(
    SERVER,
    '''    if (method !== 'GET' && method !== 'POST') {''',
    '''    if (
      method === "POST" &&
      /^\\/api\\/reviews\\/[^/]+\\/resolve-email-domain$/.test(url.pathname)
    ) {
      const reviewId = decodeURIComponent(url.pathname.split("/")[3]);
      const review = reviewStore.get(reviewId);

      if (!review) {
        sendJson(response, 404, {
          ok: false,
          error: "Application review not found."
        });
        return;
      }

      try {
        const body = await readJsonBody(request);

        const job = await emailDomainResolutionService.startResolution({
          reviewId,
          organisation: {
            name: review.formData.organisationName,
            url: review.formData.organisationUrl,
            linkedinUrl: body.linkedinUrl || ""
          }
        });

        sendJson(response, 202, {
          ok: true,
          job
        });
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error
            ? error.message
            : "Email-domain resolution could not be started."
        });
      }

      return;
    }

    if (
      method === "GET" &&
      /^\\/api\\/email-domain-jobs\\/[^/]+$/.test(url.pathname)
    ) {
      const jobId = decodeURIComponent(url.pathname.split("/").pop());
      const job = await emailDomainResolutionService.getJob(jobId);

      if (!job) {
        sendJson(response, 404, {
          ok: false,
          error: "Email-domain resolution job not found."
        });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        job
      });
      return;
    }

    if (
      method === "GET" &&
      /^\\/api\\/reviews\\/[^/]+\\/email-domain$/.test(url.pathname)
    ) {
      const reviewId = decodeURIComponent(url.pathname.split("/")[3]);
      const resolution = await emailDomainResolutionService.getResolution(
        reviewId
      );

      sendJson(response, 200, {
        ok: true,
        resolution
      });
      return;
    }

    if (method !== 'GET' && method !== 'POST') {''',
    "Server: add email-domain API routes"
)

# 4. Render the email-domain section after contact linking.
replace_once(
    RENDERING,
    '''${renderContactLinking(contactLinking)}
`;''',
    '''${renderContactLinking(contactLinking)}

${renderEmailDomainResolution(reviewId)}
`;''',
    "Rendering: add email-domain section to review page"
)

# 5. Add the email-domain renderer function.
replace_once(
    RENDERING,
    '''export function renderRecruiterContacts(contacts = []) {''',
    '''export function renderEmailDomainResolution(reviewId) {
  return `
    <section class="review-section" id="email-domain-resolution">
      <h2>Email domain</h2>

      <p id="email-domain-status">Not resolved.</p>

      <button
        type="button"
        class="find-email-domain-button"
        data-review-id="${escapeHtml(reviewId)}"
      >
        Find email domain
      </button>

      <div id="email-domain-result"></div>
    </section>
  `;
}

export function renderRecruiterContacts(contacts = []) {''',
    "Rendering: add email-domain renderer function"
)

# 6. Add browser polling immediately before the review page closes.
replace_once(
    RENDERING,
    '''  </script>
</body>
</html>

${renderRecruiterContacts(contacts)}''',
    '''  </script>

  <script>
    document
      .querySelector(".find-email-domain-button")
      ?.addEventListener("click", async (event) => {
        const button = event.target;
        const reviewId = button.dataset.reviewId;
        const status = document.getElementById("email-domain-status");
        const result = document.getElementById("email-domain-result");

        button.disabled = true;
        status.textContent = "Researching email domain in the background…";
        result.innerHTML = "";

        try {
          const startResponse = await fetch(
            `/api/reviews/${reviewId}/resolve-email-domain`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({})
            }
          );

          const startData = await startResponse.json();

          if (!startResponse.ok || !startData.ok) {
            throw new Error(
              startData.error || "Unable to start email-domain resolution."
            );
          }

          const jobId = startData.job.jobId;

          const poll = async () => {
            const jobResponse = await fetch(
              `/api/email-domain-jobs/${jobId}`
            );
            const jobData = await jobResponse.json();
            const job = jobData.job;

            if (job.status === "completed") {
              status.textContent =
                `Email domain resolved: ${job.result.emailDomain} — ${job.result.confidence} confidence.`;

              result.innerHTML = `
                <p><strong>Reasoning:</strong> ${job.result.reasoning}</p>

                <p><strong>Evidence:</strong></p>
                <ul>
                  ${job.result.evidence
                    .map(
                      (item) => `
                        <li>
                          <a
                            href="${item.url}"
                            target="_blank"
                            rel="noopener"
                          >
                            ${item.title || item.url}
                          </a>
                        </li>
                      `
                    )
                    .join("")}
                </ul>

                <p><strong>Inferred email candidates:</strong></p>
                <ul>
                  ${job.result.emailCandidates
                    .map(
                      (candidate) => `
                        <li>
                          ${candidate.email}
                          <em>(${candidate.type}, unverified)</em>
                        </li>
                      `
                    )
                    .join("")}
                </ul>
              `;

              button.disabled = false;
              return;
            }

            if (job.status === "failed") {
              status.textContent =
                job.error || "Email-domain resolution failed.";
              button.disabled = false;
              return;
            }

            status.textContent =
              `Email-domain resolution: ${job.status}…`;
            setTimeout(poll, 2000);
          };

          await poll();
        } catch (error) {
          status.textContent =
            error.message || "Email-domain resolution failed.";
          button.disabled = false;
        }
      });
  </script>
</body>
</html>

${renderRecruiterContacts(contacts)}''',
    "Rendering: add email-domain polling script"
)

print("\nAll email-domain patches applied successfully.")