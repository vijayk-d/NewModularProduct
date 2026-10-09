function attachEmailDomainListener() {
  var button = document.querySelector(
    ".find-email-domain-button"
  );

  if (!button) {
    return;
  }

  button.addEventListener("click", async function () {
    var reviewId = button.dataset.reviewId;
    var status = document.getElementById("email-domain-status");
    var result = document.getElementById("email-domain-result");

    button.disabled = true;
    status.textContent =
      "Researching email domain in the background…";

    try {
      var startResponse = await fetch(
        "/api/reviews/" +
          encodeURIComponent(reviewId) +
          "/resolve-email-domain",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
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

          result.textContent =
            "Resolved domain: " +
            job.result.emailDomain;

          button.disabled = false;
          return;
        }

        if (job.status === "failed") {
          throw new Error(
            job.error || "Email-domain resolution failed."
          );
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
}

export function attachReviewPageListeners() {
  // Select-all behaviour
  document.addEventListener(
    "change",
    function (event) {
      if (event.target.id !== "select-all-contact-links") {
        return;
      }

      document
        .querySelectorAll(".contact-link-checkbox")
        .forEach(function (checkbox) {
          checkbox.checked = event.target.checked;
        });
    },
    true
  );

  // Delete buttons
  document.addEventListener(
    "click",
    async function (event) {
      var button = event.target.closest(
        ".delete-selected-contacts-button, " +
          ".clear-imported-contacts-button"
      );

      if (!button) {
        return;
      }

      event.preventDefault();

      var reviewId = button.dataset.reviewId;

      if (!reviewId) {
        window.alert("Missing review ID.");
        return;
      }

      var deleteSelected = button.classList.contains(
        "delete-selected-contacts-button"
      );

      var contactIds = deleteSelected
        ? Array.from(
            document.querySelectorAll(
              ".contact-link-checkbox:checked"
            )
          ).map(function (checkbox) {
            return checkbox.value;
          })
        : [];

      if (deleteSelected && !contactIds.length) {
        alert("Select at least one imported contact to delete.");
        return;
      }

      if (!deleteSelected) {
        var confirmed = window.confirm(
          "Delete all unlinked imported contacts for this organisation? " +
            "This cannot be undone."
        );

        if (!confirmed) {
          return;
        }
      }

      button.disabled = true;

      try {
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

        var payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error ||
              "Unable to delete imported contacts."
          );
        }

        await refreshImportedContacts(reviewId);
        button.disabled = false;
      } catch (error) {
        alert(
          error instanceof Error
            ? error.message
            : "Unable to delete imported contacts."
        );

        document
          .querySelectorAll(
            ".delete-selected-contacts-button, " +
              ".clear-imported-contacts-button"
          )
          .forEach(function (item) {
            item.disabled = false;
          });
      }
    },
    true
  );
}

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

if (typeof document !== "undefined") {
  attachReviewPageListeners();
  attachRefreshImportedContactsListener();
  attachEmailDomainListener();
}