# -*- coding: utf-8 -*-
from pathlib import Path

target = Path("new-modular-product-linkedin-contact-bridge.user.js")

script = r'''// ==UserScript==
// @name         New Modular Product - Clean LinkedIn Contact Bridge
// @namespace    local.new-modular-product
// @version      0.4.0
// @description  Import clean visible LinkedIn People contacts.
// @match        https://www.linkedin.com/company/*/people/*
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(() => {
  "use strict";

  const API_URL = "http://127.0.0.1:3000/api/recruiters/import";
  const BUTTON_ID = "clean-linkedin-contact-import";
  const EMAIL_DOMAIN = "twinstream.com";

  const roleKeywords = [
    "talent acquisition",
    "talent",
    "recruiter",
    "recruitment",
    "chief people",
    "people officer",
    "head",
    "director",
    "manager",
    "partner",
    "human resources",
    "hr"
  ];

  const clean = (value) =>
    String(value || "")
      .replace(/\u00c2\u00b7/g, "·")
      .replace(/\u00c2\u00a3/g, "£")
      .replace(/\u00e2\u0080\u0099/g, "'")
      .replace(/\u00e2\u0080\u0093/g, "-")
      .replace(/\u00e2\u0080\u0094/g, "-")
      .replace(/\s+/g, " ")
      .trim();

  function profileNameFromAnchor(anchor) {
    const candidates = [
      anchor.getAttribute("aria-label"),
      anchor.querySelector("span")?.textContent,
      anchor.textContent
    ];

    for (const candidate of candidates) {
      const value = clean(candidate)
        .replace(/^view\s+/i, "")
        .replace(/\s+profile$/i, "")
        .trim();

      if (
        /^[A-Za-zÀ-ÖØ-öø-ÿ.'-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ.'-]+){1,4}$/.test(
          value
        )
      ) {
        return value;
      }
    }

    return "";
  }

  function splitName(name) {
    const parts = clean(name).split(/\s+/).filter(Boolean);

    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || ""
    };
  }

  function visibleText(node) {
    return clean(node?.innerText || node?.textContent || "");
  }

  function getCard(anchor) {
    const candidates = [
      anchor.closest("li"),
      anchor.closest('[data-view-name*="people"]'),
      anchor.closest("article"),
      anchor.parentElement?.parentElement?.parentElement
    ].filter(Boolean);

    return candidates.find((node) =>
      visibleText(node).length > 0
    ) || anchor.parentElement;
  }

  function extractRole(card, profileName) {
    const text = visibleText(card);

    if (!text) {
      return "";
    }

    const withoutName = clean(
      text.replace(new RegExp(
        profileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      ), "")
    );

    const withoutNoise = withoutName
      .replace(/\b\d+(st|nd|rd|th)\b/gi, " ")
      .replace(/\b\d+\s+(other\s+)?mutual connections?\b/gi, " ")
      .replace(/\b(and|is)\s+a\s+mutual connection\b.*$/i, " ")
      .replace(/\b(connect|message|follow)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const parts = withoutNoise
      .split(/(?=[A-Z][a-z]+\s+(?:at|@|for|of|in|-\s+))/)
      .map(clean)
      .filter(Boolean);

    const role = parts.find((part) =>
      roleKeywords.some((keyword) =>
        part.toLowerCase().includes(keyword)
      )
    );

    if (role) {
      return role
        .replace(/\s+(Jess|Raj|Ryan|Andy|David|Swetha|Emma)\s*$/i, "")
        .trim()
        .slice(0, 180);
    }

    const fallback = withoutNoise
      .replace(/^[^A-Za-z]+/, "")
      .split(/\s{2,}/)[0]
      .trim();

    return fallback.slice(0, 180);
  }

  function extractProfiles() {
    const contacts = [];
    const seen = new Set();

    document
      .querySelectorAll('a[href*="/in/"]')
      .forEach((anchor) => {
        const linkedinUrl = anchor.href.split("?")[0];

        if (seen.has(linkedinUrl)) {
          return;
        }

        const profileName = profileNameFromAnchor(anchor);

        if (!profileName) {
          return;
        }

        const { firstName, lastName } = splitName(profileName);

        if (!firstName || !lastName) {
          return;
        }

        const card = getCard(anchor);
        const role = extractRole(card, profileName);

        if (!role) {
          return;
        }

        seen.add(linkedinUrl);

        contacts.push({
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`,
          role,
          location: "",
          linkedinUrl,
          emailDomain: EMAIL_DOMAIN,
          source: "linkedin-visible",
          verified: false
        });
      });

    return contacts;
  }

  function importContacts(contacts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: API_URL,
        headers: {
          "Content-Type": "application/json"
        },
        data: JSON.stringify({
          sourceUrl: location.href,
          emailDomain: EMAIL_DOMAIN,
          recruiters: contacts
        }),
        timeout: 12000,
        onload(response) {
          let result;

          try {
            result = JSON.parse(response.responseText);
          } catch {
            reject(new Error("The server returned invalid JSON."));
            return;
          }

          if (
            response.status < 200 ||
            response.status >= 300 ||
            !result.ok
          ) {
            reject(new Error(result.error || "Import failed."));
            return;
          }

          resolve(result);
        },
        onerror() {
          reject(new Error("Cannot reach the local server."));
        },
        ontimeout() {
          reject(new Error("The local server timed out."));
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
    button.textContent = "Import clean LinkedIn contacts";

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
      cursor: "pointer"
    });

    button.addEventListener("click", async () => {
      button.disabled = true;

      try {
        const contacts = extractProfiles();

        if (!contacts.length) {
          throw new Error("No clean LinkedIn contacts found.");
        }

        console.table(contacts);

        const result = await importContacts(contacts);

        button.textContent =
          `${result.imported} imported, ` +
          `${result.duplicates} duplicates`;
      } catch (error) {
        console.error("[Clean LinkedIn Bridge]", error);
        button.textContent = error.message;
      } finally {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = "Import clean LinkedIn contacts";
        }, 5000);
      }
    });

    document.body.append(button);
  }

  addButton();

  new MutationObserver(addButton).observe(
    document.documentElement,
    { childList: true, subtree: true }
  );
})();
'''

target.write_text(script, encoding="utf-8")
print(f"Wrote {target}")

