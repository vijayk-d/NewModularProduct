from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TARGETS = [
    ROOT / "new-modular-product-linkedin-contact-bridge.user.js",
    ROOT / "linkedin-recruiter-bridge.user.js",
]

SCRIPT = r'''// ==UserScript==
// @name         New Modular Product - LinkedIn Contact Bridge
// @namespace    local.new-modular-product
// @version      0.3.0
// @description  Import normalized visible LinkedIn People profiles.
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

  const roleKeywords = [
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
    "people",
    "chief"
  ];

  function clean(value) {
    return String(value ?? "")
      .replace(/\u00c2\u00b7/g, " ")
      .replace(/\u00c2\u00a3/g, "£")
      .replace(/\u00e2\u0080\u0099/g, "'")
      .replace(/\u00e2\u0080\u0093/g, "-")
      .replace(/\u00e2\u0080\u0094/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normaliseName(value) {
    return clean(value)
      .replace(/^view\s+/i, "")
      .replace(/[’']s profile$/i, "")
      .replace(/\s*[·•]\s*\d+(st|nd|rd|th)?\s*$/i, "")
      .replace(/\s+\d+(st|nd|rd|th)\s*$/i, "")
      .trim();
  }

  function splitName(value) {
    const parts = normaliseName(value)
      .split(/\s+/)
      .filter(Boolean);

    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || ""
    };
  }

  function removeProfileName(value, profileName) {
    const escaped = profileName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    return value.replace(
      new RegExp(`\\b${escaped}\\b`, "i"),
      ""
    );
  }

  function cleanRole(value, profileName) {
    let role = clean(value);

    if (profileName) {
      role = removeProfileName(role, profileName);
    }

    return role
      .replace(/\b(view|profile)\b/gi, "")
      .replace(/\b\d+(st|nd|rd|th)\s+degree\s+connection\b/gi, "")
      .replace(/\b\d+(st|nd|rd|th)\b/gi, "")
      .replace(/\b\d+\s+(other\s+)?mutual connections?\b/gi, "")
      .replace(/\b(and|is)\s+a\s+mutual connection\b/gi, "")
      .replace(/\b(connect|message|follow)\b/gi, "")
      .replace(/\s*[·•]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isLikelyRole(value) {
    const role = clean(value).toLowerCase();

    return roleKeywords.some((keyword) =>
      role.includes(keyword)
    );
  }

  function extractRole(cardText, profileName) {
    const cleaned = cleanRole(cardText, profileName);

    if (!isLikelyRole(cleaned)) {
      return "";
    }

    return cleaned
      .split(/\s+/)
      .slice(0, 18)
      .join(" ")
      .trim();
  }

  function extractLocation(cardText, profileName, role) {
    let value = clean(cardText);

    if (profileName) {
      value = removeProfileName(value, profileName);
    }

    if (role) {
      value = value.replace(role, "");
    }

    value = value
      .replace(/\b\d+(st|nd|rd|th)\b/g, "")
      .replace(/\b\d+\s+(other\s+)?mutual connections?\b/gi, "")
      .replace(/\b(connect|message|follow)\b/gi, "")
      .replace(/\s*[·•]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const candidates = value
      .split(/\s{2,}|,|\n/)
      .map((item) => clean(item))
      .filter(Boolean);

    return candidates.find((item) =>
      /[A-Za-z]+\s*,\s*[A-Za-z]+/.test(item)
    ) || "";
  }

  function extractProfiles() {
    const profiles = [];
    const seen = new Set();

    document
      .querySelectorAll('a[href*="linkedin.com/in/"]')
      .forEach((anchor) => {
        const linkedinUrl = anchor.href.split("?")[0];

        if (seen.has(linkedinUrl)) {
          return;
        }

        const rawName =
          anchor.getAttribute("aria-label") ||
          anchor.textContent ||
          "";

        const profileName = normaliseName(rawName);

        if (
          !profileName ||
          profileName.length < 3 ||
          /^profile$/i.test(profileName)
        ) {
          return;
        }

        const card = anchor.closest("li") || anchor.parentElement;
        const cardText = clean(card?.innerText || "");
        const { firstName, lastName } = splitName(profileName);
        const role = extractRole(cardText, profileName);

        if (!firstName || !lastName || !role) {
          return;
        }

        seen.add(linkedinUrl);

        profiles.push({
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          role,
          location: extractLocation(
            cardText,
            profileName,
            role
          ),
          linkedinUrl,
          source: "linkedin-visible",
          verified: false
        });
      });

    return profiles;
  }

  function sendImport(recruiters) {
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
          let data;

          try {
            data = JSON.parse(response.responseText);
          } catch {
            reject(new Error("The local server returned invalid JSON."));
            return;
          }

          if (
            response.status < 200 ||
            response.status >= 300 ||
            !data.ok
          ) {
            reject(new Error(data.error || "Contact import failed."));
            return;
          }

          resolve(data);
        },
        onerror() {
          reject(new Error("Cannot reach the local server."));
        },
        ontimeout() {
          reject(new Error("The local server request timed out."));
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
    button.textContent = "Import normalized contacts";

    Object.assign(button.style, {
      position: "fixed",
      right: "24px",
      bottom: "24px",
      zIndex: "2147483647",
      padding: "12px 16px",
      border: "0",
      borderRadius: "6px",
      background: "#2563eb",
      color: "#fff",
      font: "600 14px sans-serif",
      cursor: "pointer",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)"
    });

    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Importing normalized contacts…";

      try {
        const recruiters = extractProfiles();

        if (!recruiters.length) {
          throw new Error(
            "No normalized recruiter profiles were found. " +
            "Scroll the LinkedIn People page and try again."
          );
        }

        const result = await sendImport(recruiters);

        button.textContent =
          `${result.imported || 0} imported, ` +
          `${result.duplicates || 0} duplicates`;
      } catch (error) {
        button.textContent =
          error.message || "Import failed.";
      } finally {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = "Import normalized contacts";
        }, 5000);
      }
    });

    document.body.append(button);
  }

  addButton();

  new MutationObserver(addButton).observe(
    document.documentElement,
    {
      childList: true,
      subtree: true
    }
  );
})();
'''

written = False

for target in TARGETS:
    if target.exists():
        target.write_text(SCRIPT, encoding="utf-8", newline="\n")
        print(f"UPDATED: {target}")
        written = True

if not written:
    target = ROOT / "new-modular-product-linkedin-contact-bridge.user.js"
    target.write_text(SCRIPT, encoding="utf-8", newline="\n")
    print(f"CREATED: {target}")