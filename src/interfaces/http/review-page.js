import './cover-reference-client.js';
import './application-review-controls.js';
import { attachSubjectEditors } from './subject-editors.js';
import { attachPolishingCostControls } from './polishing-cost-controls.js';
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
          var domainInput = document.getElementById("email-domain-input");
          if (domainInput && domainInput.dataset.manual !== "true") {
            domainInput.value = job.result.emailDomain || "";
          }
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
  // available-contact-actions-v2
  if (document.__availableContactActionsAttached) return;
  document.__availableContactActionsAttached = true;

  function getStatus(section) {
    let status = section.querySelector(".available-contact-action-status");
    if (!status) {
      status = document.createElement("p");
      status.className = "available-contact-action-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      const actions = section.querySelector(".contact-linking-actions");
      if (actions) actions.insertAdjacentElement("afterend", status);
      else section.appendChild(status);
    }
    return status;
  }

  document.addEventListener("change", (event) => {
    const section = event.target.closest(".review-section");
    if (!section) return;

    const boxes = [...section.querySelectorAll(
      ".available-imported-contacts-body .contact-link-checkbox"
    )];
    const master = section.querySelector("#select-all-contact-links");

    if (event.target.id === "select-all-contact-links") {
      boxes.forEach((checkbox) => {
        checkbox.checked = event.target.checked;
      });
      if (master) master.indeterminate = false;
    } else if (event.target.matches(
      ".available-imported-contacts-body .contact-link-checkbox"
    ) && master) {
      const count = boxes.filter((checkbox) => checkbox.checked).length;
      master.checked = boxes.length > 0 && count === boxes.length;
      master.indeterminate = count > 0 && count < boxes.length;
    }
  }, true);

  document.addEventListener("click", async (event) => {
    const button = event.target.closest(
      ".delete-selected-contacts-button, .clear-imported-contacts-button, .permanently-delete-selected-contacts-button"
    );
    if (!button) return;
    event.preventDefault();

    const section = button.closest(".review-section");
    if (!section) return;

    const status = getStatus(section);
    const buttons = [...section.querySelectorAll(
      ".delete-selected-contacts-button, .clear-imported-contacts-button, .permanently-delete-selected-contacts-button"
    )];
    if (buttons.some((item) => item.disabled)) return;

    const reviewId = String(button.dataset.reviewId || "").trim();
    if (!reviewId) {
      status.textContent = "Missing review ID. Prepare the application again.";
      return;
    }

    const permanent = button.classList.contains(
      "permanently-delete-selected-contacts-button"
    );
    const selectedOnly = permanent || button.classList.contains(
      "delete-selected-contacts-button"
    );
    const body = section.querySelector(".available-imported-contacts-body");
    if (!body) {
      status.textContent = "Available-contact table not found.";
      return;
    }

    const contactIds = [...new Set(
      [...body.querySelectorAll(
        ".contact-link-checkbox" + (selectedOnly ? ":checked" : "")
      )].map((checkbox) => checkbox.value.trim()).filter(Boolean)
    )];

    if (!contactIds.length) {
      status.textContent = selectedOnly
        ? "Select at least one imported contact to delete."
        : "No available imported contacts to clear.";
      if (selectedOnly) window.alert(status.textContent);
      return;
    }

    if (!selectedOnly && !window.confirm(
      "Delete all available imported contacts displayed in this section? " +
      "Contacts linked to any application will be kept. This cannot be undone."
    )) return;

    if (permanent) {
      const names = [...body.querySelectorAll(".contact-link-checkbox:checked")]
        .map((checkbox) =>
          [checkbox.closest("tr")?.querySelector('.candidate-first')?.value,checkbox.closest("tr")?.querySelector('.candidate-last')?.value].filter(Boolean).join(' ')
          || checkbox.closest("tr")?.querySelectorAll("td")[1]?.textContent.trim()
          || checkbox.value
        );

      if (!window.confirm(
        "Permanently delete these selected contact records, including their " +
        "links to ALL applications? Saved email addresses and contact details " +
        "will be removed. This cannot be undone through the UI.\n\n" +
        names.join("\n")
      )) return;
    }

    buttons.forEach((item) => { item.disabled = true; });
    status.textContent = permanent
      ? "Permanently deleting selected contacts..."
      : "Deleting available contacts...";
    let confirmedDeletion = false;
    let resultMessage = "";

    try {
      const response = await fetch(
        permanent
          ? "/api/recruiter-contacts/permanent-delete"
          : "/api/recruiter-contacts/delete",
        {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewId,
          action: selectedOnly ? "deleteSelected" : "clearDisplayed",
          ...(permanent ? { confirmedPermanent: true } : {}),
          contactIds
        })
      });

      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(
          `Deletion returned an invalid response (HTTP ${response.status}).`
        );
      }

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error || `Deletion failed (HTTP ${response.status}).`
        );
      }

      if (
        !Number.isInteger(payload.deleted) ||
        payload.deleted < 0 ||
        !Array.isArray(payload.deletedContacts)
      ) {
        throw new Error("Deletion returned an unexpected result.");
      }

      confirmedDeletion = true;

      const deletedIds = new Set(
        payload.deletedContacts.map((contact) => contact.id)
      );
      body.querySelectorAll(".contact-link-checkbox").forEach((checkbox) => {
        if (deletedIds.has(checkbox.value)) {
          checkbox.closest("tr")?.remove();
        }
      });

      const remaining = Math.max(0, contactIds.length - deletedIds.size);
      resultMessage = permanent
        ? `${payload.deleted} contact(s) permanently deleted from all application contact lists.`
        : `${payload.deleted} contact(s) deleted.`;

      if (permanent && payload.backupCreated) {
        resultMessage += " A contact-data backup was created.";
      }
      if (permanent && remaining) {
        resultMessage += ` ${remaining} requested record(s) were already missing.`;
      }
      if (!permanent && remaining) {
        resultMessage +=
          ` ${remaining} requested contact(s) were not deleted. ` +
          "Contacts linked to any application are protected; " +
          "already missing records may also be skipped.";
      }

      await refreshImportedContacts(reviewId);
      status.textContent = resultMessage;
    } catch (error) {
      status.textContent = confirmedDeletion
        ? resultMessage +
          " Tables could not refresh. Click Refresh contacts."
        : error.message || "Unable to delete available contacts.";
    } finally {
      buttons.forEach((item) => { item.disabled = false; });
      const master = section.querySelector("#select-all-contact-links");
      if (master) {
        master.checked = false;
        master.indeterminate = false;
      }
      body.querySelectorAll(".contact-link-checkbox").forEach((checkbox) => {
        checkbox.checked = false;
      });
    }
  }, true);
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
  return contacts.map((contact) => `
    <tr>
      <td>
        <input type="checkbox" class="contact-link-checkbox"
          name="contactIds" value="${escapeContactValue(contact.id)}" />
      </td>
      <td>${escapeContactValue(contact.fullName)}</td>
      <td class="contact-role-cell"
          style="max-width:28rem;white-space:normal;overflow-wrap:anywhere;">
        ${escapeContactValue(contact.role || "")}
      </td>
      <td class="contact-email-cell"
          style="max-width:24rem;white-space:normal;overflow-wrap:anywhere;">
        ${[...new Set([
          contact.selectedEmail,
          ...(Array.isArray(contact.emailCandidates)
            ? contact.emailCandidates
            : [])
        ].filter((email) => typeof email === "string" && email.trim())
          .map((email) => email.trim()))]
          .map((email) => `
            <div>
              <a href="mailto:${escapeContactValue(email)}">${escapeContactValue(email)}</a>
            </div>
          `)
          .join("") || "Not available"}
      </td>
      <td>
        <a href="${escapeContactValue(contact.linkedinUrl)}"
           target="_blank" rel="noopener">LinkedIn profile</a>
      </td>
    </tr>
  `).join("");
}

