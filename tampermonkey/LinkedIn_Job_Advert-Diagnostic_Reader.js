// ==UserScript==
// @name         LinkedIn Job Advert - Diagnostic Reader
// @namespace    local.linkedin-job-reader
// @version      0.1.0
// @description  Read LinkedIn job details into a local review panel.
// @match        https://www.linkedin.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_setClipboard
// ==/UserScript==

(() => {
  "use strict";

  const BUTTON_ID = "ljr-extract-button";
  const PANEL_ID = "ljr-review-panel";
  const JOB_PATH = /^\/jobs\/view\/(\d+)(?:\/|$)/;

  let latestResult = null;
  let busy = false;
  let previousUrl = location.href;

  const selectors = {
    title: [
      ".job-details-jobs-unified-top-card__job-title h1",
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      ".top-card-layout__title",
      "main h1"
    ],

    company: [
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name a",
      ".topcard__org-name-link"
    ],

    primaryDetails: [
      ".job-details-jobs-unified-top-card__primary-description-container",
      ".jobs-unified-top-card__primary-description",
      ".topcard__flavor-row"
    ],

    location: [
      ".job-details-jobs-unified-top-card__primary-description-container .tvm__text--low-emphasis",
      ".jobs-unified-top-card__bullet",
      ".topcard__flavor--bullet"
    ],

    workplace: [
      ".job-details-jobs-unified-top-card__workplace-type",
      ".jobs-unified-top-card__workplace-type"
    ],

    preferences: [
      ".job-details-fit-level-preferences",
      ".job-details-jobs-unified-top-card__job-insight",
      ".jobs-unified-top-card__job-insight"
    ],

    description: [
      "#job-details",
      ".jobs-description__content .jobs-box__html-content",
      ".jobs-description-content__text",
      ".jobs-description__content",
      ".show-more-less-html__markup"
    ],

    hiringTeam: [
      ".job-details-people-who-can-help__section",
      ".jobs-poster",
      ".hirer-card"
    ]
  };

  function clean(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function text(node) {
    return String(node?.innerText || node?.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function supported() {
    return JOB_PATH.test(location.pathname);
  }

  function ownElement(node) {
    return Boolean(node.closest(`#${PANEL_ID}, #${BUTTON_ID}`));
  }

  function displayed(node) {
    if (!node || ownElement(node)) return false;
    const style = getComputedStyle(node);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      node.getClientRects().length > 0
    );
  }

  function firstMatch(list, root = document) {
    for (const selector of list) {
      const node = [...root.querySelectorAll(selector)]
        .find(node => displayed(node) && text(node));

      if (node) {
        return { node, selector, value: text(node) };
      }
    }

    return { node: null, selector: "", value: "" };
  }

  function sectionByHeading(pattern) {
    const headings = [
      ...document.querySelectorAll(
        "main h1, main h2, main h3, main h4, main [role='heading']"
      )
    ].filter(displayed);

    const heading = headings.find(node => pattern.test(clean(text(node))));
    if (!heading) return null;

    // Prefer the nearest semantic section that actually has content.
    for (
      let node = heading.parentElement, depth = 0;
      node && depth < 6 && node.tagName !== "MAIN";
      node = node.parentElement, depth++
    ) {
      const value = text(node);

      if (
        node.matches("section, article, .artdeco-card") &&
        value.length > text(heading).length + 15
      ) {
        return node;
      }
    }

    // Conservative fallback: stop before swallowing several other sections.
    for (
      let node = heading.parentElement, depth = 0;
      node && depth < 4 && node.tagName !== "MAIN";
      node = node.parentElement, depth++
    ) {
      if (
        text(node).length > text(heading).length + 30 &&
        node.querySelectorAll("h2, h3, [role='heading']").length <= 2
      ) {
        return node;
      }
    }

    return heading.parentElement;
  }

  function absoluteUrl(value) {
    try {
      const url = new URL(value, location.origin);
      url.search = "";
      url.hash = "";
      return url.href;
    } catch {
      return "";
    }
  }

  function profileLinks(root) {
    if (!root) return [];

    const found = new Map();

    for (const anchor of root.querySelectorAll('a[href*="/in/"]')) {
      const url = absoluteUrl(anchor.getAttribute("href"));
      if (!url || !/^https:\/\/www\.linkedin\.com\/in\//i.test(url)) continue;

      const record = {
        label: clean(text(anchor)),
        ariaLabel: clean(anchor.getAttribute("aria-label")),
        linkedinUrl: url
      };

      const previous = found.get(url);

      if (!previous || (!previous.label && record.label)) {
        found.set(url, record);
      }
    }

    return [...found.values()];
  }

  function linkFromMatch(match) {
    const anchor = match.node?.matches("a")
      ? match.node
      : match.node?.querySelector("a");

    return anchor ? absoluteUrl(anchor.getAttribute("href")) : "";
  }

  function collectTexts(list) {
    const values = [];

    for (const selector of list) {
      for (const node of document.querySelectorAll(selector)) {
        if (!displayed(node)) continue;
        const value = text(node);
        if (value && !values.includes(value)) values.push(value);
      }
    }

    return values;
  }

  async function expandDescription() {
    const root = firstMatch([
      ".jobs-description",
      ".jobs-description__container",
      ".description"
    ]).node || sectionByHeading(/^About the job$/i);

    if (!root) return false;

    const button = [...root.querySelectorAll("button")].find(node => {
      const label = clean(
        `${text(node)} ${node.getAttribute("aria-label") || ""}`
      );

      return (
        displayed(node) &&
        !node.disabled &&
        /\b(show more|see more|show full description)\b/i.test(label) &&
        !/\b(show less|see less)\b/i.test(label)
      );
    });

    if (!button) return false;

    button.click();
    await new Promise(resolve => setTimeout(resolve, 700));
    return true;
  }

  function extract(expansionAttempted) {
    const diagnostics = {};
    const warnings = [];

    function read(name) {
      const match = firstMatch(selectors[name]);
      diagnostics[name] = {
        selector: match.selector || null,
        found: Boolean(match.node)
      };
      return match;
    }

    const title = read("title");
    const company = read("company");
    const primary = read("primaryDetails");
    const locationMatch = read("location");
    const workplaceMatch = read("workplace");
    const descriptionMatch = read("description");

    const reachOut = sectionByHeading(/^People you can reach out to$/i);
    const hiringHeading = sectionByHeading(
      /^(Meet the hiring team|Meet your hiring team|Job poster)$/i
    );
    const hiringMatch = firstMatch(selectors.hiringTeam);
    const hiringRoot = hiringHeading || hiringMatch.node;
    const aboutCompany = sectionByHeading(/^About the company$/i);

    const preferences = collectTexts(selectors.preferences);
    const locationRaw = locationMatch.value;
    const workplaceSource = [
      workplaceMatch.value,
      ...preferences,
      primary.value
    ].join("\n");

    const workplaceTypes = [
      ...new Set(
        (workplaceSource.match(/\b(?:hybrid|remote|on[- ]site)\b/gi) || [])
          .map(value => {
            if (/^remote$/i.test(value)) return "Remote";
            if (/^hybrid$/i.test(value)) return "Hybrid";
            return "On-site";
          })
      )
    ];

    const descriptionSection = descriptionMatch.node
      ? null
      : sectionByHeading(/^About the job$/i);

    const description =
      descriptionMatch.value || text(descriptionSection);

    if (!title.value) warnings.push("Job title was not found.");
    if (!company.value) warnings.push("Advertising company was not found.");
    if (!locationRaw) warnings.push("Location was not found.");
    if (!description) warnings.push("About the job was not found.");

    if (!reachOut) {
      warnings.push(
        '"People you can reach out to" was not found in the loaded page.'
      );
    }

    if (!hiringRoot) {
      warnings.push("An explicit hiring-team/job-poster section was not found.");
    }

    if (workplaceTypes.length > 1) {
      warnings.push(
        "Multiple workplace terms were found. Review the raw preference text."
      );
    }

    if (
      description &&
      /\b(show more|see more)\s*$/i.test(description)
    ) {
      warnings.push(
        "The description may still be collapsed. Expand it manually and extract again."
      );
    }

    const id = location.pathname.match(JOB_PATH)?.[1] || "";

    return {
      extractedAt: new Date().toISOString(),
      jobId: id,
      jobUrl: `https://www.linkedin.com/jobs/view/${id}/`,
      sourceUrl: location.href,

      jobTitle: clean(title.value),

      advertiser: {
        name: clean(company.value),
        linkedinUrl: linkFromMatch(company),
        note:
          "Company/agency shown on the advert; not independently verified as the employer."
      },

      location: {
        raw: locationRaw,
        workplaceTypes,
        primaryDetailsRaw: primary.value,
        jobPreferencesRaw: preferences
      },

      peopleYouCanReachOutTo: {
        sectionFound: Boolean(reachOut),
        sectionText: text(reachOut),
        profiles: profileLinks(reachOut)
      },

      hiringTeamOrJobPoster: {
        sectionFound: Boolean(hiringRoot),
        sectionText: text(hiringRoot),
        profiles: profileLinks(hiringRoot),
        note:
          "Review the section text to identify who is explicitly labelled Job poster."
      },

      aboutTheJob: description,

      aboutTheCompany: {
        sectionFound: Boolean(aboutCompany),
        sectionText: text(aboutCompany)
      },

      diagnostics: {
        descriptionExpansionAttempted: expansionAttempted,
        matchedSelectors: diagnostics,
        warnings,
        mainTextSnapshot: text(document.querySelector("main"))
      }
    };
  }

  function readable(result) {
    const profiles = entries =>
      entries.length
        ? entries.map(item =>
            `- ${item.label || item.ariaLabel || "(unlabelled profile)"}\n` +
            `  ${item.linkedinUrl}`
          ).join("\n")
        : "(No profile links found)";

    return [
      "LINKEDIN JOB ADVERT — REVIEW",
      `Extracted: ${result.extractedAt}`,
      "",
      `JOB ID: ${result.jobId}`,
      `URL: ${result.jobUrl}`,
      `JOB TITLE: ${result.jobTitle || "(Not found)"}`,
      `ADVERTISING COMPANY / AGENCY: ${result.advertiser.name || "(Not found)"}`,
      `COMPANY LINK: ${result.advertiser.linkedinUrl || "(Not found)"}`,
      "",
      "LOCATION",
      result.location.raw || "(Not found)",
      `Workplace: ${result.location.workplaceTypes.join(", ") || "(Not found)"}`,
      "",
      "TOP-CARD DETAILS",
      result.location.primaryDetailsRaw || "(Not found)",
      ...result.location.jobPreferencesRaw,
      "",
      "PEOPLE YOU CAN REACH OUT TO",
      result.peopleYouCanReachOutTo.sectionText || "(Section not found)",
      "",
      profiles(result.peopleYouCanReachOutTo.profiles),
      "",
      "HIRING TEAM / JOB POSTER",
      result.hiringTeamOrJobPoster.sectionText || "(Section not found)",
      "",
      profiles(result.hiringTeamOrJobPoster.profiles),
      "",
      "ABOUT THE JOB",
      result.aboutTheJob || "(Not found)",
      "",
      "ABOUT THE COMPANY — SEPARATE SECTION",
      result.aboutTheCompany.sectionText || "(Section not found)",
      "",
      "WARNINGS",
      result.diagnostics.warnings.length
        ? result.diagnostics.warnings.map(value => `- ${value}`).join("\n")
        : "(No extraction warnings)",
      "",
      "MATCHED SELECTORS",
      JSON.stringify(result.diagnostics.matchedSelectors, null, 2)
    ].join("\n");
  }

  function showPanel(result) {
    document.getElementById(PANEL_ID)?.remove();

    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    Object.assign(panel.style, {
      position: "fixed",
      inset: "5vh 3vw 5vh auto",
      width: "min(850px, 94vw)",
      zIndex: "2147483647",
      background: "#fff",
      color: "#111827",
      border: "3px solid #eab308",
      borderRadius: "10px",
      boxShadow: "0 12px 45px #0006",
      display: "flex",
      flexDirection: "column",
      padding: "14px",
      boxSizing: "border-box",
      font: "14px system-ui, sans-serif"
    });

    const toolbar = document.createElement("div");
    Object.assign(toolbar.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      alignItems: "center",
      marginBottom: "10px"
    });

    const title = document.createElement("span");
    title.textContent = `Job ${result.jobId} — extraction review`;
    title.style.fontWeight = "700";
    title.style.marginRight = "auto";
    toolbar.append(title);

    const output = document.createElement("textarea");
    output.readOnly = true;
    output.spellcheck = false;
    output.value = readable(result);
    Object.assign(output.style, {
      flex: "1",
      minHeight: "0",
      width: "100%",
      resize: "none",
      boxSizing: "border-box",
      background: "#f8fafc",
      color: "#111827",
      border: "1px solid #cbd5e1",
      padding: "12px",
      font: "13px/1.5 monospace"
    });

    function action(label, handler) {
      const button = document.createElement("button");
      button.textContent = label;
      Object.assign(button.style, {
        padding: "7px 10px",
        cursor: "pointer",
        color: "#111827",
        background: "#f1f5f9",
        border: "1px solid #94a3b8",
        borderRadius: "5px"
      });
      button.addEventListener("click", handler);
      toolbar.append(button);
    }

    action("Readable view", () => {
      output.value = readable(result);
    });

    action("JSON view", () => {
      output.value = JSON.stringify(result, null, 2);
    });

    action("Copy shown text", () => {
      GM_setClipboard(output.value, "text");
    });

    action("Extract again", runExtraction);
    action("Close", () => panel.remove());

    panel.append(toolbar, output);
    document.body.append(panel);
  }

  async function runExtraction() {
    if (busy || !supported()) return;

    busy = true;
    const button = document.getElementById(BUTTON_ID);

    if (button) {
      button.disabled = true;
      button.textContent = "Reading job advert…";
    }

    const startUrl = location.href;

    try {
      const expanded = await expandDescription();

      if (location.href !== startUrl || !supported()) {
        throw new Error("The page changed. Click Extract on the intended job.");
      }

      latestResult = extract(expanded);

      console.group(`[LinkedIn Job Reader] ${latestResult.jobId}`);
      console.log("Extracted job:", latestResult);
      console.table(latestResult.diagnostics.matchedSelectors);
      console.log("Warnings:", latestResult.diagnostics.warnings);
      console.groupEnd();

      showPanel(latestResult);
    } catch (error) {
      console.error("[LinkedIn Job Reader]", error);
      window.alert(`Job extraction failed: ${error.message}`);
    } finally {
      busy = false;

      if (button) {
        button.disabled = false;
        button.textContent = "Extract LinkedIn job";
      }
    }
  }

  function syncButton() {
    if (!supported()) {
      document.getElementById(BUTTON_ID)?.remove();
      document.getElementById(PANEL_ID)?.remove();
      latestResult = null;
      return;
    }

    if (!document.body || document.getElementById(BUTTON_ID)) return;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.textContent = "Extract LinkedIn job";

    Object.assign(button.style, {
      position: "fixed",
      left: "0",
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: "2147483646",
      padding: "14px 18px",
      border: "2px solid #b45309",
      borderRadius: "0 8px 8px 0",
      background: "#ffd400",
      color: "#111827",
      font: "700 14px system-ui, sans-serif",
      cursor: "pointer",
      boxShadow: "0 4px 12px #0004"
    });

    button.addEventListener("click", runExtraction);
    document.body.append(button);
  }

  // Keep the UI in sync when LinkedIn navigates without a full page load.
  setInterval(() => {
    if (location.href !== previousUrl) {
      previousUrl = location.href;
      latestResult = null;
      document.getElementById(PANEL_ID)?.remove();
    }

    syncButton();
  }, 800);

  window.addEventListener("popstate", syncButton);
  syncButton();
})();