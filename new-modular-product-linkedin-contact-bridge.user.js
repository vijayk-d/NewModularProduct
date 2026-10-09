// ==UserScript==
// @name         New Modular Product - Clean LinkedIn Contact Bridge
// @namespace    local.new-modular-product
// @version      0.4.0
// @description  Import clean visible LinkedIn People contacts.
// @match        https://www.linkedin.com/company/*/people/*
// @match        https://www.linkedin.com/search/results/people/*
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

  function removeRepeatedName(value) {
    const parts = clean(value).split(/\s+/).filter(Boolean);
    const half = Math.floor(parts.length / 2);

    if (
      half >= 2 &&
      parts.slice(0, half).join(" ").toLowerCase() ===
        parts.slice(half).join(" ").toLowerCase()
    ) {
      return parts.slice(0, half).join(" ");
    }

    return clean(value);
  }

  function splitName(name) {
    const parts = clean(name).split(/\s+/).filter(Boolean);

    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || ""
    };
  }

  function profileNameFromAnchor(anchor) {
    const rawValues = [
      anchor.getAttribute("aria-label"),
      anchor.querySelector("span")?.textContent,
      anchor.textContent
    ];

    for (const raw of rawValues) {
      const original = clean(raw);

      if (!original) continue;

      const value = original
        .replace(/^view\s+/i, "")
        .replace(/\s+profile$/i, "")
        .replace(
          /\s*[·•|]\s*(?:\d+(?:st|nd|rd|th)?|\d+\+|connection|connections?|followers?|following).*$/i,
          ""
        )
        .replace(/\s+\d+(?:st|nd|rd|th)?\s*$/i, "")
        .trim();

      if (!value) continue;

      if (
        /^(see open roles|open roles|view profile|profile)$/i.test(value)
      ) {
        continue;
      }

      const normalised = removeRepeatedName(value);
      const parts = normalised.split(/\s+/).filter(Boolean);

      if (
        parts.length >= 2 &&
        parts.length <= 5 &&
        parts.every((part) =>
          /^[A-Za-zÀ-ÖØ-öø-ÿ.'-]+$/.test(part)
        ) &&
        !/\b(at|and|for|of|in|united|kingdom|area)\b/i.test(normalised)
      ) {
        return normalised;
      }
    }

    return "";
  }

  function getProfileCard(anchor) {
    const candidates = [
      anchor.closest("li"),
      anchor.closest("article"),
      anchor.parentElement?.parentElement,
      anchor.parentElement?.parentElement?.parentElement
    ].filter(Boolean);

    return candidates.find((node) => {
      const cardText = clean(node.innerText || node.textContent);
      const profileLinks = node.querySelectorAll(
        'a[href*="/in/"]'
      ).length;

      return (
        profileLinks === 1 &&
        cardText.length >= 10 &&
        cardText.length <= 1800 &&
        !/^.*is a mutual connection$/i.test(cardText)
      );
    }) || null;
  }

  function extractRole(card, profileName) {
    const raw = String(card?.innerText || "");

    if (!raw) return "";

    const nameTokens = profileName
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const lines = raw
      .split(/\r?\n/)
      .map((line) =>
        clean(line)
          .replace(/^[·•|]\s*/, "")
          .replace(/\b\d+(st|nd|rd|th)\b/gi, "")
          .replace(/\b\d+\s+(other\s+)?mutual connections?\b.*$/i, "")
          .replace(/\b(?:and|is)\s+a\s+mutual connection\b.*$/i, "")
          .replace(/\b(?:connect|message|follow)\b.*$/i, "")
          .trim()
      )
      .filter(Boolean)
      .filter((line) => {
        const lower = line.toLowerCase();

        if (lower === profileName.toLowerCase()) return false;

        const containsFullName =
          nameTokens.length >= 2 &&
          nameTokens.every((token) => lower.includes(token));

        if (containsFullName) return false;

        if (/^(2nd|3rd|3rd\+|view full profile)$/i.test(line)) {
          return false;
        }

        if (
          /\b(?:united kingdom|england|scotland|wales|ireland)\b/i.test(line)
        ) {
          return false;
        }

        if (/\bmutual connection\b/i.test(line)) return false;

        return line.length >= 3 && line.length <= 220;
      });

    const role = lines.find((line) =>
      roleKeywords.some((keyword) =>
        line.toLowerCase().includes(keyword)
      )
    );

    if (role) {
      return role
        .replace(/\s+(Jess|Raj|Ryan|Andy|David|Swetha|Emma)\s*$/i, "")
        .replace(/\s+(United Kingdom|England|Scotland|Wales)$/i, "")
        .trim();
    }

    return lines.find((line) =>
      /\b(at|@|manager|director|engineer|officer|lead|architect|consultant|analyst)\b/i.test(
        line
      )
    ) || "";
  }

  function extractProfiles() {
    const contacts = [];
    const seen = new Set();
    const allAnchors = document.querySelectorAll('a[href*="/in/"]');

    console.log(
      "[Clean LinkedIn Bridge] Found",
      allAnchors.length,
      "profile anchors on this page."
    );

    allAnchors.forEach((anchor) => {
      const linkedinUrl = anchor.href.split("?")[0];

      if (
        seen.has(linkedinUrl) ||
        /\/opportunities\//i.test(linkedinUrl)
      ) {
        return;
      }

      const profileName = profileNameFromAnchor(anchor);

      if (!profileName) {
        console.log(
          "[Clean LinkedIn Bridge] Rejected: no profile name",
          anchor.href,
          anchor.getAttribute("aria-label"),
          anchor.textContent?.slice(0, 120)
        );
        return;
      }

      const card = getProfileCard(anchor);

      if (!card) {
        console.log(
          "[Clean LinkedIn Bridge] Rejected: no card",
          profileName,
          anchor.href
        );
        return;
      }

      const { firstName, lastName } = splitName(profileName);
      const role = extractRole(card, profileName);

      if (!firstName || !lastName || !role) {
        console.log(
          "[Clean LinkedIn Bridge] Rejected: incomplete contact",
          {
            profileName,
            firstName,
            lastName,
            role,
            cardText: card.innerText?.slice(0, 300)
          }
        );
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

    console.log(
      "[Clean LinkedIn Bridge] Extracted",
      contacts.length,
      "valid contacts before validation."
    );

    if (contacts.length) {
      console.table(
        contacts.map((c) => ({
          firstName: c.firstName,
          lastName: c.lastName,
          role: c.role
        }))
      );
    }

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
      left: "0",
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: "2147483647",
      padding: "14px 18px",
      border: "2px solid #b45309",
      borderRadius: "0 8px 8px 0",
      background: "#ffd400",
      color: "#111827",
      font: "700 14px sans-serif",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)"
    });

    button.addEventListener("click", async () => {
      button.disabled = true;

      try {
        const contacts = extractProfiles();

        if (!contacts.length) {
          throw new Error("No clean LinkedIn contacts found.");
        }

        console.table(contacts);

        const invalid = contacts.filter((contact) =>
          !contact.firstName ||
          !contact.lastName ||
          !contact.role ||
          contact.lastName.split(/\s+/).length > 6 ||
          /open roles|mutual connection/i.test(
            `${contact.lastName} ${contact.role}`
          )
        );

        if (invalid.length) {
          console.table(invalid);
          throw new Error(
            `${invalid.length} contacts failed validation. Nothing was imported.`
          );
        }

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

  function pageIsSupported() {
    return (
      location.pathname.startsWith("/company/") &&
      location.pathname.includes("/people") ||
      location.pathname.startsWith("/search/results/people")
    );
  }

  function installWhenSupported() {
    if (pageIsSupported()) {
      addButton();
    }
  }

  installWhenSupported();

  new MutationObserver(installWhenSupported).observe(
    document.documentElement,
    { childList: true, subtree: true }
  );

  window.addEventListener("popstate", installWhenSupported);
  window.addEventListener("locationchange", installWhenSupported);
})();