function renderRefreshableLinkedRows(contacts) {
  return contacts.map((contact) => `
    <tr>
      <td>
        <input type="checkbox" class="linked-contact-checkbox"
          value="${escapeContactValue(contact.id)}"
          aria-label="Select linked contact ${escapeContactValue(contact.fullName)}" />
      </td>
      <td>${escapeContactValue(contact.fullName)}</td>
      <td class="contact-role-cell"
          style="max-width:28rem;white-space:normal;overflow-wrap:anywhere;">
        ${escapeContactValue(contact.role || "")}
      </td>
      <td class="contact-email-cell"
          style="max-width:24rem;white-space:normal;overflow-wrap:anywhere;">
        ${[...new Set([
          contact.selectedEmail,
          ...(Array.isArray(contact.emailCandidates)
            ? contact.emailCandidates
            : [])
        ].filter((email) => typeof email === "string" && email.trim())
          .map((email) => email.trim()))]
          .map((email) => `
            <div>
              <a href="mailto:${escapeContactValue(email)}">${escapeContactValue(email)}</a>
            </div>
          `)
          .join("") || "Not available"}
      </td>
      <td>
        <a href="${escapeContactValue(contact.linkedinUrl)}"
           target="_blank" rel="noopener">LinkedIn profile</a>
      </td>
    </tr>
  `).join("");
}

export async function refreshImportedContacts(reviewId) {
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

  if(document.querySelector('input[name="reviewId"]')?.value!==reviewId||document.querySelector('#application-form'))return;

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

  refreshOrganisationContactSummary(linkedContacts);
  document.dispatchEvent(new CustomEvent('outreach-contacts-refreshed',{detail:{unlinkedContacts,linkedContacts}}));

  ["select-all-contact-links", "select-all-linked-contacts"].forEach((id) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.checked = false;
      checkbox.indeterminate = false;
    }
  });
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


