// ==UserScript==
// @name         New Modular Product - Clean LinkedIn Contact Bridge (auto-import experiment)
// @namespace    local.new-modular-product
// @version      0.7.1
// @description  EXPERIMENT. As v0.6.1, plus: tabs opened by the app's search-tab buttons import their visible contacts automatically into the app that opened them. Reads one page only: no scrolling, paging or clicking on LinkedIn. Disable v0.6.1 while this is enabled.
// @match        https://www.linkedin.com/company/*/people/*
// @match        https://www.linkedin.com/search/results/people/*
// @match        http://127.0.0.1:3000/*
// @match        http://127.0.0.1:3100/*
// @match        http://localhost:3000/*
// @match        http://localhost:3100/*
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  "use strict";
  // On the local app: copy the domain saved with "Save domain" into this script's storage, then stop.
  const DOMAIN_KEY="nmp.lastSavedEmailDomain";
  // Tabs opened from the app's search-tab buttons, remembered briefly so only those tabs import automatically.
  const PENDING_KEY="pendingAutoTabs",PENDING_TTL_MS=3*60*1000;
  const VERSION="0.7.1";
  const HOSTNAME=String(window.__nmpTestHostname||location.hostname);
  console.info(`[NMP contact bridge ${VERSION}] running on ${HOSTNAME}${location.pathname}`);
  // A short visible message, so you can see the script is running and what it will do.
  function toast(text){
    document.getElementById("nmp-bridge-toast")?.remove();
    const t=document.createElement("div");t.id="nmp-bridge-toast";t.setAttribute("role","status");t.textContent=text;
    Object.assign(t.style,{position:"fixed",right:"16px",bottom:"16px",zIndex:"2147483647",maxWidth:"420px",background:"#111827",color:"#fff",padding:"10px 14px",borderRadius:"10px",font:"13px/1.4 system-ui,sans-serif",boxShadow:"0 6px 20px #0005"});
    document.body.appendChild(t);setTimeout(()=>t.remove(),Number(window.__nmpToastMs)||8000);
  }
  if(/^(?:127\.0\.0\.1|localhost)$/.test(HOSTNAME)){
    document.addEventListener("click",event=>{
      const button=event.target?.closest?.("[data-open-search-tabs]");if(!button)return;
      let urls=[];try{urls=JSON.parse(button.dataset.openSearchTabs||"[]").filter(u=>typeof u==="string"&&/^https:\/\/www\.linkedin\.com\//.test(u)).slice(0,12);}catch{urls=[];}
      if(!urls.length)return;
      const previous=GM_getValue(PENDING_KEY,null),fresh=previous&&Date.now()-previous.createdAt<PENDING_TTL_MS&&previous.origin===location.origin?previous.entries:[];
      const entries=[...fresh.filter(e=>!urls.includes(e.url)),...urls.map(url=>({url,used:false}))].slice(-24);
      GM_setValue(PENDING_KEY,{origin:location.origin,createdAt:Date.now(),entries});
      const auto=GM_getValue("autoImport",true)!==false;
      toast(auto?`Contact bridge ${VERSION}: the ${urls.length} LinkedIn tab(s) just opened will import their contacts into this app (${location.port}) automatically, for the next 3 minutes.`
        :`Contact bridge ${VERSION}: automatic import is switched off, so use the Import button on each LinkedIn tab.`);
    },true);
    const sync=()=>{try{const v=JSON.parse(localStorage.getItem(DOMAIN_KEY)||"null");if(v&&typeof v.domain==="string"&&v.domain.trim())GM_setValue("emailDomain",{domain:v.domain.trim().toLowerCase(),organisation:String(v.organisation||""),savedAt:String(v.savedAt||""),port:location.port});}catch{}};
    sync();document.addEventListener("nmp-email-domain-saved",sync);window.addEventListener("storage",event=>{if(event.key===DOMAIN_KEY)sync();});
    return;
  }
  const BUTTON_ID = "clean-linkedin-contact-import";
  const PANEL_ID = "clean-linkedin-contact-import-results";
  const API_PATH = "/api/recruiters/import";
  const TARGETS = Object.freeze([
    Object.freeze({id:"production",label:"Production (3100)",origin:"http://127.0.0.1:3100"}),
    Object.freeze({id:"development",label:"Development (3000)",origin:"http://127.0.0.1:3000"})
  ]);
  let importing = false, previousUrl = location.href, lastDomainSource = "";
  // Automatic import (experiment): on by default in this version; the panel has a switch.
  const autoEnabled=()=>GM_getValue("autoImport",true)!==false;
  const pageKind=url=>/^\/company\/[^/]+\/people(?:\/|$)/.test(url.pathname)?"company":/^\/search\/results\/people(?:\/|$)/.test(url.pathname)?"search":"";
  const searchKey=url=>({kind:pageKind(url),keywords:String(url.searchParams.get("keywords")||"").trim().toLowerCase(),company:String(url.searchParams.get("currentCompany")||"").replace(/[^0-9,]/g,""),path:url.pathname.replace(/\/+$/,"").toLowerCase()});
  // Finds (and marks as used) the pending entry for this tab. LinkedIn may add tracking parameters or swap a company id
  // for its name in the path, so entries match on page kind and search words, and on the path when it is unchanged.
  function claimPendingTab(href=location.href){
    const pending=GM_getValue(PENDING_KEY,null);
    if(!pending||!Array.isArray(pending.entries)||Date.now()-pending.createdAt>PENDING_TTL_MS)return null;
    let here;try{here=searchKey(new URL(href));}catch{return null;}
    if(!here.kind)return null;
    const same=(e,strict)=>{let k;try{k=searchKey(new URL(e.url));}catch{return false;}return k.kind===here.kind&&k.keywords===here.keywords&&(here.kind==="search"?(!k.company||!here.company||k.company===here.company):true)&&(!strict||k.path===here.path);};
    const index=pending.entries.findIndex(e=>!e.used&&same(e,true));const chosen=index>=0?index:pending.entries.findIndex(e=>!e.used&&same(e,false));
    if(chosen<0)return null;
    pending.entries[chosen]={...pending.entries[chosen],used:true};GM_setValue(PENDING_KEY,pending);
    const target=TARGETS.find(t=>new URL(t.origin).port===new URL(pending.origin).port);
    return target?{target,url:pending.entries[chosen].url}:null;
  }
  const roleKeywords = ["talent acquisition","talent","recruiter","recruitment","chief people","people officer","head","director","manager","partner","human resources","hr"];
  const clean = value => String(value || "")
    .replace(/\u00c2\u00b7/g,"·").replace(/\u00c2\u00a3/g,"£")
    .replace(/\u00e2\u0080\u0099/g,"'").replace(/\u00e2\u0080\u0093/g,"-")
    .replace(/\u00e2\u0080\u0094/g,"-").replace(/\s+/g," ").trim();
  function removeRepeatedName(value) {
    const parts=clean(value).split(/\s+/).filter(Boolean),half=Math.floor(parts.length/2);
    if(half>=2 && parts.slice(0,half).join(" ").toLowerCase()===parts.slice(half).join(" ").toLowerCase())return parts.slice(0,half).join(" ");
    return clean(value);
  }
  function splitName(name) {
    const parts=clean(name).split(/\s+/).filter(Boolean);
    return {firstName:parts[0] || "",lastName:parts.slice(1).join(" ") || ""};
  }
  function profileNameFromAnchor(anchor) {
    const rawValues=[anchor.getAttribute("aria-label"),anchor.querySelector("span")?.textContent,anchor.textContent];
    for(const raw of rawValues){
      const original=clean(raw);if(!original)continue;
      const value=original.replace(/^view\s+/i,"").replace(/\s+profile$/i,"")
        .replace(/\s*[·•|]\s*(?:\d+(?:st|nd|rd|th)?|\d+\+|connection|connections?|followers?|following).*$/i,"")
        .replace(/\s+\d+(?:st|nd|rd|th)?\s*$/i,"").trim();
      if(!value || /^(see open roles|open roles|view profile|profile)$/i.test(value))continue;
      const normalised=removeRepeatedName(value),parts=normalised.split(/\s+/).filter(Boolean);
      if(parts.length>=2 && parts.length<=5 && parts.every(part=>/^[A-Za-zÀ-ÖØ-öø-ÿ.'-]+$/.test(part)) && !/\b(at|and|for|of|in|united|kingdom|area)\b/i.test(normalised))return normalised;
    }
    return "";
  }
  function getProfileCard(anchor) {
    const candidates=[anchor.closest("li"),anchor.closest("article"),anchor.parentElement?.parentElement,anchor.parentElement?.parentElement?.parentElement].filter(Boolean);
    return candidates.find(node=>{
      const cardText=clean(node.innerText || node.textContent),profileLinks=node.querySelectorAll('a[href*="/in/"]').length;
      return profileLinks===1 && cardText.length>=10 && cardText.length<=1800 && !/^.*is a mutual connection$/i.test(cardText);
    }) || null;
  }
  function extractRole(card,profileName) {
    const raw=String(card?.innerText || "");if(!raw)return "";
    const nameTokens=profileName.toLowerCase().split(/\s+/).filter(Boolean);
    const lines=raw.split(/\r?\n/).map(line=>clean(line)
      .replace(/^[·•|]\s*/,"").replace(/\b\d+(st|nd|rd|th)\b/gi,"")
      .replace(/\b\d+\s+(other\s+)?mutual connections?\b.*$/i,"")
      .replace(/\b(?:and|is)\s+a\s+mutual connection\b.*$/i,"")
      .replace(/\b(?:connect|message|follow)\b.*$/i,"").trim())
      .filter(Boolean).filter(line=>{
        const lower=line.toLowerCase();if(lower===profileName.toLowerCase())return false;
        if(nameTokens.length>=2 && nameTokens.every(token=>lower.includes(token)))return false;
        if(/^(2nd|3rd|3rd\+|view full profile)$/i.test(line))return false;
        if(/\b(?:united kingdom|england|scotland|wales|ireland)\b/i.test(line))return false;
        if(/\bmutual connection\b/i.test(line))return false;
        return line.length>=3 && line.length<=220;
      });
    const role=lines.find(line=>roleKeywords.some(keyword=>line.toLowerCase().includes(keyword)));
    if(role)return role.replace(/\s+(Jess|Raj|Ryan|Andy|David|Swetha|Emma)\s*$/i,"").replace(/\s+(United Kingdom|England|Scotland|Wales)$/i,"").trim();
    return lines.find(line=>/\b(at|@|manager|director|engineer|officer|lead|architect|consultant|analyst)\b/i.test(line)) || "";
  }
  function validImportDomain(value) {
    const domain=String(value || "").trim().toLowerCase(),labels=domain.split(".");
    const blocked=["linkedin.com","gmail.com","googlemail.com","outlook.com","hotmail.com","yahoo.com","icloud.com","example.com","example.org","example.net"];
    if(domain.length>253 || labels.length<2 || !labels.every(label=>label.length<=63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) || !/^[a-z]{2,63}$/.test(labels.at(-1)) || blocked.some(value=>domain===value || domain.endsWith(`.${value}`)))throw new Error("Enter a valid business domain. Nothing was imported.");
    return domain;
  }
  function storedImportDomain() {
    const v=GM_getValue("emailDomain",null);
    if(!v||typeof v.domain!=="string"||!v.domain.trim())return null;
    try{return {domain:validImportDomain(v.domain),organisation:v.organisation||"",savedAt:v.savedAt||""};}catch{return null;}
  }
  function requestImportDomain(askAlways=false) {
    const stored=askAlways?null:storedImportDomain();
    if(stored){lastDomainSource=`saved in the app${stored.organisation?" for "+stored.organisation:""}${stored.savedAt?" at "+new Date(stored.savedAt).toLocaleString():""}`;return stored.domain;}
    const supplied=window.prompt("Enter the organisation email domain for this import.\nUse a domain only, not a URL or email address.\nIt is remembered until you save another domain in the app or enter a new one here.",storedImportDomain()?.domain||"");
    if(supplied===null)return null;
    const domain=validImportDomain(supplied);GM_setValue("emailDomain",{domain,organisation:"",savedAt:new Date().toISOString(),port:"prompt"});lastDomainSource="entered here";return domain;
  }
  function extractProfiles(emailDomain) {
    const contacts=[],seen=new Set(),allAnchors=document.querySelectorAll('a[href*="/in/"]');
    for(const anchor of allAnchors){
      const linkedinUrl=anchor.href.split("?")[0];
      if(seen.has(linkedinUrl) || /\/opportunities\//i.test(linkedinUrl))continue;
      const profileName=profileNameFromAnchor(anchor);if(!profileName)continue;
      const card=getProfileCard(anchor);if(!card)continue;
      const {firstName,lastName}=splitName(profileName),role=extractRole(card,profileName);
      if(!firstName || !lastName || !role)continue;
      seen.add(linkedinUrl);
      contacts.push({firstName,lastName,fullName:`${firstName} ${lastName}`,role,location:"",linkedinUrl,emailDomain,source:"linkedin-visible",verified:false});
    }
    console.info("[Clean LinkedIn Bridge] Profile anchors:",allAnchors.length,"; accepted contacts:",contacts.length);
    return contacts;
  }
  function validateContacts(contacts) {
    if(!contacts.length)throw new Error("No clean LinkedIn contacts found.");
    const invalid=contacts.filter(contact=>!contact.firstName || !contact.lastName || !contact.role || contact.lastName.split(/\s+/).length>6 || /open roles|mutual connection/i.test(`${contact.lastName} ${contact.role}`));
    if(invalid.length)throw new Error(`${invalid.length} contacts failed validation. Nothing was imported.`);
  }
  function selectedTargets(mode) {
    if(mode==="both")return [...TARGETS];
    const target=TARGETS.find(target=>target.id===mode);return target ? [target] : [];
  }
  function createTransaction(contacts,emailDomain,sourceUrl) {
    validateContacts(contacts);emailDomain=validImportDomain(emailDomain);
    const payload={sourceUrl,emailDomain,recruiters:contacts};
    return {json:JSON.stringify(payload),contactCount:contacts.length,emailDomain,sourceUrl,results:new Map()};
  }
  function failure(message,kind="unconfirmed") {
    const error=new Error(message);error.importKind=kind;return error;
  }
  function importContacts(transaction,target) {
    return new Promise((resolve,reject)=>{
      let finished=false,handle,timer;
      const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);error ? reject(error) : resolve(result);};
      timer=setTimeout(()=>{finish(failure("No receipt before the deadline. The server may already have stored the contacts."));try{handle?.abort();}catch{}},13000);
      try {
        handle=GM_xmlhttpRequest({
          method:"POST",url:target.origin+API_PATH,anonymous:true,redirect:"error",
          headers:{"Content-Type":"application/json"},data:transaction.json,timeout:12000,
          onload(response){
            if(response.finalUrl){
              try{const final=new URL(response.finalUrl);if(final.origin!==target.origin || final.pathname!==API_PATH){finish(failure("Unexpected response destination. No confirmation accepted."));return;}}
              catch{finish(failure("Invalid response destination. No confirmation accepted."));return;}
            }
            let result;try{result=JSON.parse(response.responseText);}catch{finish(failure("Invalid server JSON. No confirmed import receipt."));return;}
            if(!result || typeof result!=="object" || Array.isArray(result)){finish(failure("Invalid receipt format. No import confirmation accepted."));return;}
            if(response.status<200 || response.status>=300 || result.ok!==true){
              const detail=typeof result.error==="string"?result.error.replace(/[\u0000-\u001f]/g," ").slice(0,240):"Import was not confirmed.";
              const kind=[400,401,403,404,405,409,413,415].includes(response.status)?"rejected":"unconfirmed";
              finish(failure(`HTTP ${response.status}: ${detail}`,kind));return;
            }
            if(!Number.isInteger(result.imported) || result.imported<0 || !Number.isInteger(result.duplicates) || result.duplicates<0 || result.imported+result.duplicates!==transaction.contactCount){
              finish(failure("Server receipt does not account for all submitted contacts. Do not assume the import failed or resend a confirmed destination."));return;
            }
            finish(null,{imported:result.imported,duplicates:result.duplicates});
          },
          onerror(){finish(failure("Server unavailable, request blocked, or redirect refused. No confirmed receipt."));},
          ontimeout(){finish(failure("Request timed out. Contacts may already be stored; check this server before retrying."));},
          onabort(){finish(failure("Request aborted. Storage outcome is unconfirmed."));}
        });
      }catch{finish(failure("The local request could not start. Check Tampermonkey connection permissions.","not-sent"));}
    });
  }
  async function deliverContacts(transaction,targets,onUpdate=()=>{}) {
    await Promise.all(targets.map(async target=>{
      if(transaction.results.get(target.id)?.kind==="confirmed")return;
      transaction.results.set(target.id,{kind:"sending",message:"Waiting for import receipt…"});onUpdate();
      try{const receipt=await importContacts(transaction,target);transaction.results.set(target.id,{kind:"confirmed",...receipt});}
      catch(error){transaction.results.set(target.id,{kind:error.importKind || "unconfirmed",message:error.message});}
      onUpdate();
    }));
  }
  function pageIsSupported() {
    return /^\/company\/[^/]+\/people(?:\/|$)/.test(location.pathname) || /^\/search\/results\/people(?:\/|$)/.test(location.pathname);
  }
  function showReview(transaction,contacts,options={}) {
    document.getElementById(PANEL_ID)?.remove();
    const panel=document.createElement("section");panel.id=PANEL_ID;panel.setAttribute("aria-label","LinkedIn contact import review");
    Object.assign(panel.style,{position:"fixed",right:"3vw",top:"7vh",maxHeight:"86vh",width:"min(800px,94vw)",overflowY:"auto",zIndex:"2147483647",background:"#fff",color:"#111827",border:"3px solid #b45309",borderRadius:"14px",padding:"16px",boxSizing:"border-box",boxShadow:"0 12px 45px #0006",font:"14px/1.5 system-ui,sans-serif"});
    const title=document.createElement("h2");title.textContent=options.autoTarget?`Automatic import: ${contacts.length} clean LinkedIn contact(s) to ${options.autoTarget.label}`:`Review ${contacts.length} clean LinkedIn contact(s)`;title.style.margin="0 0 8px";
    const info=document.createElement("p");info.textContent=`Business domain: ${transaction.emailDomain}${lastDomainSource?" ("+lastDomainSource+")":""}. Each selected server receives its own copy. Contacts remain unverified; this does not link an application, create a draft, or send email.`;
    const source=document.createElement("p");source.textContent="Source: "+transaction.sourceUrl;source.style.overflowWrap="anywhere";
    const details=document.createElement("details"),summary=document.createElement("summary"),list=document.createElement("pre");summary.textContent="Review extracted names and roles";
    list.textContent=contacts.map(contact=>`${contact.fullName} — ${contact.role}\n${contact.linkedinUrl}`).join("\n\n");Object.assign(list.style,{whiteSpace:"pre-wrap",maxHeight:"25vh",overflowY:"auto",overflowWrap:"anywhere"});details.append(summary,list);
    const toolbar=document.createElement("div");Object.assign(toolbar.style,{display:"flex",flexWrap:"wrap",gap:"8px",alignItems:"center",margin:"12px 0"});
    const destination=document.createElement("select");destination.setAttribute("aria-label","Contact import destinations");
    for(const [value,label] of [["both","Both — Production 3100 + Development 3000"],["production","Production only — 3100"],["development","Development only — 3000"]]){
      const option=document.createElement("option");option.value=value;option.textContent=label;destination.appendChild(option);
    }
    const savedDestination=GM_getValue("destination","both");destination.value=["both","production","development"].includes(savedDestination)?savedDestination:"both";destination.addEventListener("change",()=>GM_setValue("destination",destination.value));toolbar.appendChild(destination);
    const status=document.createElement("pre");status.setAttribute("role","status");status.setAttribute("aria-live","polite");Object.assign(status.style,{whiteSpace:"pre-wrap",overflowWrap:"anywhere",background:"#fffbeb",padding:"10px",font:"13px/1.5 system-ui,sans-serif"});
    const buttons=[];
    function action(label,handler){const b=document.createElement("button");b.type="button";b.textContent=label;Object.assign(b.style,{padding:"8px 12px",border:"1px solid #b45309",borderRadius:"8px",background:"#fff7d6",color:"#111827",cursor:"pointer"});b.addEventListener("click",handler);toolbar.appendChild(b);buttons.push(b);return b;}
    function render(){
      const selected=new Set(selectedTargets(destination.value).map(target=>target.id)),lines=[];
      for(const target of TARGETS){
        const state=transaction.results.get(target.id);
        if(state?.kind==="confirmed")lines.push(`${target.label}: CONFIRMED — ${state.imported} imported, ${state.duplicates} duplicates/existing contacts. Will not be resent from this review.`);
        else if(state)lines.push(`${target.label}: ${state.kind.toUpperCase()} — ${state.message}`);
        else lines.push(`${target.label}: ${selected.has(target.id)?"selected; not sent":"not selected"}.`);
      }
      lines.push("No background retries. Keep this panel open to retry only destinations without a confirmed receipt.");
      lines.push("A timeout does not prove nothing was stored. This contact endpoint has no request-ID receipt; a retry can merge existing contacts and refresh import timestamps.");
      status.textContent=lines.join("\n");
    }
    destination.addEventListener("change",render);
    action("Send / retry selected destinations",async()=>{
      if(importing)return;
      if(location.href!==transaction.sourceUrl || !pageIsSupported()){status.textContent="The LinkedIn page changed. Extract the intended contacts again before sending.";return;}
      const targets=selectedTargets(destination.value).filter(target=>transaction.results.get(target.id)?.kind!=="confirmed");
      if(!targets.length){render();return;}
      const uncertain=targets.some(target=>transaction.results.get(target.id)?.kind==="unconfirmed");
      const warning=uncertain?"\nAn earlier request has an unknown outcome. A retry may merge existing contacts and refresh import timestamps. Check that server first if unsure.":"";
      // No dialog: the review panel is the check. Say what is being sent, then send straight away.
      status.textContent=`Sending ${transaction.contactCount} reviewed contact(s) using ${transaction.emailDomain} to:\n${targets.map(target=>target.label+" — "+target.origin).join("\n")}\nPreviously confirmed destinations are not resent. No application linking, research, draft creation or email sending is requested.${warning}`;
      importing=true;destination.disabled=true;buttons.forEach(button=>button.disabled=true);
      const main=document.getElementById(BUTTON_ID);if(main){main.disabled=true;main.textContent="Importing to selected servers…";}
      try{await deliverContacts(transaction,targets,render);}finally{
        importing=false;destination.disabled=false;buttons.forEach(button=>button.disabled=false);
        if(main){main.disabled=false;main.textContent="Import clean LinkedIn contacts";}render();
      }
    });
    const send=buttons[0];
    action("New extraction / domain",()=>beginImport(true));action("Close",()=>panel.remove());
    panel.append(title,info,source,details,toolbar,autoSwitch(),status);document.body.appendChild(panel);render();
    // Automatic import: send to the app that opened this tab only, without changing your saved destination choice.
    if(options.autoTarget){destination.value=options.autoTarget.id;render();send.click();}
  }
  function autoSwitch(){
    const label=document.createElement("label");Object.assign(label.style,{display:"block",margin:"4px 0 8px"});
    const box=document.createElement("input");box.type="checkbox";box.checked=autoEnabled();box.setAttribute("data-nmp-auto-switch","");
    box.addEventListener("change",()=>GM_setValue("autoImport",box.checked));
    label.append(box," Import automatically from tabs opened by the app's search buttons (experiment)");return label;
  }
  function notice(message){
    document.getElementById(PANEL_ID)?.remove();
    const panel=document.createElement("section");panel.id=PANEL_ID;panel.setAttribute("aria-label","LinkedIn contact import review");
    Object.assign(panel.style,{position:"fixed",right:"3vw",top:"7vh",width:"min(560px,94vw)",zIndex:"2147483647",background:"#fff",color:"#111827",border:"3px solid #b45309",borderRadius:"14px",padding:"14px",boxSizing:"border-box",boxShadow:"0 12px 45px #0006",font:"14px/1.5 system-ui,sans-serif"});
    const p=document.createElement("p");p.setAttribute("role","status");p.textContent=message;p.style.margin="0 0 8px";
    const close=document.createElement("button");close.type="button";close.textContent="Close";close.addEventListener("click",()=>panel.remove());
    panel.append(p,autoSwitch(),close);document.body.appendChild(panel);
  }
  // Waits for the results to finish loading (the contact count stops changing), counting only time the tab is visible,
  // because LinkedIn may not render a background tab. Reads the page as it is: no scrolling, paging or clicks.
  async function autoImport(claim){
    const stored=storedImportDomain();
    if(stored)notice(`Contact bridge ${VERSION}: automatic import to ${claim.target.label}. Waiting for this page's results to finish loading (only counted while this tab is visible)…`);
    if(!stored){notice("Automatic import skipped: no business domain is saved in the app yet. Save the domain on the application, or use the Import button.");return;}
    lastDomainSource=`saved in the app${stored.organisation?" for "+stored.organisation:""}`;
    let start=location.href;const limitMs=Number(window.__nmpAutoWaitMs)||25000,stepMs=Number(window.__nmpAutoStepMs)||1000;
    let visibleMs=0,last=-1,stable=0,contacts=[];
    while(visibleMs<limitMs){
      await new Promise(r=>setTimeout(r,stepMs));
      // LinkedIn may rewrite the address while loading (company id to name); stop only if you left the People page.
      if(location.href!==start){if(!pageIsSupported())return;start=location.href;stable=0;last=-1;}
      if(document.visibilityState==="visible")visibleMs+=stepMs;
      contacts=extractProfiles(stored.domain);
      if(contacts.length&&contacts.length===last){if(++stable>=2)break;}else stable=0;
      last=contacts.length;
    }
    if(!contacts.length){notice("Automatic import found no clean contacts on this page. Use the Import button if there should be some.");return;}
    try{showReview(createTransaction(contacts,stored.domain,location.href),contacts,{autoTarget:claim.target});}
    catch(error){notice("Automatic import stopped: "+error.message+" Use the Import button to review them.");}
  }
  function beginImport(askDomain=false){
    if(importing)return;
    const main=document.getElementById(BUTTON_ID);if(main)main.disabled=true;
    try{
      if(!pageIsSupported())throw new Error("Open a LinkedIn company People page or people search results.");
      const emailDomain=requestImportDomain(askDomain===true);if(emailDomain===null)return;
      const contacts=extractProfiles(emailDomain);validateContacts(contacts);
      showReview(createTransaction(contacts,emailDomain,location.href),contacts);
    }catch(error){window.alert(error.message);}
    finally{if(main)main.disabled=false;}
  }
  function addButton(){
    if(!document.body || document.getElementById(BUTTON_ID))return;
    const button=document.createElement("button");button.id=BUTTON_ID;button.type="button";button.textContent="Import clean LinkedIn contacts";
    Object.assign(button.style,{position:"fixed",left:"0",top:"50%",transform:"translateY(-50%)",zIndex:"2147483646",padding:"14px 18px",border:"2px solid #b45309",borderRadius:"0 8px 8px 0",background:"#ffd400",color:"#111827",font:"700 14px sans-serif",cursor:"pointer",boxShadow:"0 4px 12px rgba(0,0,0,0.25)"});
    button.disabled=importing;button.addEventListener("click",()=>beginImport(false));document.body.appendChild(button);
  }
  function installWhenSupported(){
    if(pageIsSupported())addButton();
    else{document.getElementById(BUTTON_ID)?.remove();document.getElementById(PANEL_ID)?.remove();}
  }
  installWhenSupported();
  if(pageIsSupported()&&autoEnabled()){const claim=claimPendingTab();if(claim)autoImport(claim);}
  new MutationObserver(installWhenSupported).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener("popstate",installWhenSupported);
  window.addEventListener("locationchange",installWhenSupported);
  setInterval(()=>{if(location.href!==previousUrl){previousUrl=location.href;document.getElementById(PANEL_ID)?.remove();installWhenSupported();}},800);
})();
