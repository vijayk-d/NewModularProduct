from pathlib import Path

rendering_path = Path("src/interfaces/http/rendering.js")
review_page_path = Path("src/interfaces/http/review-page.js")

rendering = rendering_path.read_text(encoding="utf-8")
review_page = review_page_path.read_text(encoding="utf-8")

# 1. Add stable tbody classes in rendering.js
rendering = rendering.replace(
    "<tbody>${linkedRows}</tbody>",
    '<tbody class="linked-imported-contacts-body">${linkedRows}</tbody>',
    1,
)

rendering = rendering.replace(
    "<tbody>${unlinkedRows}</tbody>",
    '<tbody class="available-imported-contacts-body">${unlinkedRows}</tbody>',
    1,
)

# 2. Add Refresh contacts button before Delete selected
refresh_button = '''<button
              type="button"
              class="refresh-imported-contacts-button"
              data-review-id="${escapeHtml(contactLinking.reviewId)}"
            >
              Refresh contacts
            </button>
            '''

delete_button_marker = 'class="delete-selected-contacts-button"'

if 'class="refresh-imported-contacts-button"' not in rendering:
    if delete_button_marker not in rendering:
        raise SystemExit("Could not find delete button marker in rendering.js.")

    rendering = rendering.replace(
        delete_button_marker,
        refresh_button + delete_button_marker,
        1,
    )

# 3. Add partial-refresh JavaScript to review-page.js
refresh_js = '''
function escapeContactValue(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderRefreshableContactRows(contacts) {
  return contacts
    .map(
      (contact) => `
        <tr>
          <td>
            <input
              type="checkbox"
              class="contact-link-checkbox"
              name="contactIds"
              value="${escapeContactValue(contact.id)}"
            />
          </td>
          <td>${escapeContactValue(contact.fullName)}</td>
          <td>${escapeContactValue(contact.role)}</td>
          <td>
            <a
              href="${escapeContactValue(contact.linkedinUrl)}"
              target="_blank"
              rel="noopener"
            >
              LinkedIn profile
            </a>
          </td>
        </tr>`
    )
    .join("");
}

function renderRefreshableLinkedRows(contacts) {
  return contacts
    .map(
      (contact) => `
        <tr>
          <td>${escapeContactValue(contact.fullName)}</td>
          <td>${escapeContactValue(contact.role)}</td>
          <td>
            <a
              href="${escapeContactValue(contact.linkedinUrl)}"
              target="_blank"
              rel="noopener"
            >
              LinkedIn profile
            </a>
          </td>
        </tr>`
    )
    .join("");
}

async function refreshImportedContacts(reviewId) {
  const response = await fetch(
    `/api/recruiter-contacts/linking?reviewId=${encodeURIComponent(reviewId)}`
  );

  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(
      payload.error || "Unable to refresh imported contacts."
    );
  }

  const unlinkedContacts =
    payload.unlinked ||
    payload.unlinkedContacts ||
    payload.contacts ||
    [];

  const linkedContacts =
    payload.linked ||
    payload.linkedContacts ||
    [];

  const unlinkedBody = document.querySelector(
    ".available-imported-contacts-body"
  );

  const linkedBody = document.querySelector(
    ".linked-imported-contacts-body"
  );

  if (unlinkedBody) {
    unlinkedBody.innerHTML = renderRefreshableContactRows(unlinkedContacts);
  }

  if (linkedBody) {
    linkedBody.innerHTML = renderRefreshableLinkedRows(linkedContacts);
  }
}

function attachRefreshImportedContactsListener() {
  document.addEventListener(
    "click",
    async function (event) {
      const button = event.target.closest(
        ".refresh-imported-contacts-button"
      );

      if (!button) {
        return;
      }

      event.preventDefault();

      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Refreshing…";

      try {
        await refreshImportedContacts(button.dataset.reviewId);
      } catch (error) {
        window.alert(
          error instanceof Error
            ? error.message
            : "Unable to refresh imported contacts."
        );
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    },
    true
  );
}

'''

auto_attach_marker = 'if (typeof document !== "undefined") {'

if "attachRefreshImportedContactsListener" not in review_page:
    if auto_attach_marker not in review_page:
        raise SystemExit("Could not find auto-attach marker in review-page.js.")

    review_page = review_page.replace(
        auto_attach_marker,
        refresh_js + auto_attach_marker,
        1,
    )

    review_page = review_page.replace(
        'if (typeof document !== "undefined") {\n  attachReviewPageListeners();',
        'if (typeof document !== "undefined") {\n  attachReviewPageListeners();\n  attachRefreshImportedContactsListener();',
        1,
    )

rendering_path.write_text(rendering, encoding="utf-8", newline="\n")
review_page_path.write_text(review_page, encoding="utf-8", newline="\n")

print("Added refresh button, stable tbody classes, and partial-refresh handler.")