function attachEditableEmailDomainListener() {
  const input = document.getElementById("email-domain-input");
  const button = document.querySelector(".save-email-domain-button");
  const status = document.getElementById("email-domain-status");

  if (!input || !button || !status) return;

  input.addEventListener("input", () => {
    input.dataset.manual = "true";
    status.textContent = "Unsaved domain edit. Click Save domain.";
  });

  button.addEventListener("click", async () => {
    button.disabled = true;

    try {
      const response = await fetch("/api/reviews/email-domain/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewId: button.dataset.reviewId,
          emailDomain: input.value
        })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to save domain.");
      }

      input.value = data.emailDomain;
      input.dataset.manual = "true";

      try {
        await refreshImportedContacts(button.dataset.reviewId);
      } catch {
        status.textContent =
          "Domain saved, but contacts could not refresh. Click Refresh contacts.";
        return;
      }

      status.textContent = "Domain saved for this active review.";
    } catch (error) {
      status.textContent = error.message || "Unable to save domain.";
    } finally {
      button.disabled = false;
    }
  });
}

if (typeof document !== "undefined") {
  attachReviewPageListeners();
  attachRefreshImportedContactsListener();
  attachEmailDomainListener();
  attachEditableEmailDomainListener();
}

function attachLinkedContactActions() {
  document.addEventListener("change", (event) => {
    const section = event.target.closest(".review-section");
    if (!section) return;

    if (event.target.id === "select-all-linked-contacts") {
      section.querySelectorAll(".linked-contact-checkbox").forEach((checkbox) => {
        checkbox.checked = event.target.checked;
      });
    }

    if (event.target.matches(".linked-contact-checkbox")) {
      const boxes = [...section.querySelectorAll(".linked-contact-checkbox")];
      const master = section.querySelector("#select-all-linked-contacts");
      if (master) {
        const selected = boxes.filter((checkbox) => checkbox.checked).length;
        master.checked = boxes.length > 0 && selected === boxes.length;
        master.indeterminate = selected > 0 && selected < boxes.length;
      }
    }
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest(
      ".unlink-selected-contacts-button, .clear-linked-contacts-button"
    );
    if (!button) return;
    event.preventDefault();

    const section = button.closest(".review-section");
    const status = section.querySelector(".linked-contact-action-status");
    const clear = button.classList.contains("clear-linked-contacts-button");
    const ids = [...new Set([...section.querySelectorAll(
      ".linked-imported-contacts-body .linked-contact-checkbox" +
      (clear ? "" : ":checked")
    )].map((checkbox) => checkbox.value))];

    if (!ids.length) {
      status.textContent = clear
        ? "No linked contacts to clear."
        : "Select at least one linked contact to unlink.";
      return;
    }

    if (clear && !window.confirm(
      "Unlink all displayed linked contacts from this application? " +
      "Contact records and links to other applications will be kept."
    )) return;

    const buttons = [...section.querySelectorAll(
      ".unlink-selected-contacts-button, .clear-linked-contacts-button"
    )];
    if (buttons.some((item) => item.disabled)) return;
    buttons.forEach((item) => { item.disabled = true; });
    let saved = false;

    try {
      const response = await fetch("/api/recruiter-contacts/unlink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewId: button.dataset.reviewId,
          action: clear ? "clearDisplayed" : "unlinkSelected",
          contactIds: ids
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to unlink contacts.");
      }
      saved = true;
      await refreshImportedContacts(button.dataset.reviewId);
      status.textContent =
        payload.unlinked + " contact(s) unlinked from this application.";
    } catch (error) {
      status.textContent = saved
        ? "Contacts unlinked, but tables could not refresh. Click Refresh contacts."
        : error.message || "Unable to unlink contacts.";
    } finally {
      buttons.forEach((item) => { item.disabled = false; });
    }
  });
}

if (typeof document !== "undefined") {
  attachLinkedContactActions();
}


function refreshOrganisationContactSummary(contacts) {
  const section = document.querySelector(".organisation-contact-summary");
  const body = section?.querySelector(".organisation-contact-summary-body");
  if (!section || !body) return;

  body.innerHTML = contacts.map((contact) => `
    <tr>
      <td>${escapeContactValue(contact.fullName)}</td>
      <td class="contact-role-cell">${escapeContactValue(contact.role || "")}</td>
      <td>
        <a href="${escapeContactValue(contact.linkedinUrl)}"
           target="_blank" rel="noopener">LinkedIn profile</a>
      </td>
      <td>${escapeContactValue(contact.emailDomain || "Not resolved")}</td>
    </tr>
  `).join("");

  section.hidden = contacts.length === 0;
}

if (typeof document !== "undefined") {
  import("/outreach-queue.js").catch(() => {
    console.error("Outreach queue UI could not load. Open /outreach-queue directly.");
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>attachPolishingCostControls(),{once:true});
  else attachPolishingCostControls();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>attachSubjectEditors(),{once:true});
  else attachSubjectEditors();
}


