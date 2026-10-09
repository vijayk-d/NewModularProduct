from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

STORE = ROOT / "src" / "application" / "recruiter-contact-store.js"
SERVER = ROOT / "src" / "interfaces" / "http" / "create-local-server.js"
RENDERING = ROOT / "src" / "interfaces" / "http" / "rendering.js"


def replace_once(path, old, new, label):
    text = path.read_text(encoding="utf-8")

    if old not in text:
        raise SystemExit(f"ERROR: anchor not found for: {label}")

    if text.count(old) != 1:
        raise SystemExit(
            f"ERROR: anchor for '{label}' occurs {text.count(old)} times; "
            "expected exactly once."
        )

    path.write_text(
        text.replace(old, new, 1),
        encoding="utf-8",
        newline="\n"
    )

    print(f"PATCHED: {label}")


# 1. Add safe deletion methods to the recruiter-contact store.
replace_once(
    STORE,
    '''    return linked;
  },
    async listByOrganisation(organisationId) {''',
    '''    return linked;
  },

  async deleteUnlinkedContacts({
    organisationId,
    reviewId,
    contactIds
  }) {
    const contacts = await load();
    const requestedIds = new Set(contactIds || []);
    const deletedContacts = [];

    const remainingContacts = contacts.filter((contact) => {
      const belongsToOrganisation =
        contact.organisationId === organisationId;

      const isLinkedToReview =
        Array.isArray(contact.linkedApplicationReviewIds) &&
        contact.linkedApplicationReviewIds.includes(reviewId);

      const isRequested =
        !contactIds || requestedIds.has(contact.id);

      const shouldDelete =
        belongsToOrganisation &&
        !isLinkedToReview &&
        isRequested;

      if (shouldDelete) {
        deletedContacts.push(contact);
        return false;
      }

      return true;
    });

    await save(remainingContacts);

    return deletedContacts;
  },

    async listByOrganisation(organisationId) {''',
    "Store: add deleteUnlinkedContacts"
)

# 2. Add the delete API route.
replace_once(
    SERVER,
    '''    if (method !== 'GET' && method !== 'POST') {''',
    '''    if (
      method === "POST" &&
      url.pathname === "/api/recruiter-contacts/delete"
    ) {
      if (!recruiterContactStore) {
        sendJson(response, 503, {
          ok: false,
          error: "Recruiter contact store is not configured."
        });
        return;
      }

      try {
        const body = await readJsonBody(request);
        const reviewId = body.reviewId;
        const review = reviewStore.get(reviewId);

        if (!review) {
          sendJson(response, 404, {
            ok: false,
            error: "Application review not found."
          });
          return;
        }

        const organisationId = deriveReviewOrganisationId(
          review.formData
        );

        const deletedContacts =
          await recruiterContactStore.deleteUnlinkedContacts({
            organisationId,
            reviewId,
            contactIds: body.contactIds || []
          });

        writeDiagnostic("recruiter_contacts_deleted", {
          requestId,
          reviewId,
          organisationId,
          deleted: deletedContacts.length
        });

        sendJson(response, 200, {
          ok: true,
          deleted: deletedContacts.length,
          deletedContacts
        });
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error
            ? error.message
            : "Unable to delete imported contacts."
        });
      }

      return;
    }

    if (method !== 'GET' && method !== 'POST') {''',
    "Server: add contact-delete API route"
)

# 3. Add Delete selected and Clear imported contacts buttons.
replace_once(
    RENDERING,
    '''            <button type="submit">Link selected contacts</button>
          </form>

          <script>''',
    '''            <button type="submit">Link selected contacts</button>
          </form>

          <div style="display:flex;gap:8px;margin-top:12px;">
            <button
              type="button"
              class="delete-selected-contacts-button"
              data-review-id="${escapeHtml(contactLinking.reviewId)}"
            >
              Delete selected
            </button>

            <button
              type="button"
              class="clear-imported-contacts-button"
              data-review-id="${escapeHtml(contactLinking.reviewId)}"
            >
              Clear imported contacts
            </button>
          </div>

          <script>''',
    "Rendering: add delete and clear buttons"
)

# 4. Wire both buttons to the delete endpoint.
replace_once(
    RENDERING,
    '''                document
                  .querySelectorAll(".contact-link-checkbox")
                  .forEach((checkbox) => {
                    checkbox.checked = event.target.checked;
                  });
              });
          </script>''',
    '''                document
                  .querySelectorAll(".contact-link-checkbox")
                  .forEach((checkbox) => {
                    checkbox.checked = event.target.checked;
                  });
              });

            async function deleteContacts(reviewId, contactIds) {
              var response = await fetch(
                "/api/recruiter-contacts/delete",
                {
                  method: "POST",
                  headers: {
                    "content-type": "application/json"
                  },
                  body: JSON.stringify({
                    reviewId: reviewId,
                    contactIds: contactIds
                  })
                }
              );

              var data = await response.json();

              if (!response.ok || !data.ok) {
                alert(
                  data.error ||
                    "Unable to delete imported contacts."
                );

                return;
              }

              location.reload();
            }

            document
              .querySelector(".delete-selected-contacts-button")
              ?.addEventListener("click", async function (event) {
                var reviewId = event.target.dataset.reviewId;

                var contactIds = Array.from(
                  document.querySelectorAll(
                    ".contact-link-checkbox:checked"
                  )
                ).map(function (checkbox) {
                  return checkbox.value;
                });

                if (!contactIds.length) {
                  alert(
                    "Select at least one contact to delete."
                  );

                  return;
                }

                var confirmed = confirm(
                  "Delete the selected imported contacts? " +
                    "This cannot be undone."
                );

                if (!confirmed) {
                  return;
                }

                await deleteContacts(reviewId, contactIds);
              });

            document
              .querySelector(".clear-imported-contacts-button")
              ?.addEventListener("click", async function (event) {
                var reviewId = event.target.dataset.reviewId;

                var confirmed = confirm(
                  "Delete ALL unlinked imported contacts for " +
                    "this review? This cannot be undone."
                );

                if (!confirmed) {
                  return;
                }

                await deleteContacts(reviewId, []);
              });
          </script>''',
    "Rendering: wire delete and clear buttons"
)

print("\\nAll contact-delete patches applied successfully.")