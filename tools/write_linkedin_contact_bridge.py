from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "new-modular-product-linkedin-contact-bridge.user.js"

USERSCRIPT = r'''// ==UserScript==
// @name         New Modular Product - LinkedIn Contact Bridge
// @namespace    local.new-modular-product
// @version      0.2.0
// @description  Import visible LinkedIn People profiles into the New Modular Product local server.
// @match        https://www.linkedin.com/company/*/people/*
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  "use strict";

  const API_URL = "http://127.0.0.1:3000/api/recruiters/import";
  const BUTTON_ID = "new-modular-product-contact-import";
  const TABLE_ID = "new-modular-product-contact-table";

  const recruiterRoleKeywords = [
    "talent acquisition",
    "talent",
    "recruiter",
    "recruitment",
    "head",
    "director",
    "manager",
    "partner",
    "hr",
    "human resources",
    "people"
  ];

  let importedProfiles = [];

  function cleanText(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normaliseProfileName(value) {
    return cleanText(value)
      .replace(/^view\s+/i, "")
      .replace(/’s profile$/i, "")
      .replace(/'s profile$/i, "")
      .replace(/\(?\d+[\d,]*\+?\)?\s*(connections?|followers?|following)/gi, "")
      .replace(/•/g, "")
      .trim();
  }

  function splitName(value) {
    const parts = normaliseProfileName(value)
      .split(" ")
      .filter(Boolean);

    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || ""
    };
  }

  function cleanRoleText(value, profileName) {
    let role = cleanText(value);

    if (profileName) {
      const escapedName = profileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      role = role.replace(new RegExp(`^view\\s+${escapedName}\\s*’?s?\\s*profile\\s*`, "i"), "");
      role = role.replace(new RegExp(escapedName, "i"), "");
    }

    return role
      .replace(/\d+(st|nd|rd|th)?\s+degree\s+connection/gi, "")
      .replace(/mutual connections?/gi, "")
      .replace(/\bconnect\b/gi, "")
      .replace(/\bmessage\b/gi, "")
      .replace(/\bfollow\b/gi, "")
      .replace(/[•·|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractRole(cardText, profileName) {
    const cleaned = cleanRoleText(cardText, profileName);
    const words = cleaned.split(" ").filter(Boolean);

    // Prefer a concise trailing role phrase rather than connection noise.
    const candidate = words.slice(-12).join(" ");

    return hasRecruiterRole(candidate) ? candidate : "";
  }

  function extractLocation(cardText, profileName, role) {
    let location = cleanText(cardText);

    if (profileName) {
      location = location.replace(profileName, "");
    }

    if (role) {
      location = location.replace(role, "");
    }

    location = location
      .replace(/\d+(st|nd|rd|th)?\s+degree\s+connection/gi, "")
      .replace(/mutual connections?/gi, "")
      .replace(/\bconnect\b/gi, "")
      .replace(/[•·|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Best-effort: LinkedIn often places a short location-like fragment
    // before connection and action text. Avoid inventing data.
    const locationMatch = location.match(
      /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*,\s*[A-Z]{2}\b)/
    );

    return locationMatch ? locationMatch[1] : "";
  }

  function hasRecruiterRole(value) {
    const role = cleanText(value).toLowerCase();

    return recruiterRoleKeywords.some((keyword) =>
      role.includes(keyword)
    );
  }

  function extractProfiles() {
    const profiles = [];
    const seenUrls = new Set();

    document
      .querySelectorAll('a[href*="linkedin.com/in/"]')
      .forEach((anchor) => {
        const profileUrl = anchor.href.split("?")[0];
        const rawName =
          anchor.getAttribute("aria-label") || anchor.textContent;
        const name = normaliseProfileName(rawName);

        if (!name || name.length < 3 || seenUrls.has(profileUrl)) {
          return;
        }

        const card = anchor.closest("li") || anchor.parentElement;
        const cardText = cleanText(card?.innerText || "");
        const { firstName, lastName } = splitName(name);
        const role = extractRole(cardText, name);

        if (!firstName || !lastName || !hasRecruiterRole(role)) {
          return;
        }

        seenUrls.add(profileUrl);

        profiles.push({
          firstName,
          lastName,
          linkedinUrl: profileUrl,
          role,
          location: extractLocation(cardText, name, role),
          source: "linkedin-visible",
          verified: false
        });
      });

    return profiles;
  }

  function renderTable() {
    const table = document.getElementById(TABLE_ID);

    if (!table) {
      return;
    }

    const rows = importedProfiles.map((profile, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(profile.firstName)}</td>
        <td>${escapeHtml(profile.lastName)}</td>
        <td>${escapeHtml(profile.role)}</td>
        <td>${escapeHtml(profile.location)}</td>
      </tr>
    `).join("");

    table.querySelector("tbody").innerHTML = rows;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function clearImportedProfiles() {
    importedProfiles = [];
    renderTable();
  }

  function importProfiles() {
    const recruiters = extractProfiles();

    if (!recruiters.length) {
      throw new Error(
        "No visible recruiter profiles found. Scroll the People page and try again."
      );
    }

    importedProfiles = recruiters;
    renderTable();

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: API_URL,
        headers: {
          "content-type": "application/json"
        },
        data: JSON.stringify({
          sourceUrl: location.href,
          emailDomain: "",
          recruiters
        }),
        timeout: 12000,
        onload(response) {
          let result;

          try {
            result = JSON.parse(response.responseText);
          } catch {
            reject(new Error("Local server returned an invalid response."));
            return;
          }

          if (response.status < 200 || response.status >= 300 || !result.ok) {
            reject(new Error(result.error || "Contact import failed."));
            return;
          }

          resolve(result);
        },
        onerror() {
          reject(new Error("Cannot reach the New Modular Product server."));
        },
        ontimeout() {
          reject(new Error("The New Modular Product server did not respond."));
        }
      });
    });
  }

  function addButton() {
    if (document.getElementById(BUTTON_ID)) {
      return;
    }

    const panel = document.createElement("div");

    panel.id = BUTTON_ID;

    Object.assign(panel.style, {
      position: "fixed",
      right: "24px",
      bottom: "24px",
      zIndex: "2147483647",
      padding: "16px",
      borderRadius: "8px",
      background: "#fff",
      color: "#111",
      font: "14px sans-serif",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
      maxWidth: "720px",
      maxHeight: "70vh",
      overflow: "auto"
    });

    panel.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <button id="new-modular-product-import-button" type="button">
          Import contacts
        </button>
        <button id="new-modular-product-clear-button" type="button">
          Clear table
        </button>
      </div>

      <div id="new-modular-product-status" style="margin-bottom:8px;">
        Ready.
      </div>

      <table id="${TABLE_ID}" style="border-collapse:collapse;width:100%;">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px;border:1px solid #ccc;">#</th>
            <th style="text-align:left;padding:6px;border:1px solid #ccc;">First name</th>
            <th style="text-align:left;padding:6px;border:1px solid #ccc;">Last name</th>
            <th style="text-align:left;padding:6px;border:1px solid #ccc;">Role</th>
            <th style="text-align:left;padding:6px;border:1px solid #ccc;">Location</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;

    panel
      .querySelector("#new-modular-product-import-button")
      .addEventListener("click", async (event) => {
        const status = panel.querySelector("#new-modular-product-status");

        event.target.disabled = true;
        status.textContent = "Importing…";

        try {
          const result = await importProfiles();

          status.textContent =
            `${result.imported} imported, ${result.duplicates} duplicates.`;
        } catch (error) {
          status.textContent = error.message || "Import failed.";
        } finally {
          event.target.disabled = false;
        }
      });

    panel
      .querySelector("#new-modular-product-clear-button")
      .addEventListener("click", () => {
        clearImportedProfiles();

        panel.querySelector("#new-modular-product-status").textContent =
          "Cleared the local import table. Server records were not deleted.";
      });

    document.body.append(panel);
  }

  addButton();

  new MutationObserver(addButton).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
'''

TARGET.write_text(USERSCRIPT, encoding="utf-8", newline="\n")
print(f"Created or replaced {TARGET}")