from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    "store": ROOT / "src/application/recruiter-contact-store.js",
    "server": ROOT / "src/interfaces/http/create-local-server.js",
    "rendering": ROOT / "src/interfaces/http/rendering.js",
}


def read(path):
    return path.read_text(encoding="utf-8")


def write(path, content):
    backup = path.with_suffix(path.suffix + ".before-contact-linking.bak")

    if not backup.exists():
        shutil.copy2(path, backup)

    path.write_text(content, encoding="utf-8", newline="\n")


def replace_once(content, old, new, label):
    if new in content:
        print(f"SKIP {label}: already applied")
        return content

    count = content.count(old)

    if count != 1:
        raise SystemExit(
            f"ERROR {label}: expected one match, found {count}.\n"
            f"Search text:\n{old}"
        )

    print(f"PATCH {label}")
    return content.replace(old, new)


def patch_store(content):
    old = """  return {
    async listByOrganisation(organisationId) {"""

    new = """  return {
    async listAll() {
      return load();
    },

    async listByReview(reviewId) {
      const contacts = await load();

      return contacts.filter((contact) =>
        Array.isArray(contact.linkedApplicationReviewIds) &&
        contact.linkedApplicationReviewIds.includes(reviewId)
      );
    },

    async linkToReview({ reviewId, contactIds }) {
      const contacts = await load();
      const linked = [];

      for (const contact of contacts) {
        if (!contactIds.includes(contact.id)) {
          continue;
        }

        contact.linkedApplicationReviewIds = Array.isArray(
          contact.linkedApplicationReviewIds
        )
          ? contact.linkedApplicationReviewIds
          : [];

        if (!contact.linkedApplicationReviewIds.includes(reviewId)) {
          contact.linkedApplicationReviewIds.push(reviewId);
        }

        linked.push(contact);
      }

      await save(contacts);

      return linked;
    },

    async listByOrganisation(organisationId) {"""

    return replace_once(content, old, new, "contact store review linking")


def patch_server(content):
    old = """    if (method !== 'GET' && method !== 'POST') {"""

    new = """    if (
      method === "GET" &&
      url.pathname === "/api/recruiter-contacts/linking"
    ) {
      const reviewId = url.searchParams.get("reviewId") || "";

      if (!recruiterContactStore) {
        sendJson(response, 200, {
          unlinked: [],
          linked: []
        });
        return;
      }

      const contacts = await recruiterContactStore.listAll();

      sendJson(response, 200, {
        unlinked: contacts.filter((contact) =>
          !Array.isArray(contact.linkedApplicationReviewIds) ||
          !contact.linkedApplicationReviewIds.includes(reviewId)
        ),
        linked: contacts.filter((contact) =>
          Array.isArray(contact.linkedApplicationReviewIds) &&
          contact.linkedApplicationReviewIds.includes(reviewId)
        )
      });

      return;
    }

    if (
      method === "POST" &&
      url.pathname === "/recruiter-contacts/link"
    ) {
      const actionStartedAt = Date.now();

      writeDiagnostic("contact_linking_requested", {
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
        formBody.values.get("reviewId") || ""
      ).trim();

      const review = reviewStore.get(reviewId);

      if (!review) {
        sendHtml(
          response,
          410,
          renderApplicationForm({
            errors: [
              "This application review is no longer available. Please prepare the application again."
            ]
          })
        );
        return;
      }

      const contactIds = formBody.values
        .getAll("contactIds")
        .map((value) => String(value).trim())
        .filter(Boolean);

      let linkedContacts = [];

      if (recruiterContactStore && contactIds.length) {
        linkedContacts = await recruiterContactStore.linkToReview({
          reviewId,
          contactIds
        });
      }

      writeDiagnostic("contact_linking_completed", {
        requestId,
        reviewId,
        linkedCount: linkedContacts.length,
        durationMs: Date.now() - actionStartedAt
      });

      const contactLinking = {
        reviewId,
        unlinked: [],
        linked: linkedContacts,
        linkedMessage: linkedContacts.length
          ? `Linked ${linkedContacts.length} contact(s) to this application.`
          : "Select at least one contact to link."
      };

      sendHtml(
        response,
        200,
        renderApplicationReview({
          formData: review.formData,
          prepared: review.prepared,
          reviewId,
          research: review.research,
          currentDraftPlainText: review.currentDraftPlainText,
          refinementProposal: review.refinementProposal,
          selectedCvRoleCode: review.selectedCvRoleCode,
          cvSelectionMessage: review.cvSelectionMessage,
          contacts: await loadReviewContacts(reviewId),
          contactLinking
        })
      );

      return;
    }

    if (method !== 'GET' && method !== 'POST') {"""

    content = replace_once(
        content,
        old,
        new,
        "contact linking routes"
    )

    old_helper = """  async function loadOrganisationContacts(
    recruiterContactStore,
    formData
  ) {
    if (!recruiterContactStore) {
      return [];
    }

    return recruiterContactStore.listByOrganisation(
      deriveReviewOrganisationId(formData)
    );
  }"""

    new_helper = """  async function loadReviewContacts(reviewId) {
    if (!recruiterContactStore) {
      return [];
    }

    return recruiterContactStore.listByReview(reviewId);
  }

  async function loadContactLinking(reviewId) {
    if (!recruiterContactStore) {
      return {
        reviewId,
        unlinked: [],
        linked: []
      };
    }

    const contacts = await recruiterContactStore.listAll();

    return {
      reviewId,
      unlinked: contacts.filter((contact) =>
        !Array.isArray(contact.linkedApplicationReviewIds) ||
        !contact.linkedApplicationReviewIds.includes(reviewId)
      ),
      linked: contacts.filter((contact) =>
        Array.isArray(contact.linkedApplicationReviewIds) &&
        contact.linkedApplicationReviewIds.includes(reviewId)
      )
    };
  }"""

    return replace_once(
        content,
        old_helper,
        new_helper,
        "review contact helpers"
    )


