from pathlib import Path

server_path = Path("src/interfaces/http/create-local-server.js")
review_page_path = Path("src/interfaces/http/review-page.js")

server = server_path.read_text(encoding="utf-8")
review_page = review_page_path.read_text(encoding="utf-8")

linking_route = '''    if (
      method === "GET" &&
      url.pathname === "/api/recruiter-contacts/linking"
    ) {
      if (!recruiterContactStore) {
        sendJson(response, 503, {
          ok: false,
          error: "Recruiter contact store is not configured."
        });
        return;
      }

      try {
        const reviewId = url.searchParams.get("reviewId");

        if (!reviewId) {
          sendJson(response, 400, {
            ok: false,
            error: "reviewId is required."
          });
          return;
        }

        const review = reviewStore.get(reviewId);

        if (!review) {
          sendJson(response, 404, {
            ok: false,
            error: "Application review not found."
          });
          return;
        }

        const linkedContacts = await loadReviewContacts(reviewId);
        const organisationContacts = await loadOrganisationContacts(
          review.formData
        );

        const linkedContactIds = new Set(
          linkedContacts.map((contact) => contact.id)
        );

        const unlinkedContacts = organisationContacts.filter(
          (contact) => !linkedContactIds.has(contact.id)
        );

        sendJson(response, 200, {
          ok: true,
          linked: linkedContacts,
          unlinked: unlinkedContacts
        });
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error
            ? error.message
            : "Unable to load imported contacts."
        });
      }

      return;
    }

'''

delete_route_marker = '''    if (
      method === "POST" &&
      url.pathname === "/api/recruiter-contacts/delete"
    ) {'''

if '/api/recruiter-contacts/linking' in server:
    print("Linking route already exists. No server changes made.")
elif delete_route_marker not in server:
    raise SystemExit("Could not find delete route marker. No changes made.")
else:
    server = server.replace(
        delete_route_marker,
        linking_route + delete_route_marker,
        1,
    )

# Make the browser handler report HTTP errors clearly.
old_fetch = '''  const response = await fetch(
    `/api/recruiter-contacts/linking?reviewId=${encodeURIComponent(reviewId)}`
  );

  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(
      payload.error || "Unable to refresh imported contacts."
    );
  }'''

new_fetch = '''  const response = await fetch(
    `/api/recruiter-contacts/linking?reviewId=${encodeURIComponent(reviewId)}`
  );

  const responseText = await response.text();

  let payload;

  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Unable to refresh imported contacts (HTTP ${response.status}).`
    );
  }

  if (!response.ok || !payload.ok) {
    throw new Error(
      payload.error ||
        `Unable to refresh imported contacts (HTTP ${response.status}).`
    );
  }'''

if old_fetch in review_page:
    review_page = review_page.replace(old_fetch, new_fetch, 1)
    print("Improved refresh error handling.")
elif new_fetch in review_page:
    print("Refresh error handling already updated.")
else:
    print("Warning: could not find refresh fetch block; server route was still updated.")

server_path.write_text(server, encoding="utf-8", newline="\n")
review_page_path.write_text(review_page, encoding="utf-8", newline="\n")

print("Added /api/recruiter-contacts/linking route.")
