from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDERING = ROOT / "src" / "interfaces" / "http" / "rendering.js"

START = '''  <script>
    document
      .querySelector(".find-email-domain-button")'''

END = '''  </script>
</body>
</html>

${renderRecruiterContacts(contacts)}'''

text = RENDERING.read_text(encoding="utf-8")

start_index = text.find(START)

if start_index == -1:
    raise SystemExit(
        "ERROR: Could not find the inserted email-domain script. "
        "No changes were made."
    )

end_index = text.find(END, start_index)

if end_index == -1:
    raise SystemExit(
        "ERROR: Could not find the end of the inserted email-domain script. "
        "No changes were made."
    )

replacement = '''  <script>
    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    document
      .querySelector(".find-email-domain-button")
      ?.addEventListener("click", async function (event) {
        var button = event.target;
        var reviewId = button.dataset.reviewId;
        var status = document.getElementById("email-domain-status");
        var result = document.getElementById("email-domain-result");

        button.disabled = true;
        status.textContent = "Researching email domain in the background…";
        result.innerHTML = "";

        try {
          var startResponse = await fetch(
            "/api/reviews/" +
              encodeURIComponent(reviewId) +
              "/resolve-email-domain",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({})
            }
          );

          var startData = await startResponse.json();

          if (!startResponse.ok || !startData.ok) {
            throw new Error(
              startData.error ||
                "Unable to start email-domain resolution."
            );
          }

          var jobId = startData.job.jobId;

          var poll = async function () {
            var jobResponse = await fetch(
              "/api/email-domain-jobs/" +
                encodeURIComponent(jobId)
            );

            var jobData = await jobResponse.json();
            var job = jobData.job;

            if (job.status === "completed") {
              status.textContent =
                "Email domain resolved: " +
                job.result.emailDomain +
                " — " +
                job.result.confidence +
                " confidence.";

              var evidenceHtml = job.result.evidence
                .map(function (item) {
                  return (
                    "<li><a href=\\"" +
                    escapeHtml(item.url) +
                    "\\" target=\\"_blank\\" rel=\\"noopener\\">" +
                    escapeHtml(item.title || item.url) +
                    "</a></li>"
                  );
                })
                .join("");

              var candidateHtml = job.result.emailCandidates
                .map(function (candidate) {
                  return (
                    "<li>" +
                    escapeHtml(candidate.email) +
                    " <em>(" +
                    escapeHtml(candidate.type) +
                    ", unverified)</em></li>"
                  );
                })
                .join("");

              result.innerHTML =
                "<p><strong>Reasoning:</strong> " +
                escapeHtml(job.result.reasoning) +
                "</p>" +
                "<p><strong>Evidence:</strong></p>" +
                "<ul>" +
                evidenceHtml +
                "</ul>" +
                "<p><strong>Inferred email candidates:</strong></p>" +
                "<ul>" +
                candidateHtml +
                "</ul>";

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
              "Email-domain resolution: " + job.status + "…";
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

${renderRecruiterContacts(contacts)}'''

text = (
    text[:start_index]
    + replacement
    + text[end_index + len(END):]
)

RENDERING.write_text(text, encoding="utf-8", newline="\n")

print("PATCHED: replaced unsafe email-domain browser script")
print(f"Updated: {RENDERING}")