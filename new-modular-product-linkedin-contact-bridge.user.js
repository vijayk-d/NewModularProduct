// ==UserScript==
// @name         New Modular Product - LinkedIn Contact Bridge
// @namespace    local.new-modular-product
// @version      0.1.0
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
    "human resources"
  ];

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normaliseProfileName(value) {
    return cleanText(value)
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
        const name = normaliseProfileName(
          anchor.getAttribute("aria-label") || anchor.textContent
        );

        if (!name || name.length < 3 || seenUrls.has(profileUrl)) {
          return;
        }

        const card = anchor.closest("li") || anchor.parentElement;
        const role = cleanText(card?.innerText || "");

        if (!hasRecruiterRole(role)) {
          return;
        }

        const { firstName, lastName } = splitName(name);

        if (!firstName || !lastName) {
          return;
        }

        seenUrls.add(profileUrl);

        profiles.push({
          firstName,
          lastName,
          linkedinUrl: profileUrl,
          role: cleanText(role).slice(0, 180),
          location: "",
          source: "linkedin-visible",
          verified: false
        });
      });

    return profiles;
  }

  function importProfiles() {
    const recruiters = extractProfiles();

    if (!recruiters.length) {
      throw new Error(
        "No visible recruiter profiles found. Scroll the People page and try again."
      );
    }

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

    const button = document.createElement("button");

    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Import contacts (New Modular Product)";

    Object.assign(button.style, {
      position: "fixed",
      right: "24px",
      bottom: "24px",
      zIndex: "2147483647",
      padding: "12px 16px",
      border: "0",
      borderRadius: "6px",
      background: "#1f6f4a",
      color: "#fff",
      font: "600 14px sans-serif",
      cursor: "pointer",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)"
    });

    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Importing…";

      try {
        const result = await importProfiles();

        button.textContent = `${result.imported} imported, ${result.duplicates} duplicates`;
      } catch (error) {
        button.textContent = error.message || "Import failed.";
      } finally {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = "Import contacts (New Modular Product)";
        }, 5000);
      }
    });

    document.body.append(button);
  }

  addButton();

  new MutationObserver(addButton).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();