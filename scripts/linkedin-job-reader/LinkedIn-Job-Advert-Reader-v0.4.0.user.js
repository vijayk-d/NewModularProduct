// ==UserScript==
// @name         LinkedIn Job Advert - Diagnostic Reader
// @namespace    local.linkedin-job-reader
// @version      0.4.0
// @description  Read job details locally with a green rounded corner button.
// @match        https://www.linkedin.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(() => {
  "use strict";
  const BUTTON_ID = "ljr-extract-button", PANEL_ID = "ljr-review-panel";
  const JOB_PATH = /^\/jobs\/view\/(\d+)(?:\/|$)/;
  let busy = false, previousUrl = location.href;
  const selectors = {
    title: [".job-details-jobs-unified-top-card__job-title h1", ".job-details-jobs-unified-top-card__job-title", ".jobs-unified-top-card__job-title", ".top-card-layout__title", "main h1"],
    company: [".job-details-jobs-unified-top-card__company-name a", ".job-details-jobs-unified-top-card__company-name", ".jobs-unified-top-card__company-name a", ".topcard__org-name-link"],
    primaryDetails: [".job-details-jobs-unified-top-card__primary-description-container", ".jobs-unified-top-card__primary-description", ".topcard__flavor-row"],
    location: [".job-details-jobs-unified-top-card__primary-description-container .tvm__text--low-emphasis", ".jobs-unified-top-card__bullet", ".topcard__flavor--bullet"],
    workplace: [".job-details-jobs-unified-top-card__workplace-type", ".jobs-unified-top-card__workplace-type"],
    preferences: [".job-details-fit-level-preferences", ".job-details-jobs-unified-top-card__job-insight", ".jobs-unified-top-card__job-insight"],
    description: ["#job-details", ".jobs-description__content .jobs-box__html-content", ".jobs-description-content__text", ".jobs-description__content", ".show-more-less-html__markup"],
    hiringTeam: [".job-details-people-who-can-help__section", ".jobs-poster", ".hirer-card"]
  };
  const clean = value => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const text = node => String(node?.innerText || node?.textContent || "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const linesOf = value => String(value || "").split(/\r?\n/).map(clean).filter(Boolean);
  const supported = () => JOB_PATH.test(location.pathname);
  const ownElement = node => Boolean(node.closest(`#${PANEL_ID}, #${BUTTON_ID}`));
  function displayed(node) {
    if (!node || ownElement(node)) return false;
    const style = getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
  }
  function firstMatch(list, root = document) {
    for (const selector of list) {
      const node = [...root.querySelectorAll(selector)].find(node => displayed(node) && text(node));
      if (node) return {node, selector, value: text(node)};
    }
    return {node: null, selector: "", value: ""};
  }
  function sectionByHeading(pattern) {
    const heading = [...document.querySelectorAll("main h1, main h2, main h3, main h4, main [role='heading']")].filter(displayed).find(node => pattern.test(clean(text(node))));
    if (!heading) return null;
    for (let node = heading.parentElement, depth = 0; node && depth < 6 && node.tagName !== "MAIN"; node = node.parentElement, depth++) {
      if (node.matches("section, article, .artdeco-card") && text(node).length > text(heading).length + 15) return node;
    }
    for (let node = heading.parentElement, depth = 0; node && depth < 4 && node.tagName !== "MAIN"; node = node.parentElement, depth++) {
      if (text(node).length > text(heading).length + 30 && node.querySelectorAll("h2, h3, [role='heading']").length <= 2) return node;
    }
    return heading.parentElement;
  }
  function absoluteUrl(value) {
    try {
      const url = new URL(value, location.origin);
      url.search = ""; url.hash = "";
      return url.href;
    } catch { return ""; }
  }
  function profileLinks(root) {
    const found = new Map();
    for (const anchor of root?.querySelectorAll('a[href*="/in/"]') || []) {
      const url = absoluteUrl(anchor.getAttribute("href"));
      if (!/^https:\/\/www\.linkedin\.com\/in\//i.test(url)) continue;
      const record = {label: text(anchor), ariaLabel: clean(anchor.getAttribute("aria-label")), linkedinUrl: url};
      if (!found.has(url) || (!found.get(url).label && record.label)) found.set(url, record);
    }
    return [...found.values()];
  }
  function collectTexts(list) {
    const values = new Set();
    for (const selector of list) for (const node of document.querySelectorAll(selector)) if (displayed(node) && text(node)) values.add(text(node));
    return [...values];
  }
  const expansionMarker = value => /(?:…|\.\.\.)\s*more\b|(?:^|\n)\s*(?:show more|see more)\s*(?:\n|$)/i.test(value);
  function expansionControls(root) {
    return [...(root?.querySelectorAll("button, [role='button'], a") || [])].filter(node => {
      const labels = [clean(text(node)), clean(node.getAttribute("aria-label"))];
      const exact = labels.some(label => /^(?:(?:…|\.\.\.)\s*)?(?:more|show more|see more|show full description|show more about the company)$/i.test(label));
      const href = node.getAttribute("href");
      const localControl = node.tagName !== "A" || !href || href === "#" || href.startsWith("javascript:");
      return displayed(node) && !node.disabled && node.getAttribute("aria-disabled") !== "true" && exact && localControl;
    });
  }
  async function expandSections() {
    const report = {job: {attempted: false, clicks: 0}, company: {attempted: false, clicks: 0}};
    const startUrl = location.href;
    for (const [key, pattern] of [["job", /^About the job$/i], ["company", /^About the company$/i]]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (location.href !== startUrl) break;
        const root = sectionByHeading(pattern) || (key === "job" ? firstMatch([".jobs-description", ".jobs-description__container", ".description"]).node : null);
        const control = expansionControls(root)[0];
        if (!control) break;
        report[key].attempted = true;
        const before = text(root);
        control.click(); report[key].clicks++;
        await new Promise(resolve => setTimeout(resolve, 900));
        if (text(root) === before) break;
      }
    }
    return report;
  }
  function extract(expansionReport) {
    const matchedSelectors = {};
    function read(name) {
      const match = firstMatch(selectors[name]);
      matchedSelectors[name] = {selector: match.selector || null, found: Boolean(match.node)};
      return match;
    }
    const title = read("title"), company = read("company"), primary = read("primaryDetails"), locationMatch = read("location"), workplace = read("workplace"), description = read("description");
    const reach = sectionByHeading(/^People you can reach out to$/i);
    const hiring = sectionByHeading(/^(Meet the hiring team|Meet your hiring team|Job poster)$/i) || firstMatch(selectors.hiringTeam).node;
    const companySection = sectionByHeading(/^About the company$/i);
    const companyAnchor = company.node?.matches("a") ? company.node : company.node?.querySelector("a");
    const preferences = collectTexts(selectors.preferences);
    const workplaceTypes = [...new Set(([workplace.value, ...preferences, primary.value].join("\n").match(/\b(?:hybrid|remote|on[- ]site)\b/gi) || []).map(value => /^hybrid$/i.test(value) ? "Hybrid" : /^remote$/i.test(value) ? "Remote" : "On-site"))];
    const id = location.pathname.match(JOB_PATH)?.[1] || "";
    return {
      scriptVersion: "0.4.0", extractedAt: new Date().toISOString(), jobId: id, jobUrl: `https://www.linkedin.com/jobs/view/${id}/`, sourceUrl: location.href,
      jobTitle: clean(title.value),
      advertiser: {name: clean(company.value), linkedinUrl: companyAnchor ? absoluteUrl(companyAnchor.getAttribute("href")) : "", note: "Company/agency shown on the advert; not independently verified as the employer."},
      location: {raw: locationMatch.value, workplaceTypes, primaryDetailsRaw: primary.value, jobPreferencesRaw: preferences},
      peopleYouCanReachOutTo: {sectionFound: Boolean(reach), sectionText: text(reach), profiles: profileLinks(reach)},
      hiringTeamOrJobPoster: {sectionFound: Boolean(hiring), sectionText: text(hiring), profiles: profileLinks(hiring), note: "Only profiles explicitly labelled Job poster are identified as posters."},
      aboutTheJob: description.value || text(sectionByHeading(/^About the job$/i)),
      aboutTheCompany: {sectionFound: Boolean(companySection), sectionText: text(companySection)},
      diagnostics: {descriptionExpansionAttempted: expansionReport.job.attempted, expansionReport, matchedSelectors, warnings: [], mainTextSnapshot: text(document.querySelector("main"))}
    };
  }
  function applyTextFallbacks(result) {
    const lines = linesOf(result.diagnostics.mainTextSnapshot), sources = {};
    const mark = (field, source) => {sources[field] = source;};
    const boundary = lines.findIndex(line => /^(People you can reach out to|Meet the hiring team|About the job|About the company|More jobs)$/i.test(line));
    const header = boundary >= 0 ? lines.slice(0, boundary) : [];
    result.diagnostics.headerTextUsedForFallback = header.join("\n");
    const metadata = header.findIndex(line => /[·•]/.test(line) && /\b(?:applicants?|ago|reposted|promoted)\b/i.test(line));
    if (metadata >= 2) {
      if (!result.jobTitle) {result.jobTitle = header[metadata - 1]; mark("jobTitle", "Header line before posting metadata");}
      if (!result.advertiser.name) {result.advertiser.name = header[metadata - 2]; mark("advertiser.name", "Header line two positions before posting metadata");}
      if (!result.location.raw) {result.location.raw = clean(header[metadata].split(/[·•]/)[0]); mark("location.raw", "Location portion of header metadata");}
      if (!result.location.primaryDetailsRaw) result.location.primaryDetailsRaw = header[metadata];
    }
    if (!result.location.workplaceTypes.length) {
      result.location.workplaceTypes = [...new Set(header.filter(line => /^(remote|hybrid|on[- ]site)$/i.test(line)).map(line => /^remote$/i.test(line) ? "Remote" : /^hybrid$/i.test(line) ? "Hybrid" : "On-site"))];
      if (result.location.workplaceTypes.length) mark("location.workplaceTypes", "Standalone header workplace label");
    }
    const descriptionLines = linesOf(result.aboutTheJob);
    if (/^About the job$/i.test(descriptionLines[0] || "")) descriptionLines.shift();
    result.salary = {advertised: header.find(line => /(?:£|\bGBP\b|\bUSD\b|\bEUR\b)/i.test(line) && /\d/.test(line)) || "", descriptionMentions: descriptionLines.filter(line => /(?:£|\bGBP\b|\bUSD\b|\bEUR\b)/i.test(line) && /\d/.test(line))};
    result.employmentType = header.find(line => /^(full-time|part-time|contract|temporary|internship|volunteer|other)$/i.test(line)) || "";
    result.applicationStatus = header.find(line => /^(no longer accepting applications|actively reviewing applicants)$/i.test(line)) || "";
    result.descriptionDetails = {openingLine: descriptionLines[0] || "", locationAndWorkingPattern: descriptionLines.filter(line => /\b(?:hybrid|remote|on[- ]site|days? in (?:the )?office)\b/i.test(line)), possiblyTruncated: expansionMarker(result.aboutTheJob)};
    const people = result.peopleYouCanReachOutTo;
    if (!result.hiringTeamOrJobPoster.sectionFound && /\b(?:Meet the hiring team|Job poster)\b/i.test(people.sectionText)) {
      const start = people.sectionText.search(/Meet the hiring team/i);
      Object.assign(result.hiringTeamOrJobPoster, {sectionFound: true, sectionText: start >= 0 ? people.sectionText.slice(start) : people.sectionText, profiles: people.profiles});
      mark("hiringTeamOrJobPoster", "Hiring-team text inside people section");
    }
    result.hiringTeamOrJobPoster.identifiedJobPosters = result.hiringTeamOrJobPoster.profiles.filter(profile => /\bJob poster\b/i.test(profile.label)).map(profile => {
      const meaningful = linesOf(profile.label).filter(line => !/^[·•]?\s*\d+(?:st|nd|rd|th)?\+?$/i.test(line) && !/^(Job poster|Message|Connect|Follow|View profile)$/i.test(line));
      return {fullName: meaningful[0] || "", headline: meaningful.slice(1).join(" "), linkedinUrl: profile.linkedinUrl, identification: 'Explicit "Job poster" label', rawText: profile.label};
    });
    if (!result.advertiser.linkedinUrl && result.advertiser.name) {
      const anchor = [...document.querySelectorAll('main a[href*="/company/"]')].find(node => !ownElement(node) && clean(text(node)).toLowerCase() === clean(result.advertiser.name).toLowerCase());
      if (anchor) {result.advertiser.linkedinUrl = absoluteUrl(anchor.getAttribute("href")); mark("advertiser.linkedinUrl", "Exact-text company link");}
    }
    const warnings = result.diagnostics.warnings;
    if (!result.jobTitle) warnings.push("Job title was not found.");
    if (!result.advertiser.name) warnings.push("Advertising company was not found.");
    if (!result.location.raw) warnings.push("Location was not found.");
    if (!result.aboutTheJob) warnings.push("About the job was not found.");
    if (!people.sectionFound) warnings.push('"People you can reach out to" was not found in the loaded page.');
    if (!result.hiringTeamOrJobPoster.sectionFound) warnings.push("An explicit hiring-team/job-poster section was not found.");
    if (result.location.workplaceTypes.length > 1) warnings.push("Multiple workplace terms were found; review raw text.");
    if (result.descriptionDetails.possiblyTruncated) warnings.push("The job description contains an expansion marker; completeness is not confirmed. Expand manually and extract again if needed.");
    result.aboutTheCompany.possiblyTruncated = expansionMarker(result.aboutTheCompany.sectionText);
    if (result.aboutTheCompany.possiblyTruncated) warnings.push('The company section contains an expansion marker; completeness is not confirmed. Expand manually and extract again if needed.');
    result.diagnostics.fallbackSources = sources;
    return result;
  }
  function readable(result) {
    const profiles = entries => entries.length ? entries.map(item => `- ${item.label || item.ariaLabel || "(unlabelled profile)"}\n  ${item.linkedinUrl}`).join("\n") : "(No profile links found)";
    return [
      "LINKEDIN JOB ADVERT — REVIEW", `Script: ${result.scriptVersion}`, `Extracted: ${result.extractedAt}`, "",
      `JOB ID: ${result.jobId}`, `URL: ${result.jobUrl}`, `JOB TITLE: ${result.jobTitle || "(Not found)"}`,
      `ADVERTISING COMPANY / AGENCY: ${result.advertiser.name || "(Not found)"}`, `COMPANY LINK: ${result.advertiser.linkedinUrl || "(Not found)"}`, "",
      "LOCATION", result.location.raw || "(Not found)", `Workplace: ${result.location.workplaceTypes.join(", ") || "(Not found)"}`, "",
      "SALARY", result.salary.advertised || "(Not found in header)", "", "DESCRIPTION SALARY MENTIONS", ...result.salary.descriptionMentions, "",
      `EMPLOYMENT TYPE: ${result.employmentType || "(Not found)"}`, `APPLICATION STATUS: ${result.applicationStatus || "(Not found)"}`, "",
      "DESCRIPTION OPENING LINE", result.descriptionDetails.openingLine || "(Not found)", "", "DESCRIPTION LOCATION / WORKING PATTERN", ...result.descriptionDetails.locationAndWorkingPattern, "",
      "TOP-CARD DETAILS", result.location.primaryDetailsRaw || "(Not found)", ...result.location.jobPreferencesRaw, "",
      "PEOPLE YOU CAN REACH OUT TO", result.peopleYouCanReachOutTo.sectionText || "(Section not found)", "", profiles(result.peopleYouCanReachOutTo.profiles), "",
      "HIRING TEAM / JOB POSTER", result.hiringTeamOrJobPoster.sectionText || "(Section not found)", "", profiles(result.hiringTeamOrJobPoster.profiles), "",
      "IDENTIFIED JOB POSTER", JSON.stringify(result.hiringTeamOrJobPoster.identifiedJobPosters, null, 2), "",
      "ABOUT THE JOB", result.aboutTheJob || "(Not found)", "",
      "ABOUT THE COMPANY — SEPARATE SECTION", result.aboutTheCompany.sectionText || "(Section not found)", "",
      "WARNINGS", result.diagnostics.warnings.length ? result.diagnostics.warnings.map(value => `- ${value}`).join("\n") : "(No extraction warnings)", "",
      "MATCHED SELECTORS", JSON.stringify(result.diagnostics.matchedSelectors, null, 2), "",
      "TEXT FALLBACK SOURCES", JSON.stringify(result.diagnostics.fallbackSources, null, 2), "",
      "EXPANSION REPORT", JSON.stringify(result.diagnostics.expansionReport, null, 2)
    ].join("\n");
  }

  const JOB_IMPORT_URL='http://127.0.0.1:3000/api/job-imports';
  function configureImportKey(){const v=window.prompt('Paste the private LOCAL job-reader key, NOT a Gmail/Perplexity credential.',GM_getValue('job-import-key',''));if(v===null)return false;const key=v.trim();if(!/^[a-f0-9]{64}$/i.test(key)){window.alert('Expected the 64-character reader key.');return false;}GM_setValue('job-import-key',key);return true;}
  function buildJobImportPayload(r,includePosters=true){const modes=r.location.workplaceTypes,mode=modes.length===1?({'hybrid':'hybrid','remote':'remote','on-site':'onsite','on site':'onsite'})[modes[0].toLowerCase()]||'unknown':'unknown';const patterns=String(r.aboutTheJob||'').split(/\r?\n/).map(v=>v.trim()).filter(v=>/\b(?:\d+|one|two|three|four|five)\s*days?\s*(?:(?:per|a)\s*week)?\s*(?:in(?:\s+the)?\s+office|office|on[- ]site)\b/i.test(v)).sort((a,b)=>Number(/per week|a week/i.test(b))-Number(/per week|a week/i.test(a)));return {schemaVersion:1,source:'linkedin',requestId:crypto.randomUUID(),jobId:r.jobId,jobAdvertLink:r.jobUrl,jobTitle:r.jobTitle,jobDescriptionText:r.aboutTheJob,advertiser:{name:r.advertiser.name,linkedinUrl:r.advertiser.linkedinUrl},location:{text:r.location.raw,workplaceType:mode,workingPatternText:patterns[0]||''},jobPosters:includePosters?(r.hiringTeamOrJobPoster.identifiedJobPosters||[]).filter(p=>p.identification==='Explicit "Job poster" label').map(p=>({fullName:p.fullName,headline:p.headline,linkedinUrl:p.linkedinUrl,identification:'explicit-job-poster-label'})):[],extraction:{readerVersion:'0.4.0',extractedAt:r.extractedAt,descriptionStatus:r.descriptionDetails.possiblyTruncated?'possibly-truncated':'unknown'}};}
  function sendJobImport(p,key){return new Promise((resolve,reject)=>GM_xmlhttpRequest({method:'POST',url:JOB_IMPORT_URL,headers:{'Content-Type':'application/json','X-Job-Import-Token':key},data:JSON.stringify(p),timeout:15000,onload:r=>{let d;try{d=JSON.parse(r.responseText);}catch{reject(new Error('Invalid server JSON. Reviewed extraction retained; retry same payload.'));return;}if(r.status<200||r.status>=300||d.ok!==true||d.stored!==true||!d.importId||!Number.isInteger(d.revision)){reject(new Error(d.error||'No confirmed storage receipt.'));return;}resolve(d);},onerror:()=>reject(new Error('Local server unavailable or local request blocked. Extraction retained.')),ontimeout:()=>reject(new Error('Timeout. Extraction retained; same-payload retry is idempotent.'))}));}

  function showPanel(result) {
    document.getElementById(PANEL_ID)?.remove();
    const panel = document.createElement("div"); panel.id = PANEL_ID;
    Object.assign(panel.style, {position: "fixed", inset: "5vh 3vw 5vh auto", width: "min(850px, 94vw)", zIndex: "2147483647", background: "#fff", color: "#111827", border: "3px solid #16a34a", borderRadius: "16px", boxShadow: "0 12px 45px #0006", display: "flex", flexDirection: "column", padding: "14px", boxSizing: "border-box", font: "14px system-ui, sans-serif"});
    const toolbar = document.createElement("div");
    Object.assign(toolbar.style, {display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginBottom: "10px"});
    const title = document.createElement("span"); title.textContent = `Job ${result.jobId} — extraction review`; title.style.fontWeight = "700"; title.style.marginRight = "auto"; toolbar.append(title);
    const output = document.createElement("textarea"); output.readOnly = true; output.spellcheck = false; output.value = readable(result);
    Object.assign(output.style, {flex: "1", minHeight: "0", width: "100%", resize: "none", boxSizing: "border-box", background: "#f8fafc", color: "#111827", border: "1px solid #cbd5e1", padding: "12px", font: "13px/1.5 monospace"});
    function action(label, handler) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      Object.assign(button.style, {padding: "7px 10px", cursor: "pointer", color: "#111827", background: "#f1f5f9", border: "1px solid #94a3b8", borderRadius: "12px"});
      button.addEventListener("click", handler); toolbar.append(button);
    }
    action("Readable view", () => {output.value = readable(result);});
    action("JSON view", () => {output.value = JSON.stringify(result, null, 2);});
    action("Copy shown text", () => GM_setClipboard(output.value, "text"));
    const receipt=document.createElement('p');receipt.setAttribute('role','status');const label=document.createElement('label'),include=document.createElement('input');include.type='checkbox';include.checked=true;label.append(include,document.createTextNode(' Include explicitly labelled posters in import preview (no contact/email action yet)'));toolbar.appendChild(label);let sending=false,pending=null;include.addEventListener('change',()=>pending=null);
    action('Configure import key',configureImportKey);
    action('Send to application',async()=>{if(sending)return;if(location.pathname.match(JOB_PATH)?.[1]!==result.jobId){receipt.textContent='Page changed. Extract intended job again.';return;}let key=GM_getValue('job-import-key','');if(!key){if(!configureImportKey())return;key=GM_getValue('job-import-key','');}pending=pending||buildJobImportPayload(result,include.checked);if(!window.confirm('Send reviewed job '+result.jobId+' and '+pending.jobPosters.length+' explicit poster(s) to LOCAL application? Diagnostics/main-page snapshot are excluded; no generation, research or email action runs.'))return;sending=true;include.disabled=true;receipt.textContent='Sending reviewed import…';try{const r=await sendJobImport(pending,key);receipt.textContent='Stored import '+r.importId+', revision '+r.revision+(r.duplicate?' (already stored)':'')+'. Return to the app, paste advert URL and Load imported job.';}catch(e){receipt.textContent=e.message;}finally{sending=false;include.disabled=false;}});
    panel.appendChild(receipt);
    action("Extract again", runExtraction);
    action("Close", () => panel.remove());
    panel.append(toolbar, output); document.body.append(panel);
  }
  async function runExtraction() {
    if (busy || !supported()) return;
    busy = true;
    const button = document.getElementById(BUTTON_ID);
    if (button) {button.disabled = true; button.textContent = "Reading…"; button.style.opacity = "0.75";}
    const startUrl = location.href;
    try {
      const report = await expandSections();
      if (location.href !== startUrl || !supported()) throw new Error("The page changed. Click Extract on the intended job.");
      const result = applyTextFallbacks(extract(report));
      console.group(`[LinkedIn Job Reader] ${result.jobId}`); console.log("Extracted job:", result); console.table(result.diagnostics.matchedSelectors); console.log("Fallback sources:", result.diagnostics.fallbackSources); console.log("Warnings:", result.diagnostics.warnings); console.groupEnd();
      showPanel(result);
    } catch (error) {console.error("[LinkedIn Job Reader]", error); window.alert(`Job extraction failed: ${error.message}`);}
    finally {busy = false; if (button) {button.disabled = false; button.textContent = "Extract LinkedIn job"; button.style.opacity = "1";}}
  }
  function syncButton() {
    if (!supported()) {document.getElementById(BUTTON_ID)?.remove(); document.getElementById(PANEL_ID)?.remove(); return;}
    if (!document.body || document.getElementById(BUTTON_ID)) return;
    const button = document.createElement("button"); button.id = BUTTON_ID; button.type = "button"; button.textContent = "Extract LinkedIn job";
    button.title = "Read the current job advert into a local review panel";
    Object.assign(button.style, {position: "fixed", left: "0px", bottom: "16px", top: "auto", transform: "none", zIndex: "2147483646", padding: "13px 19px", border: "2px solid #14532d", borderRadius: "999px", background: "#16a34a", color: "#ffffff", font: "700 14px system-ui, sans-serif", lineHeight: "1.4", cursor: "pointer", boxShadow: "0 4px 12px #0004", maxWidth: "90vw"});
    button.addEventListener("mouseenter", () => {button.style.background = "#15803d";});
    button.addEventListener("mouseleave", () => {button.style.background = "#16a34a";});
    button.addEventListener("click", runExtraction); document.body.append(button);
  }
  setInterval(() => {
    if (location.href !== previousUrl) {previousUrl = location.href; document.getElementById(PANEL_ID)?.remove();}
    syncButton();
  }, 800);
  window.addEventListener("popstate", syncButton);
  syncButton();
})();