def patch_rendering(content):
    old = """export function renderApplicationReview({"""

    new = """export function renderContactLinking(contactLinking = null) {
  if (!contactLinking) {
    return "";
  }

  const unlinkedContacts = contactLinking.unlinked || [];
  const linkedContacts = contactLinking.linked || [];

  const unlinkedRows = unlinkedContacts.map((contact) => `
    <label>
      <input
        type="checkbox"
        name="contactIds"
        value="${escapeHtml(contact.id)}"
      />
      ${escapeHtml(contact.fullName)}
      ${escapeHtml(contact.role || "")}
    </label>
  `).join("");

  const linkedRows = linkedContacts.map((contact) => `
    <li>${escapeHtml(contact.fullName)}</li>
  `).join("");

  return `
    <section class="review-section">
      <h2>Link imported contacts</h2>

      ${contactLinking.linkedMessage
        ? `<p>${escapeHtml(contactLinking.linkedMessage)}</p>`
        : ""}

      ${linkedContacts.length
        ? `<h3>Linked contacts</h3><ul>${linkedRows}</ul>`
        : ""}

      ${unlinkedContacts.length
        ? `
          <form method="post" action="/recruiter-contacts/link">
            <input
              type="hidden"
              name="reviewId"
              value="${escapeHtml(contactLinking.reviewId)}"
            />
            ${unlinkedRows}
            <button type="submit">Link selected contacts</button>
          </form>
        `
        : "<p>No unlinked imported contacts are available.</p>"}
    </section>
  `;
}

export function renderApplicationReview({"""

    content = replace_once(
        content,
        old,
        new,
        "contact-linking renderer"
    )

    old_signature = """  contacts = []
}) {"""

    new_signature = """  contacts = [],
  contactLinking = null
}) {"""

    content = replace_once(
        content,
        old_signature,
        new_signature,
        "review renderer signature"
    )

    old_insert = """${renderRecruiterContacts(contacts)}"""

    new_insert = """${renderRecruiterContacts(contacts)}

    ${renderContactLinking(contactLinking)}"""

    return replace_once(
        content,
        old_insert,
        new_insert,
        "review contact-linking section"
    )


def main():
    store = read(FILES["store"])
    server = read(FILES["server"])
    rendering = read(FILES["rendering"])

    write(FILES["store"], patch_store(store))
    write(FILES["server"], patch_server(server))
    write(FILES["rendering"], patch_rendering(rendering))

    print("Contact linking patch applied successfully.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as error:
        print(error)
        sys.exit(1)