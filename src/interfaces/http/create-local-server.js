import {createHistoryDashboardHandler} from './history-dashboard-http.js';
import {createFeatureTogglesHandler} from './feature-toggles-http.js';
import {createCoverReferenceLibrary} from '../../application/cover-reference-library.js';
import {createWritingReferenceHandler} from './writing-reference-http.js';
import {parseWritingReferenceSelection,resolveWritingReferences,writingReferenceRequest,writingReferenceAudit,writingReferenceCostProof,requireWritingReferenceCostApproval,assertWritingReferenceSnapshot} from '../../application/writing-reference-selection.js';
import {createCoverReferenceHandler} from './cover-reference-http.js';
function personalPolishingInstructions(values){const text=String(values.get('instructions')||'').replace(/\r\n?/g,'\n').trim();if(text.length>4000)throw Object.assign(new Error('Personal polishing instructions must not exceed 4000 characters.'),{statusCode:400,code:'POLISHING_INSTRUCTIONS_INVALID'});return text;}
import {createScenarioPolishingHandler} from './scenario-polishing-http.js';
import {resolveScenarioSelection,scenarioCostProof,requireScenarioCostApproval,approvedScenarioRequest} from '../../application/scenario-polishing.js';
import {createAssignmentEvidenceHandler} from './assignment-evidence-http.js';
import {inspectApplicationRole,requireConfirmedApplicationRole,confirmApplicationRole} from '../../application/application-role-review.js';
import {snapshotMessage} from '../../application/outreach-message-snapshot.js';
import {renderCoverLetterHtml} from './cover-letter-html.js';
import {createMaintenanceHandler} from './maintenance-http.js';
import {createUnsentLetterUpdateService} from '../../application/unsent-letter-update-service.js';
import {createGmailDraftUpdatePort} from '../../application/gmail-draft-update-port.js';

function confirmedRoleForRequest(review,values){const role=requireConfirmedApplicationRole(review.formData),posted=values.get('applicationRoleVersion');if((posted&&posted!==role.version)||(review.formData.applicationRoleConfirmation&&!posted))throw Object.assign(new Error('Application role choice changed or this page is stale. Reload and review before polishing.'),{statusCode:409,code:'APPLICATION_ROLE_CONFIRMATION_REQUIRED',roleReview:role});return role.applicationTitle;}
function polishingReviewWithRelationship(review,values){
 if(!values.has('advertiserRelationship'))return review;
 const value=String(values.get('advertiserRelationship')||'').trim();
 if(!['direct-employer','recruitment-intermediary','unknown'].includes(value))throw Object.assign(new Error('Choose a valid advertiser relationship.'),{statusCode:400});
 return {...review,formData:{...review.formData,advertiserRelationship:value,advertiserRelationshipChosen:true}};
}
import {createApplicationIntelligenceHttp} from './application-intelligence-http.js';
import {createCvDocumentHandler} from './cv-document-http.js';
import {lengthPolicy,normalizeLengthMode,assertLetterLength} from '../../domain/cover-letter/letter-quality-policy.js';
import {newApplicationPolishingModel} from '../../application/new-review-defaults.js';
import {createAchievementPreparationHandler} from './achievement-preparation-http.js';
import {createJobImportHandler} from './job-import-http.js';
import {importJobPosters} from '../../application/import-job-posters.js';
import {usesCandidateValues,contextMode} from '../../domain/cover-letter/advertiser-context.js';
import {createSavedApplicationDeleteHandler} from './saved-application-delete-http.js';
import {createOrganisationContactHandler} from './organisation-contact-http.js';
import {newlyImportedForReview} from '../../application/review-contact-freshness.js';
import { refinementAttemptLogFields } from '../../application/refinement-attempt-log.js';
import { buildPolishingApiRequest } from '../../infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
import { estimatePolishingApiRequest } from '../../application/polishing-cost-estimator.js';
import { normalizeLetterTone } from '../../application/cover-letter-controls.js';
import { POLISHING_MODELS, DEFAULT_POLISHING_MODEL, normalizePolishingModel, buildPolishingAttempt, retainSuccessfulProposal } from '../../application/polishing-model-catalog.js';
import { extractOutreachExperienceBody } from '../../application/compose-outreach-letter.js';
import { describeRefinementFailure, formatRefinementFailure } from '../../application/refinement-error-details.js';
import {createApplicationReviewHandler} from './application-review-http.js';
import { createOutreachHttpHandler } from './outreach-queue-http.js';
import { currentReviewSubject, normalizeSubject, reviewWithSavedSubject } from '../../application/review-subject.js';
import { createPerplexityClient } from "../../infrastructure/perplexity-client.js";
import { createEmailDomainResolutionService } from "../../application/email-domain-resolution-service.js";
import { normaliseBusinessDomain, adoptResearchedDomain } from "../../application/email-domain-policy.js";
import { createCvTailoringHandler } from "./cv-tailoring-http.js";
import { createSystemCheckHandler } from "./system-check-http.js";
import { createApplicationOutcomesHandler } from "./application-outcomes-http.js";
import { createApplicationQuestionsHandler } from "./application-questions-http.js";
import { createRecruiterReplyHandler } from "./recruiter-reply-http.js";
import { createLetterKeywordsHandler } from "./letter-keywords-http.js";
import { createLetterKeywordService } from "../../application/letter-keywords.js";
import { factLinesWithCertifications } from "../../domain/cv/cv-facts.js";
import { normaliseCertifications } from "../../domain/cv/owner-certifications.js";
import { createRecruiterReplyService } from "../../application/recruiter-reply.js";
import { readGmailReplies, gmailReplyReadingEnabled } from "../../application/gmail-reply-reader.js";
import { createGmailReplyDraft } from "../../application/gmail-reply-draft.js";
import { createApplicationQuestionsService } from "../../application/application-questions.js";
import { createInsightsHandler } from "./insights-http.js";
import { createLetterGateHandler } from "./letter-gate-http.js";
import { currentOutcome, outcomeLabel } from "../../domain/insights/application-outcome.js";
import { suggestAdvertiserRelationship, advertiserKey } from "../../domain/cover-letter/advertiser-relationship-evidence.js";
import { renderApplicationReview, renderRefinementPanel, renderOrganisationResearch, renderField, renderAdvertLink, getSelectableCompanyValues, renderResearchSource, renderOptionalDetail , renderApplicationForm, escapeHtml} from './rendering.js';
import { readFormBody } from './form-body.js';
import { sendText, sendHtml, sendJson } from './responses.js';
import { createServer } from 'node:http';
import { readFileSync as readShellFile } from 'node:fs';
import { attachShell } from './app-shell.js';
const APP_SHELL_CSS = readShellFile(new URL('./app-shell.css', import.meta.url), 'utf8');
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { acceptRefinedCoverLetter } from '../../application/accept-refined-cover-letter.js';
import { attachReviewPageListeners } from './review-page.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Application review storage is injected per server; no module-global review cache.

import { createDiagnosticWriter } from './diagnostics.js';

const debugEnabled = process.env.LOCAL_DEBUG === 'true';
const localDiagnosticsEnabled = debugEnabled;

const writeDiagnostic = createDiagnosticWriter({
  enabled: localDiagnosticsEnabled
  // Keep any other existing options exactly as they were
});

function splitValues(value = '', separator) {
  return String(value ?? '')
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeFormData(values) {
return {
  jobImportId:String(values.get('jobImportId')||'').trim(),
  jobImportRevision:Number(values.get('jobImportRevision')||0),
  importJobPosters:values.get('importJobPosters')==='true',
  jobLocation:String(values.get('jobLocation')||'').trim(),
  recruiterName:String(values.get('recruiterName')||'').trim(),
  advertiserRelationship:String(values.get('advertiserRelationship')||'').trim(),
  jobTitle: String(values.get('jobTitle') || '').trim(),
  organisationName: String(values.get('organisationName') || '').trim(),
  organisationUrl: String(values.get('organisationUrl') || '').trim(),
  stakeholderSource: String(
    values.get('stakeholderSource') || values.get('recruiterName') || ''
  ).trim(),
  jobAdvertLink: String(values.get('jobAdvertLink') || '').trim(),
  jobReference: String(values.get('jobReference') || '').trim(),
  preferredRoleCodes: splitValues(
    values.get('preferredRoleCodes'),
    ','
  ),
  professionalValues:String(values.get('professionalValues')||'').trim(),
  jobDescriptionText: String(
    values.get('jobDescriptionText') || ''
  ).trim(),
  cvHighlights: splitValues(values.get('cvHighlights'), /\r?\n/),
  achievementMode: values.get('achievementMode')==='selected',
  achievementCvRoleCode: String(values.get('achievementCvRoleCode')||'').trim(),
  achievementSourceHash: String(values.get('achievementSourceHash')||'').trim(),
  achievementIds: values.getAll('achievementIds').map(String)
};
}

function formValues(formData = {}) {
  return {
    ...formData,
    preferredRoleCodes: Array.isArray(formData.preferredRoleCodes)
      ? formData.preferredRoleCodes.join(', ')
      : String(formData.preferredRoleCodes || ''),
    cvHighlights: Array.isArray(formData.cvHighlights)
      ? formData.cvHighlights.join('\n')
      : String(formData.cvHighlights || '')
  };
}

function validationErrors(formData) {
  const errors = [];

  if(formData.recruiterName&&(formData.recruiterName.length>160||/[\r\n<>@{}\/:]/.test(formData.recruiterName)))errors.push('Recipient name must be a person name, not a URL or header.');
  if(formData.advertiserRelationship&&!['direct-employer','recruitment-intermediary','unknown'].includes(formData.advertiserRelationship))errors.push('Choose a valid advertiser relationship.');
  if((formData.professionalValues||'').length>2000)errors.push('Professional values must not exceed 2000 characters.');
  if (!formData.jobTitle) {
    errors.push('Job title is required.');
  }

  if (!formData.jobDescriptionText) {
    errors.push('Job description is required.');
  }

  return errors;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;
    });

    request.on("end", () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

export function markSameOrganisation(contacts,organisationId){
  const domain=String(organisationId||'').startsWith('domain:')?String(organisationId).slice(7):'';
  const same=c=>Boolean(organisationId)&&(c.organisationId===organisationId||(domain&&String(c.emailDomain||'').trim().toLowerCase()===domain));
  const marked=contacts.map(c=>({...c,sameOrganisation:same(c)}));
  return [...marked.filter(c=>c.sameOrganisation),...marked.filter(c=>!c.sameOrganisation)];
}

function deriveReviewOrganisationId(formData) {
  const savedDomain = String(formData.emailDomain || "")
    .trim()
    .toLowerCase();

  if (savedDomain) {
    return `domain:${savedDomain}`;
  }

  try {
    const url = new URL(formData.organisationUrl || "");
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    if (
      hostname === "linkedin.com" ||
      hostname.endsWith(".linkedin.com")
    ) {
      const company = url.pathname.match(/^\/company\/([^/]+)/i);
      return company
        ? `linkedin-company:${company[1].toLowerCase()}`
        : "organisation:unknown";
    }

    return hostname ? `domain:${hostname}` : "organisation:unknown";
  } catch {
    return "organisation:unknown";
  }
}


export function createLocalServer({
  prepareApplication = async () => {
    throw new Error('Application preparation is not configured.');
  },
  recruiterContactImportService = null,
  recruiterContactStore = null,
  outreachRepository = null,
  applicationReviewStore = null,
  gmailDraftUpdatePort = null,
  jobImportService = null,
  applicationPackExporter = null,
  applicationOutputFolder = null,
  researchOrganization = null,
  organisationResearchService = null,
  cvTailoringService = null,
  emailDomainStore = null,
  systemCheck = null,
  insightsStore = null,
  relationshipMemory = null,
  answersStore = null,
  questionWriter = null,
  replyWriter = null,
  cvTextFor = null,
  ownerCertifications = () => [],
  gmailReplyReader = undefined,
  gmailReplyDrafter = undefined,
  replyThreadsStore = null,
  tailoredCvLatest = null,
  insightsSnapshot = null,
  evidenceLearning = null,
  candidateDisplayName = "Candidate",
  portalExports = null,
  coverLetterRefinementPort = null,
  cvEvidenceLoader = null,
  applicationIntelligence = null,
  assignmentEvidenceStore = null,
  writingReferenceLibrary = null,
  cvDocumentAdapter = null,
  cvInventoryRepository = null,
  coverLetterRefinementMaxWords = 500,
  achievementEvidenceService = null,
  localDiagnosticsEnabled = false,
  diagnosticsWriter = process.stdout,
} = {}) {
  const reviewStore=applicationReviewStore||new Map();
  const handleCoverReferences=createCoverReferenceHandler({getReview:id=>reviewStore.get(id)});
  let writingLibraryCache=writingReferenceLibrary;
  const getWritingReferenceLibrary=()=>{if(writingLibraryCache)return writingLibraryCache;if(process.env.NMP_ENV==='verification')return null;writingLibraryCache=createCoverReferenceLibrary();return writingLibraryCache;};
  const resolveWritingInput=value=>{const refs=parseWritingReferenceSelection(value);return resolveWritingReferences(refs.length?getWritingReferenceLibrary():null,refs);};
  const handleWritingReferences=createWritingReferenceHandler({getLibrary:getWritingReferenceLibrary,getReview:id=>reviewStore.get(id)});

  const handleMaintenance=createMaintenanceHandler();
  const handleHistoryDashboard=createHistoryDashboardHandler();
  const handleFeatureToggles=createFeatureTogglesHandler();
  const handleAssignmentEvidence=createAssignmentEvidenceHandler({store:assignmentEvidenceStore});
  const handleScenarioPolishing=createScenarioPolishingHandler({library:assignmentEvidenceStore,reviews:reviewStore});
  const scenarioInput=(values,review)=>values.has('scenarioSelections')?values.get('scenarioSelections'):JSON.stringify(review.polishingScenarios?.references||[]);
  const roleReviewTickets=new Map();
  function issueRoleTicket(id,version){for(const [key,value]of roleReviewTickets)if(value.expiresAt<=Date.now())roleReviewTickets.delete(key);if(roleReviewTickets.size>=100)roleReviewTickets.delete(roleReviewTickets.keys().next().value);const token=randomBytes(32).toString('hex');roleReviewTickets.set(token,{reviewId:id,version,expiresAt:Date.now()+20*60*1000});return token;}

  async function loadOrganisationContacts(formData) {
    if (!recruiterContactStore) {
      return [];
    }

    return recruiterContactStore.listByOrganisation(
      deriveReviewOrganisationId(formData)
    );
  }

  async function loadReviewContacts(reviewId) {
    if (!recruiterContactStore) {
      return [];
    }

    return recruiterContactStore.listByReview(reviewId);
  }

  const perplexityClient = createPerplexityClient({
    apiKey: process.env.PERPLEXITY_API_KEY
  });

  const emailDomainResolutionService = createEmailDomainResolutionService({
    perplexityClient,
    recruiterContactStore,
    ...(emailDomainStore ? {store: emailDomainStore} : {})
  });
  // A domain newly found by research replaces the saved one, so the page and the browser copy show the new domain.
  async function adoptFoundEmailDomain(reviewId) {
    const review = reviewStore.get(reviewId);
    if (!review) return;
    const adopted = adoptResearchedDomain(review.formData, review.research);
    if (!adopted.changed) return;
    reviewStore.set(reviewId, {...review, formData: adopted.formData});
    try { await recruiterContactStore?.updateLinkedEmailCandidates?.({reviewId, emailDomain: adopted.emailDomain}); }
    catch (error) { if (isContactStoreLoadError(error)) throw error; console.warn('[EMAIL_DOMAIN] CONTACT_CANDIDATES_NOT_UPDATED'); }
  }


  async function loadContactLinking(reviewId) {
    if (!recruiterContactStore) {
      return {
        reviewId,
        unlinked: [],
        linked: []
      };
    }

    const contacts = await recruiterContactStore.listAll();

    return {
      reviewId,
      // Newly imported contacts from the application's own organisation are marked and listed first; nothing is linked automatically.
      unlinked: markSameOrganisation(contacts.filter((contact) =>
        (!Array.isArray(contact.linkedApplicationReviewIds) ||
        !contact.linkedApplicationReviewIds.includes(reviewId))&&newlyImportedForReview(contact,reviewStore.get(reviewId))
      ),deriveReviewOrganisationId(reviewStore.get(reviewId)?.formData||{})),
      linked: contacts.filter((contact) =>
        Array.isArray(contact.linkedApplicationReviewIds) &&
        contact.linkedApplicationReviewIds.includes(reviewId)
      )
    };
  }

  const writeDiagnostic = createDiagnosticWriter({
    enabled: localDiagnosticsEnabled,
    writer: diagnosticsWriter,
    alwaysLogFailures: true
  });

// new changes to be addeduntil here
  const wordCount = (value = '') => String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;


  // Evidence for the advertiser relationship: the advert text, who posted it, research, and earlier choices.
  function advertiserOf(review) {
    const form = review?.formData || {};
    let imported = null;
    try { imported = form.jobImportId ? jobImportService?.get?.(form.jobImportId, form.jobImportRevision) : null; } catch { imported = null; }
    return {imported, name: String(imported?.advertiser?.name || form.organisationName || '').trim()};
  }
  function relationshipSuggestionFor(review) {
    if (!review?.formData) return null;
    const form = review.formData, {imported, name} = advertiserOf(review);
    let pastChoice = null;
    try { pastChoice = name && relationshipMemory ? relationshipMemory.get(advertiserKey(name)) : null; } catch { pastChoice = null; }
    return suggestAdvertiserRelationship({organisationName: form.organisationName, advertiserName: imported?.advertiser?.name || '', jobDescriptionText: form.jobDescriptionText,
      posters: (imported?.jobPosters || []).map(p => ({name: p.fullName, headline: p.headline})), researchSummary: review.research?.summary || '', pastChoice});
  }

  async function renderCompleteReview(options) {
    const stored = reviewStore.get(options.reviewId);
    const roleState=stored?.formData?.jobTitle?inspectApplicationRole(stored.formData):null;
    const roleCsrfToken=roleState&&(roleState.conflict||roleState.staleConfirmation)?issueRoleTicket(options.reviewId,roleState.version):'';
    const base = stored ? {
      formData: stored.formData,
      applicationRoleReview:roleState,
      applicationRoleCsrfToken:roleCsrfToken,
      applicationRoleMessage:stored.applicationRoleMessage||'',
      prepared: stored.prepared,
      research: stored.research,
      currentDraftPlainText: stored.currentDraftPlainText,
      currentDraftHtml: stored.currentDraftHtml,
      currentDraftSubject: currentReviewSubject(stored),
      currentHighlightPhrases: stored.currentHighlightPhrases || [],
      letterTone: stored.letterTone || 'professional',
      letterLengthMode:stored.letterLengthMode||'standard',
      currentLetterLengthMode:stored.currentLetterLengthMode||'standard',
      rejectedRefinementProposal:stored.rejectedRefinementProposal||null,
      qualityMaximumWords:coverLetterRefinementMaxWords,
      polishingModel: stored.polishingModel || DEFAULT_POLISHING_MODEL,
      polishingModelExplicit: Boolean(stored.polishingModel),
      polishingInstructions:stored.polishingInstructions||'',
      scenarioSelectionReferences:stored.polishingScenarios?.references||[],
      refinementLastAttempt: stored.refinementLastAttempt || null,
      refinementProposal: stored.refinementProposal,
      selectedCvRoleCode: stored.selectedCvRoleCode,
      cvSelectionMessage: stored.cvSelectionMessage,
      relationshipSuggestion: relationshipSuggestionFor(stored)
    } : {};

    return renderApplicationReview({
      ...base,
      ...options,
      ...(stored?{currentDraftPlainText:stored.currentDraftPlainText,currentDraftHtml:stored.currentDraftHtml,currentDraftSubject:currentReviewSubject(stored),currentHighlightPhrases:stored.currentHighlightPhrases||[],selectedCvRoleCode:stored.selectedCvRoleCode}:{}),
      contacts: await loadReviewContacts(options.reviewId),
      contactLinking: await loadContactLinking(options.reviewId)
    });
  }


  function isContactStoreLoadError(error) {
    return [
      "CONTACT_STORE_INVALID",
      "CONTACT_STORE_READ_FAILED",
      "REVIEW_STORE_INVALID", "REVIEW_STORE_READ_FAILED", "REVIEW_STORE_WRITE_FAILED", "REVIEW_STORE_CONFLICT"
    ].includes(error?.code);
  }

  function sendSafeRequestFailure(request, response, error) {
    if (response.writableEnded || response.destroyed) return;
    if (response.headersSent) {
      response.destroy();
      return;
    }

    if(String(error?.code||'').startsWith('REVIEW_STORE_')){
      sendJson(response,error.statusCode||503,{ok:false,code:error.code,error:error.statusCode===409?'Saved application changed elsewhere. Keep your local edits and reload before saving.':'Saved application storage is unavailable. Check disk/database; do not clear data to bypass the error.'});return;
    }
    const storageError = isContactStoreLoadError(error);
    const statusCode = storageError ? 503 : 500;
    const code = storageError ? error.code : "REQUEST_FAILED";
    const message = storageError
      ? "Contact data is unavailable. Check the contact-store file or restore " +
        "a valid backup, then retry. Do not clear the file to bypass this error."
      : "The local request could not be completed. Check the server terminal.";

    try {
      writeDiagnostic("request_failed_safely", {
        errorCode: code,
        statusCode
      });
    } catch {
      // A diagnostic failure must not prevent the error response.
    }

    if (String(request.url || "").startsWith("/api/")) {
      sendJson(response, statusCode, {
        ok: false,
        code,
        error: message
      });
    } else {
      sendHtml(response, statusCode, `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Request unavailable</title></head>
<body>
  <main>
    <h1>${storageError ? "Contact data unavailable" : "Request unavailable"}</h1>
    <p role="alert">${escapeHtml(message)}</p>
    <p>Error code: ${escapeHtml(code)}</p>
    <p>After resolving the issue, return to the previous page and retry.</p>
  </main>
</body>
</html>`);
    }
  }

  // The checklist carries what has been learned about each statement (when the evidence engine is available).
  const achievementService=achievementEvidenceService&&evidenceLearning?{...achievementEvidenceService,load:async body=>evidenceLearning.annotate(await achievementEvidenceService.load(body))}:achievementEvidenceService;
  const handleAchievementPreparation=createAchievementPreparationHandler({service:achievementService,sendJson,sendText});
  const handleJobs=createJobImportHandler({service:jobImportService,getReview:id=>reviewStore.get(id),contactStore:recruiterContactStore,sendJson,sendText,reviews:reviewStore,outreach:outreachRepository,portalExports});
  const handleSavedDelete=createSavedApplicationDeleteHandler({store:reviewStore,contactStore:recruiterContactStore,outreachRepository,sendJson,sendText});
  const handleOrganisationContacts=createOrganisationContactHandler({contactStore:recruiterContactStore,outreachRepository,getReview:id=>reviewStore.get(id),sendJson});
  const letterUpdates=outreachRepository?createUnsentLetterUpdateService({getReview:id=>reviewStore.get(id),repository:outreachRepository,draftUpdates:gmailDraftUpdatePort||createGmailDraftUpdatePort()}):null;
  const handleApplications=createApplicationReviewHandler({outcomeFor:insightsStore?id=>{const o=currentOutcome(insightsStore.history(id));return o?{label:outcomeLabel(o.outcome),occurredOn:o.occurredOn}:null;}:null,store:reviewStore,renderReview:renderCompleteReview,sendJson,sendHtml,sendText,applicationPackExporter,letterUpdates,outputFolder:applicationOutputFolder});
  const handleSystemCheck=createSystemCheckHandler({runCheck:systemCheck,sendJson,sendHtml});
  // The owner's saved certifications (maintenance command), used by polishing and application answers.
  const savedCertifications=()=>{try{return normaliseCertifications(typeof ownerCertifications==='function'?ownerCertifications():[]);}catch{return [];}};
  // Polishing: the strong-fit paragraph is always requested; the early-weeks paragraph only when ticked.
  const letterSectionRequest=values=>{const c=savedCertifications();return {...(values.getAll('includeEarlyWeeks').includes('true')?{includeEarlyWeeks:true}:{}),...(c.length?{candidateCertifications:c}:{})};};
  // Application questions: evidence is this application's selected achievements, its latest tailored CV and its approved polishing scenarios.
  const questionsService=answersStore?createApplicationQuestionsService({reviews:reviewStore,store:answersStore,writer:questionWriter,
    tailoredLatest:id=>typeof tailoredCvLatest==='function'?tailoredCvLatest(id):null,
    cvFacts:async review=>{const cv=typeof cvTextFor==='function'&&review?.selectedCvRoleCode?await cvTextFor(review.selectedCvRoleCode):'';return factLinesWithCertifications(cv,savedCertifications());},
    scenarioEvidence:review=>{try{const refs=review.polishingScenarios?.references||[];if(!refs.length||!assignmentEvidenceStore)return [];const ev=approvedScenarioRequest(resolveScenarioSelection(assignmentEvidenceStore,JSON.stringify(refs))).approvedScenarioEvidence||[];return ev.map(s=>({text:s.approvedWording,source:'Approved scenario'+(s.organisation?' ('+s.organisation+')':'')}));}catch{return [];}}}):null;
  const handleQuestions=createApplicationQuestionsHandler({service:questionsService,sendJson,sendText});
  // Reply assistant: drafts a reply to a recruiter from the same evidence; never sends.
  const replyService=createRecruiterReplyService({reviews:reviewStore,writer:replyWriter,candidateName:process.env.CANDIDATE_DISPLAY_NAME||'',evidence:async id=>questionsService?await questionsService.evidenceFor(id):[],
    sentEmails:()=>outreachRepository?.listSentEmails?.()||[],queueItems:()=>outreachRepository?.list?.()||[],mailbox:String(process.env.GMAIL_FROM_ADDRESS||'').trim(),
    replyReader:gmailReplyReader!==undefined?gmailReplyReader:(gmailReplyReadingEnabled()?args=>readGmailReplies(args):null),
    replyStore:replyThreadsStore,draftWriter:gmailReplyDrafter!==undefined?gmailReplyDrafter:(gmailReplyReadingEnabled()?args=>createGmailReplyDraft(args):null)});
  const handleReply=createRecruiterReplyHandler({service:replyService,sendJson,sendText});
  // Letter keyword check: the advert's ATS terms against the letter and your evidence; free and local.
  const letterEvidence=async id=>questionsService?await questionsService.evidenceFor(id):[];
  const handleKeywords=createLetterKeywordsHandler({service:createLetterKeywordService({reviews:reviewStore,evidence:letterEvidence}),sendJson,sendText});
  const handleLetterGate=createLetterGateHandler({reviewStore,sendJson,sendText});
  const handleInsights=createInsightsHandler({snapshot:insightsSnapshot,learning:evidenceLearning,sendJson,sendHtml});
  const handleOutcomes=createApplicationOutcomesHandler({store:insightsStore,getReview:id=>reviewStore.get(id),sendJson,sendText,onChange:()=>insightsSnapshot?.schedule()});
  const handleCvTailoring=createCvTailoringHandler({service:cvTailoringService,getReview:id=>reviewStore.get(id),sendJson,sendText,candidateName:candidateDisplayName,outputFolder:applicationOutputFolder});
  const handleCvDocument=createCvDocumentHandler({store:reviewStore,inventory:cvInventoryRepository,adapter:cvDocumentAdapter});
  const handleIntelligence=createApplicationIntelligenceHttp({service:applicationIntelligence});
  const handleOutreach = createOutreachHttpHandler({
    repository: outreachRepository, contactStore: recruiterContactStore,
    // Emails queued from now on attach the tailored CV PDF when one is chosen for that application.
    tailoredAttachment: cvTailoringService && typeof cvTailoringService.emailAttachment === 'function' ? id => cvTailoringService.emailAttachment(id) : null,
    getReview: (id) => reviewStore.get(id),
    peekReview: (id) => (typeof reviewStore.peek === 'function' ? reviewStore.peek(id) : reviewStore.get(id))
  });

  return createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      try {
        sendSafeRequestFailure(request, response, error);
      } catch {
        response.destroy();
      }
    });
  });

  async function handleRequest(request, response) {
    if(!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i.test(String(request.headers.host||''))){sendJson(response,403,{ok:false,error:'This local application accepts loopback Host names only.'});return;}
    const method = request.method || 'GET';
    const url = new URL(request.url || '/', 'http://localhost');
    if(method==='GET'&&url.pathname==='/app-shell.css'){response.writeHead(200,{'content-type':'text/css; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});response.end(APP_SHELL_CSS);return;}
    attachShell(response,url.pathname);
    if(method==='GET'&&url.pathname==='/healthz'){sendJson(response,200,{ok:true,service:'NewModularProduct',environment:process.env.NMP_ENV||'development',release:process.env.NMP_RELEASE_COMMIT||'development'});return;}
    if(await handleWritingReferences(request,response,url))return;
    if(await handleCoverReferences(request,response,url))return;
    if(await handleAchievementPreparation(request,response,url))return;
    if (await handleJobs(request,response,url)) return;
    if (await handleSavedDelete(request,response,url)) return;
    if (await handleSystemCheck(request,response,url)) return;
    if (await handleOutcomes(request,response,url)) return;
    if (await handleQuestions(request,response,url)) return;
    if (await handleReply(request,response,url)) return;
    if (await handleKeywords(request,response,url)) return;
    if (await handleInsights(request,response,url)) return;
    if (await handleLetterGate(request,response,url)) return;
    if (await handleCvTailoring(request,response,url)) return;
    if (await handleApplications(request,response,url)) return;
    if (await handleOrganisationContacts(request,response,url)) return;
    if(await handleCvDocument(request,response,url))return;
    if(await handleIntelligence(request,response,url))return;
    if(await handleMaintenance(request,response,url))return;
    if(await handleHistoryDashboard(request,response,url))return;
    if(await handleFeatureToggles(request,response,url))return;
    if(await handleAssignmentEvidence(request,response,url))return;
    if(await handleScenarioPolishing(request,response,url))return;
    if (await handleOutreach(request, response, url)) return;
    const requestId = randomUUID();
    const scriptNonce = randomBytes(16).toString("base64");
    const requestStartedAt = Date.now();

    writeDiagnostic('request_received', {
      requestId,
      method,
      route: url.pathname
    });

    if (method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, renderApplicationForm());
      return;
    }

    if (method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        service: "new-modular-product"
      });

      return;
    }

    if (method === 'POST' && url.pathname === '/applications') {
      const actionStartedAt = Date.now();

      const formBody = await readFormBody(request,{maxBytes:jobImportService?256*1024:64*1024});

      if (formBody.error) {
        sendText(
          response,
          formBody.error.statusCode,
          formBody.error.message
        );
        return;
      }

      const formData = normalizeFormData(formBody.values);

      writeDiagnostic('application_prepare_started', {
        requestId,
        jobDescriptionCharacters: (formData.jobDescriptionText || '').length
      });

      const errors = validationErrors(formData);

      if (errors.length) {
        sendHtml(
          response,
          400,
          renderApplicationForm({
            formData,
            errors
          })
        );
        return;
      }

      try {
        writeDiagnostic('application_prepare_inputs_validated', {
          requestId,
          jobTitleProvided: Boolean(formData.jobTitle),
          organisationProvided: Boolean(formData.organisationName),
          organisationUrlProvided: Boolean(formData.organisationUrl),
          jobDescriptionCharacters: String(
            formData.jobDescriptionText || ''
          ).length,
          cvHighlightCount: Array.isArray(formData.cvHighlights)
            ? formData.cvHighlights.length
            : 0
        });

        let importedJob=null;
        if(formData.jobImportId){importedJob=jobImportService?.get(formData.jobImportId,formData.jobImportRevision);if(!importedJob||formData.jobAdvertLink!==importedJob.jobAdvertLink){sendHtml(response,409,renderApplicationForm({formData,errors:['Import revision/advert mismatch. Reload the intended import before generating.']}));return;}}
        let achievementSelection=null;
        if(formData.achievementMode){
          if(achievementEvidenceService){const codes=new Set((await achievementEvidenceService.roles()).map(x=>x.roleCode));if(formData.preferredRoleCodes.some(x=>!codes.has(x))){sendHtml(response,400,renderApplicationForm({formData,errors:['A preferred CV code is not in the configured inventory.']}));return;}}
          if(formData.achievementCvRoleCode||formData.achievementIds.length){
            if(!achievementEvidenceService){sendHtml(response,503,renderApplicationForm({formData,errors:['CV evidence preparation is unavailable.']}));return;}
            try{achievementSelection=await achievementEvidenceService.resolve({roleCode:formData.achievementCvRoleCode,sourceHash:formData.achievementSourceHash,ids:formData.achievementIds});}
            catch(e){sendHtml(response,e.statusCode||503,renderApplicationForm({formData,errors:[e.statusCode?e.message:'CV evidence could not be checked. No provider request was made.']}));return;}
          }
          formData.achievementSelection=achievementSelection;formData.cvHighlights=achievementSelection?.items.map(x=>x.text)||[];
        }else if(formData.achievementIds.length){sendHtml(response,400,renderApplicationForm({formData,errors:['Achievement IDs require the evidence-selection workflow.']}));return;}
        const prepared = await prepareApplication({
        jobDescriptionText: formData.jobDescriptionText,
        jobDescriptionOverrides: {
          role: formData.jobTitle,
          ...(formData.organisationName?{organisationName:formData.organisationName}:{}),
          ...(formData.jobLocation?{location:formData.jobLocation}:{})
        },
        recruiterName: formData.recruiterName||(/^(?:https?:\/\/|www\.|linkedin\.com)/i.test(formData.stakeholderSource)?'':formData.stakeholderSource),
        jobAdvertLink: formData.jobAdvertLink,
        jobReference: formData.jobReference,
        preferredRoleCodes: formData.preferredRoleCodes,
        cvHighlights: formData.cvHighlights,
        ...(formData.achievementMode?{selectedCvRoleCode:achievementSelection?.roleCode||'',selectedAchievementStatements:formData.cvHighlights}:{})
      });

        const reviewId = randomUUID();

      writeDiagnostic('application_prepare_completed', {
        requestId,
        reviewId,
        selectedCvCode: prepared.recommendation?.bestCv?.role_code || 'none',
        atsScore: Number.isFinite(prepared.recommendation?.ats?.score)
          ? prepared.recommendation.ats.score
          : 'none',
        durationMs: Date.now() - actionStartedAt
      });

      reviewStore.set(reviewId, {
        formData,
        prepared,
        research: null,
        originalDraftPlainText: prepared.coverLetter?.plainText || '',
        currentDraftPlainText: prepared.coverLetter?.plainText || '',
        refinementProposal: null,
        polishingModel:newApplicationPolishingModel(POLISHING_MODELS),
        selectedCvRoleCode: prepared.recommendation?.bestCv?.role_code || '',
        cvSelectionMessage: '',
        createdAt: Date.now()
      });
      if(applicationIntelligence){try{await applicationIntelligence.capture(reviewId);}catch{console.warn('[APPLICATION_INTELLIGENCE] ASSESSMENT_NOT_RECORDED');}}
      // Research the organisation once for its first application, or reuse a recent copy. Never retried automatically.
      if(organisationResearchService){try{const auto=await organisationResearchService.forNewApplication({organisationName:formData.organisationName,organisationUrl:formData.organisationUrl,jobTitle:formData.jobTitle});writeDiagnostic('organisation_research_automatic',{requestId,reviewId,source:auto.source,status:auto.research?.status||'none'});if(auto.research){const current=reviewStore.get(reviewId);reviewStore.set(reviewId,{...current,research:auto.research,researchedAt:Date.now()});await adoptFoundEmailDomain(reviewId);}}catch(error){if(isContactStoreLoadError(error))throw error;console.warn('[ORGANISATION_RESEARCH] AUTOMATIC_RESEARCH_NOT_RECORDED');}}
      if(importedJob&&formData.importJobPosters){try{await importJobPosters({record:importedJob,contactStore:recruiterContactStore,reviewId});}catch{const r=reviewStore.get(reviewId);reviewStore.set(reviewId,{...r,jobPosterImportError:'Application saved, but optional poster import was not fully completed. Review/retry explicitly; no email was inferred or sent.'});}}

        sendHtml(
          response,
          200,
          await renderCompleteReview({
            formData: reviewStore.get(reviewId)?.formData || formData,
            prepared,
            reviewId,
            research: reviewStore.get(reviewId)?.research || null,
            contacts: await loadReviewContacts(reviewId),
            contactLinking: await loadContactLinking(reviewId),
            scriptNonce
          }),
        );
     } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        const message = error instanceof Error
          ? error.message
          : 'Unknown application preparation error';

        writeDiagnostic('application_prepare_failed', {
          requestId,
          errorType: error?.name || 'UnknownError',
          message,
          durationMs: Date.now() - actionStartedAt
        });

        sendHtml(
          response,
          500,
          renderApplicationForm({
            errors: [
              'The local application could not be prepared. Check the local server terminal for a diagnostic message, then try again.'
            ]
          })
        );
      }

      return;
    }

    if (method === 'POST' && url.pathname === '/review-cv-selection') {
      const actionStartedAt = Date.now();

      writeDiagnostic('cv_selection_requested', {
        requestId
      });

      const formBody = await readFormBody(request);

      if (formBody.error) {
        sendText(
          response,
          formBody.error.statusCode,
          formBody.error.message
        );
        return;
      }

      const reviewId = String(
        formBody.values.get('reviewId') || ''
      ).trim();

      const review = reviewStore.get(reviewId);

      if (!review) {
        sendHtml(
          response,
          410,
          renderApplicationForm({
            errors: [
              'This application review is no longer available. Please prepare the application again.'
            ]
          })
        );
        return;
      }

      const selectedCvRoleCode = String(
        formBody.values.get('selectedCvRoleCode') || ''
      ).trim();

      const rankedCvs = Array.isArray(review.prepared?.rankedCvs)
        ? review.prepared.rankedCvs
        : [];

      const selectedCandidate = rankedCvs.find((candidate) =>
        String(candidate?.cv?.role_code || '').trim() === selectedCvRoleCode
      );

      if (!selectedCandidate) {
        sendHtml(
          response,
          400,
          await renderCompleteReview({
            formData: review.formData,
            prepared: review.prepared,
            reviewId,
            research: review.research,
            currentDraftPlainText: review.currentDraftPlainText,
            refinementProposal: review.refinementProposal,
            selectedCvRoleCode: review.selectedCvRoleCode,
            cvSelectionMessage: 'Select a CV from the available ranked candidates.'
          })
        );
        return;
      }

      const updatedReview = {
        ...review,
        selectedCvRoleCode,
        cvSelectionMessage:
          'Selected CV updated. The current cover letter has not changed.'
      };

      reviewStore.set(reviewId, updatedReview);

      writeDiagnostic('cv_selection_completed', {
        requestId,
        reviewId,
        selectedCvCode: selectedCvRoleCode,
        atsScore: Number.isFinite(selectedCandidate.ats?.score)
          ? selectedCandidate.ats.score
          : 'none',
        durationMs: Date.now() - actionStartedAt
      });

      sendHtml(
        response,
        200,
        await renderCompleteReview({
          formData: updatedReview.formData,
          prepared: updatedReview.prepared,
          reviewId,
          research: updatedReview.research,
          currentDraftPlainText: updatedReview.currentDraftPlainText,
          refinementProposal: updatedReview.refinementProposal,
          selectedCvRoleCode: updatedReview.selectedCvRoleCode,
          cvSelectionMessage: updatedReview.cvSelectionMessage,
          contacts: await loadOrganisationContacts(review.formData)
        })
      );
      return;
    }


    if (method === "POST" && url.pathname === "/api/reviews/email-domain/save") {
      try {
        const body = await readJsonBody(request);
        const reviewId = String(body.reviewId || "").trim();
        const review = reviewStore.get(reviewId);

        if (!review) {
          sendJson(response, 404, {
            ok: false,
            error: "Application review not found."
          });
          return;
        }

        const emailDomain = normaliseBusinessDomain(body.emailDomain);
        const valid = Boolean(emailDomain);

        if (!valid) {
          sendJson(response, 400, {
            ok: false,
            error: "Enter a business domain only, such as twinstream.com. Do not enter a URL or full email address."
          });
          return;
        }

        const updatedContacts = recruiterContactStore
          ? await recruiterContactStore.updateLinkedEmailCandidates({
              reviewId,
              emailDomain
            })
          : [];

        reviewStore.set(reviewId, {
          ...review,
          formData: {
            ...review.formData,
            emailDomain
          }
        });

        sendJson(response, 200, {
          ok: true,
          emailDomain,
          updatedContacts: updatedContacts.length
        });
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        sendJson(response, 400, {
          ok: false,
          error: "Unable to save the email domain."
        });
      }
      return;
    }


    if (method === "POST" && url.pathname === "/recruiter-contacts/link") {
      const formBody = await readFormBody(request);

      if (formBody.error) {
        sendText(
          response,
          formBody.error.statusCode,
          formBody.error.message
        );
        return;
      }

      const reviewId = String(
        formBody.values.get("reviewId") || ""
      ).trim();

      const review = reviewStore.get(reviewId);

      if (!review) {
        sendHtml(response, 410, renderApplicationForm({
          errors: [
            "This application review is no longer available. Please prepare the application again."
          ]
        }));
        return;
      }

      if (!recruiterContactStore) {
        sendHtml(response, 503, await renderCompleteReview({ reviewId }));
        return;
      }

      const contactIds = [...new Set(
        formBody.values.getAll("contactIds")
          .map((value) => String(value).trim())
          .filter(Boolean)
      )];

      async function respondWithLinkMessage(statusCode, message) {
        const html = await renderCompleteReview({ reviewId });
        sendHtml(
          response,
          statusCode,
          html.replace(
            "<h2>Link imported contacts</h2>",
            "<h2>Link imported contacts</h2>" +
              `<p role="status">${escapeHtml(message)}</p>`
          )
        );
      }

      if (!contactIds.length) {
        await respondWithLinkMessage(
          400,
          "Select at least one imported contact to link."
        );
        return;
      }

      try {
        const contacts = await recruiterContactStore.listAll();
        const existingIds = new Set(contacts.map((contact) => contact.id));

        if (contactIds.some((id) => !existingIds.has(id))) {
          await respondWithLinkMessage(
            400,
            "One or more selected contacts are no longer available. Refresh contacts and try again."
          );
          return;
        }

        await recruiterContactStore.linkToReview({
          reviewId,
          contactIds
        });
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        await respondWithLinkMessage(
          500,
          "Unable to link the selected contacts."
        );
        return;
      }

      await respondWithLinkMessage(
        200,
        "Selected contacts are linked to this application."
      );
      return;
    }

    if (method === 'POST' && url.pathname === '/organisation-research') {
      const actionStartedAt = Date.now();

      writeDiagnostic('organisation_research_started', {
        requestId
      });

      const formBody = await readFormBody(request);

      if (formBody.error) {
        sendText(
          response,
          formBody.error.statusCode,
          formBody.error.message
        );
        return;
      }

      const reviewId = String(
        formBody.values.get('reviewId') || ''
      ).trim();

      const review = reviewStore.get(reviewId);

      if (!review) {
        sendHtml(
          response,
          410,
          renderApplicationForm({
            errors: [
              'This application review is no longer available. Please prepare the application again.'
            ]
          })
        );
        return;
      }

      const companyName = String(
        review.formData.organisationName || ''
      ).trim();

      const companyUrl = String(
        review.formData.organisationUrl || ''
      ).trim();

      const jobTitle = String(
        review.formData.jobTitle || ''
      ).trim();

      if (!companyName) {
        sendHtml(
          response,
          400,
          await renderCompleteReview({
            formData: review.formData,
            prepared: review.prepared,
            reviewId,
            research: {
              status: 'error',
              provider: 'Perplexity',
              researchedAt: new Date().toISOString(),
              error: 'Organisation name is required for organisation research.'
            }
          })
        );
        return;
      }

      if (typeof researchOrganization !== 'function') {
        sendHtml(
          response,
          503,
          await renderCompleteReview({
            formData: review.formData,
            prepared: review.prepared,
            reviewId,
            research: {
              status: 'error',
              provider: 'Perplexity',
              researchedAt: new Date().toISOString(),
              error: 'Organisation research is disabled. Set ENABLE_PERPLEXITY_RESEARCH=true and restart the local server.'
            }
          })
        );
        return;
      }

      let research;

      writeDiagnostic('organisation_research_requested', {
        requestId,
        reviewId,
        organisationProvided: Boolean(companyName),
        organisationUrlProvided: Boolean(companyUrl),
        roleProvided: Boolean(jobTitle)
      });

      try {
        research = await researchOrganization({
          companyName,
          companyUrl,
          jobDescriptionSummary: jobTitle,
          forceRefresh: false
        });
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        research = {
          status: 'error',
          provider: 'Perplexity',
          researchedAt: new Date().toISOString(),
          error: error instanceof Error
            ? error.message
            : 'Organisation research failed unexpectedly.'
        };
      }

      writeDiagnostic('organisation_research_completed', {
        requestId,
        reviewId,
        status: research.status || 'unknown',
        valueCount: Array.isArray(research.companyValues)
          ? research.companyValues.length
          : 0,
        sourceCount: Array.isArray(research.sources)
          ? research.sources.length
          : 0,
        durationMs: Date.now() - actionStartedAt
      });

      reviewStore.set(reviewId, {
        ...review,
        research,
        researchedAt: Date.now()
      });
      try{organisationResearchService?.recordManual(companyName,research);}catch{console.warn('[ORGANISATION_RESEARCH] SHARED_COPY_NOT_UPDATED');}
      await adoptFoundEmailDomain(reviewId);

      sendHtml(
        response,
        200,
        await renderCompleteReview({
          formData: reviewStore.get(reviewId)?.formData || review.formData,
          prepared: review.prepared,
          reviewId,
          research,
          currentDraftPlainText: review.currentDraftPlainText,
          refinementProposal: review.refinementProposal,
          selectedCvRoleCode: review.selectedCvRoleCode,
          cvSelectionMessage: review.cvSelectionMessage
        })
      );
      return;
    }

    if(method==='GET'&&['/letter-quality-controls.js','/domain/cover-letter/letter-quality-policy.js'].includes(url.pathname)) {
      const file=url.pathname==='/letter-quality-controls.js'?'letter-quality-controls.js':'../../domain/cover-letter/letter-quality-policy.js';
      try{sendText(response,200,await readFile(join(__dirname,file),'utf8'),{'content-type':'application/javascript'});}catch{sendText(response,500,'Local letter quality controls unavailable.');}return;
    }
    if(method==='POST'&&url.pathname==='/cover-letter-refinement/reassess-length') {
      const body=await readFormBody(request);if(body.error){sendText(response,body.error.statusCode,body.error.message);return;}
      const id=String(body.values.get('reviewId')||'').trim(),r=reviewStore.get(id);
      if(!r){sendText(response,410,'Application review expired.');return;}
      const candidate=r.rejectedRefinementProposal;
      if(!candidate?.proposedDraft||candidate.lengthCheckFailed!==true||body.values.get('letterLengthMode')!=='extended'){sendText(response,400,'Choose Extended explicitly for a retained length-rejected proposal.');return;}
      try{
        extractOutreachExperienceBody(candidate.proposedDraft,['micro1']);
        const quality=assertLetterLength(candidate.proposedDraft,{mode:'extended',maxWords:coverLetterRefinementMaxWords,advertUrl:r.formData.jobAdvertLink});
        const proposal={...candidate,letterLengthMode:'extended',quality,qualityAdvertUrl:r.formData.jobAdvertLink,lengthCheckFailed:false,warnings:[...quality.warnings,'Reassessed locally in Extended mode. No provider call or automatic acceptance.'],qualityReassessedAt:new Date().toISOString()};
        reviewStore.set(id,{...r,letterLengthMode:'extended',refinementProposal:proposal,rejectedRefinementProposal:null});
        sendHtml(response,200,await renderCompleteReview({reviewId:id}));
      }catch(error){sendHtml(response,400,await renderCompleteReview({reviewId:id,rejectedRefinementProposal:{...candidate,warnings:[error.code==='REFINEMENT_LENGTH_EXCEEDED'?error.message:'Local reassessment failed. Current letter unchanged.']}}));}return;
    }

    if(method==='POST'&&url.pathname==='/review-role-title'){
      if((request.headers.origin&&request.headers.origin!=='null'&&![`http://${request.headers.host}`,`https://${request.headers.host}`].includes(request.headers.origin))||request.headers['sec-fetch-site']==='cross-site'||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket?.remoteAddress)){sendText(response,403,'Local same-origin role confirmation required.');return;}
      const body=await readFormBody(request);if(body.error){sendText(response,body.error.statusCode,body.error.message);return;}
      const id=String(body.values.get('reviewId')||'').trim(),current=reviewStore.get(id);if(!current){sendText(response,410,'Saved review expired.');return;}
      const csrf=body.values.get('roleCsrfToken'),ticket=roleReviewTickets.get(csrf);if(!ticket||ticket.reviewId!==id||ticket.expiresAt<=Date.now()){sendText(response,403,'Role confirmation expired or missing. Reload the panel.');return;}if(ticket.version!==inspectApplicationRole(current.formData).version){sendText(response,409,'Role choice changed. Reload the panel.');return;}
      try{const formData=confirmApplicationRole(current.formData,{binding:body.values.get('roleBinding'),expectedRoleVersion:body.values.get('expectedRoleVersion'),choice:body.values.get('roleChoice')});roleReviewTickets.delete(csrf);const beforeRole=inspectApplicationRole(current.formData);if(beforeRole.confirmationValid&&current.formData.applicationRoleConfirmation?.choice===body.values.get('roleChoice')&&current.formData.jobTitle===formData.jobTitle){sendHtml(response,200,await renderCompleteReview({reviewId:id,applicationRoleMessage:'Application role already confirmed. No letter or proposal changed.'}));return;}
      const preservedSubject=currentReviewSubject(current);
      reviewStore.set(id,{...current,formData,currentDraftSubject:preservedSubject,refinementProposal:null,rejectedRefinementProposal:null,applicationRoleMessage:'Application role confirmed locally. Current letter, effective subject, CV, queue and sent history were NOT changed. Earlier proposals were invalidated; request a new reviewed polish when ready.'});sendHtml(response,200,await renderCompleteReview({reviewId:id}));}
      catch(error){if(isContactStoreLoadError(error))throw error;sendHtml(response,error.statusCode||400,await renderCompleteReview({reviewId:id,applicationRoleMessage:error.message}));}return;
    }

    if (method === 'POST' && url.pathname === '/cover-letter-refinement/estimate') {
      const formBody = await readFormBody(request);
      if (formBody.error) {sendJson(response, formBody.error.statusCode, {ok:false,error:formBody.error.message});return;}
      const reviewId = String(formBody.values.get('reviewId') || '').trim();
      let review = reviewStore.get(reviewId);
      if (!review) {sendJson(response,410,{ok:false,error:'This review expired. Prepare it again; no provider call was made.'});return;}
      try {
        review=polishingReviewWithRelationship(review,formBody.values);
        const confirmedRole=confirmedRoleForRequest(review,formBody.values);
        resolveScenarioSelection(assignmentEvidenceStore,scenarioInput(formBody.values,review));
        const selectedModel = normalizePolishingModel(formBody.values.get('polishingModel') || review.polishingModel || DEFAULT_POLISHING_MODEL);
        const cvEvidence = cvEvidenceLoader ? await cvEvidenceLoader(review) : {};
        const ids = formBody.values.getAll('selectedResearchPointIds').map(value=>String(value).trim());
        const selectedResearchPoints = usesCandidateValues(review.formData)?[]:getSelectableCompanyValues(review.research).filter(point=>ids.includes(point.id));
        const scenarioState=resolveScenarioSelection(assignmentEvidenceStore,scenarioInput(formBody.values,review));
        const writingState=resolveWritingInput(formBody.values.get('writingReferenceSelections')||'[]');
        const requestForEstimate = {...cvEvidence,...writingReferenceRequest(writingState),...approvedScenarioRequest(scenarioState),...(review.formData.achievementMode?{achievementSelectionExplicit:true,approvedAchievementEvidence:cvEvidence.approvedAchievementEvidence??review.formData.achievementSelection}:{}),draftPlainText:review.currentDraftPlainText,
          applicationJobTitle:confirmedRole,jobDescriptionSummary:confirmedRole,jobDescriptionText:review.formData.jobDescriptionText,
          selectedCvHighlights:Array.isArray(review.formData.cvHighlights)?review.formData.cvHighlights.map(value=>String(value||'').trim()).filter(value=>value&&value.toLowerCase()!=='null'):[],
          companyValues:selectedResearchPoints.map(point=>point.text),selectedResearchPoints,
          organisationName:review.formData.organisationName,advertiserRelationship:contextMode(review.formData),...(review.formData.professionalValues?{candidateProfessionalValues:review.formData.professionalValues}:{}),organisationUrl:review.formData.organisationUrl,
          researchSources:!usesCandidateValues(review.formData)&&Array.isArray(review.research?.sources)?review.research.sources:[],instructions:personalPolishingInstructions(formBody.values),letterLengthMode:normalizeLengthMode(formBody.values.get('letterLengthMode')||review.letterLengthMode||'standard'),maxWords:coverLetterRefinementMaxWords,
          letterTone:normalizeLetterTone(formBody.values.get('letterTone')||review.letterTone||'professional'),excludedEmployers:['micro1'],
          webSearchEnabled:formBody.values.getAll('webSearchEnabled').includes('true'),...letterSectionRequest(formBody.values)};
        const apiBody = buildPolishingApiRequest(requestForEstimate,selectedModel);
        sendJson(response,200,{ok:true,writingReferenceCostProof:writingReferenceCostProof(writingState,review,formBody.values),writingReferenceCount:writingState.examples.length,writingReferenceCharacters:writingState.examples.reduce((n,x)=>n+Array.from(x.excerpt).length,0),scenarioCostProof:scenarioCostProof(scenarioState,review,formBody.values),...estimatePolishingApiRequest(apiBody),letterLengthMode:requestForEstimate.letterLengthMode,fullLetterMaximumWords:lengthPolicy(requestForEstimate.letterLengthMode,coverLetterRefinementMaxWords).maximumWords});
      } catch(error) {
        if(error.code==='WRITING_REFERENCE_INVALID'){sendJson(response,error.statusCode||409,{ok:false,code:error.code,error:error.message});return;}
        if(error.code==='SCENARIO_SELECTION_INVALID'){sendJson(response,error.statusCode||409,{ok:false,code:error.code,error:error.message});return;}
        if(error.code==='APPLICATION_ROLE_CONFIRMATION_REQUIRED'){sendJson(response,409,{ok:false,code:error.code,error:error.message,roleReview:error.roleReview||null});return;}
        const known=error.statusCode===400||['REFINEMENT_LENGTH_INVALID','REFINEMENT_MODEL_INVALID','REFINEMENT_TONE_INVALID','CV_EVIDENCE_UNAVAILABLE','LINKEDIN_EVIDENCE_UNAVAILABLE'].includes(error.code);
        sendJson(response,known?400:503,{ok:false,error:known?error.message:'Local cost estimation failed. No provider call was made.'});
      }
      return;
    }
    if (method === 'GET' && url.pathname === '/polishing-cost-controls.js') {
      try {const code=await readFile(join(__dirname,'polishing-cost-controls.js'),'utf8');sendText(response,200,code,{'content-type':'application/javascript'});}
      catch {sendText(response,500,'Local polishing cost controls unavailable.');}
      return;
    }

    if (method === 'POST' && url.pathname === '/cover-letter-refinement') {
      const actionStartedAt = Date.now();

      writeDiagnostic('refinement_requested', {
        requestId
      });

      const formBody = await readFormBody(request);

      if (formBody.error) {
        sendText(
          response,
          formBody.error.statusCode,
          formBody.error.message
        );
        return;
      }

      const reviewId = String(
        formBody.values.get('reviewId') || ''
      ).trim();

      let review = reviewStore.get(reviewId);

      if (!review) {
        sendHtml(
          response,
          410,
          renderApplicationForm({
            errors: [
              'This application review is no longer available. Please prepare the application again.'
            ]
          })
        );
        return;
      }

      try {review=polishingReviewWithRelationship(review,formBody.values);}catch(error){sendText(response,400,error.message);return;}

      const refinementReviewContacts =
        await loadReviewContacts(reviewId);
      const refinementContactLinking =
        await loadContactLinking(reviewId);

      const renderReview = async (statusCode, refinementProposal = null) => {
        sendHtml(
          response,
          statusCode,
          await renderCompleteReview({
            formData: review.formData,
            prepared: review.prepared,
            reviewId,
            research: review.research,
            currentDraftPlainText: review.currentDraftPlainText,
            refinementProposal,
            polishingInstructions:String(formBody.values.get('instructions')||''),
            selectedCvRoleCode: review.selectedCvRoleCode,
            cvSelectionMessage: review.cvSelectionMessage,
            contacts: refinementReviewContacts,
            contactLinking: refinementContactLinking
          })
        );
      };

      let writingState;try{writingState=resolveWritingInput(formBody.values.get('writingReferenceSelections')||'[]');requireWritingReferenceCostApproval(writingState,review,formBody.values);}catch(error){await renderReview(error.statusCode||409,{...(review.refinementProposal||{}),warnings:[...(review.refinementProposal?.warnings||[]),error.message]});return;}
      let scenarioState;try{scenarioState=resolveScenarioSelection(assignmentEvidenceStore,scenarioInput(formBody.values,review));requireScenarioCostApproval(scenarioState,review,formBody.values);}catch(error){await renderReview(error.statusCode||409,{...(review.refinementProposal||{}),warnings:[...(review.refinementProposal?.warnings||[]),error.message]});return;}
      let personalInstructions;try{personalInstructions=personalPolishingInstructions(formBody.values);}catch(error){await renderReview(400,{...(review.refinementProposal||{}),warnings:[...(review.refinementProposal?.warnings||[]),error.message]});return;}
      review={...review,polishingInstructions:personalInstructions};reviewStore.set(reviewId,{...reviewStore.get(reviewId),polishingInstructions:personalInstructions});
      let confirmedRole;try{confirmedRole=confirmedRoleForRequest(review,formBody.values);}catch(error){await renderReview(error.statusCode||409,{...(review.refinementProposal||{}),warnings:[...(review.refinementProposal?.warnings||[]),error.message]});return;}

      if (typeof coverLetterRefinementPort?.refine !== 'function') {
        await renderReview(503, {
          proposedDraft: '',
          warnings: [
            'Cover-letter refinement is disabled. Enable ENABLE_COVER_LETTER_REFINEMENT and restart the local server.'
          ]
        });
        return;
      }

      if ((!review.research || review.research.status !== 'found')&&!(usesCandidateValues(review.formData))) {
        await renderReview(400, {
          proposedDraft: '',
          warnings: [
            'Research the organisation successfully before requesting a refinement.'
          ]
        });
        return;
      }

      if (formBody.values.get('polishingCostGuard') === 'required' &&
          (formBody.values.get('polishingCostConfirmed') !== 'true' ||
           ((personalInstructions||formBody.values.has('polishingConfirmedInstructions'))&&String(formBody.values.get('polishingConfirmedInstructions')||'')!==personalInstructions) ||
           (formBody.values.has('advertiserRelationship')&&formBody.values.get('polishingConfirmedRelationship')!==formBody.values.get('advertiserRelationship')) ||
           formBody.values.get('polishingConfirmedModel') !== formBody.values.get('polishingModel') ||
           (formBody.values.has('letterLengthMode')&&formBody.values.get('polishingConfirmedLengthMode')!==formBody.values.get('letterLengthMode')))) {
        await renderReview(409,retainSuccessfulProposal(review.refinementProposal,{proposedDraft:'',
          warnings:['Review and confirm the local cost estimate before polishing. No provider call was made.']}));
        return;
      }

      if(formBody.values.has('scenarioSelections')||review.polishingScenarios){reviewStore.set(reviewId,{...reviewStore.get(reviewId),polishingScenarios:scenarioState});review={...reviewStore.get(reviewId),formData:review.formData};}
      if(formBody.values.has('advertiserRelationship')){reviewStore.set(reviewId,review);try{const {name}=advertiserOf(review);if(name&&relationshipMemory)relationshipMemory.record(advertiserKey(name),name,review.formData.advertiserRelationship);}catch{console.warn('[RELATIONSHIP] CHOICE_NOT_REMEMBERED');}}

      const selectedIds = formBody.values
        .getAll('selectedResearchPointIds')
        .map((value) => String(value).trim())
        .filter(Boolean);

      const selectedResearchPoints = usesCandidateValues(review.formData)?[]:getSelectableCompanyValues(
        review.research
      ).filter((point) => selectedIds.includes(point.id));

      let refinementProposal;
      let letterTone = review.letterTone || 'professional';
      let polishingModel = review.polishingModel || DEFAULT_POLISHING_MODEL;
      let refinementLastAttempt = null;
      let letterLengthMode=review.letterLengthMode||'standard';
      let rejectedRefinementProposal=review.rejectedRefinementProposal||null;

      writeDiagnostic('refinement_provider_requested', {
        requestId,
        reviewId,
        selectedValueCount: selectedResearchPoints.length,
        cvHighlightCount: Array.isArray(review.formData.cvHighlights)
          ? review.formData.cvHighlights.length
          : 0
      });

      try {
      letterLengthMode=normalizeLengthMode(formBody.values.get('letterLengthMode')||letterLengthMode);
      letterTone = normalizeLetterTone(formBody.values.get('letterTone') || letterTone);
      review.letterTone = letterTone;
      polishingModel = normalizePolishingModel(formBody.values.get('polishingModel') || polishingModel);
      review.polishingModel = polishingModel;
      const cvEvidence = cvEvidenceLoader ? await cvEvidenceLoader(review) : {};
      scenarioState=resolveScenarioSelection(assignmentEvidenceStore,scenarioInput(formBody.values,review));requireScenarioCostApproval(scenarioState,reviewStore.get(reviewId),formBody.values);
      writingState=resolveWritingInput(formBody.values.get('writingReferenceSelections')||'[]');requireWritingReferenceCostApproval(writingState,reviewStore.get(reviewId),formBody.values);
      refinementProposal = await coverLetterRefinementPort.refine({
        ...approvedScenarioRequest(scenarioState),
        ...cvEvidence,
        ...writingReferenceRequest(writingState),
        ...(review.formData.achievementMode?{achievementSelectionExplicit:true,approvedAchievementEvidence:cvEvidence.approvedAchievementEvidence??review.formData.achievementSelection}:{}),
        ...(formBody.values.has('polishingModel') || review.polishingModel !== DEFAULT_POLISHING_MODEL ? {polishingModel} : {}),
        letterTone,
        excludedEmployers: ['micro1'],
        ...letterSectionRequest(formBody.values),
        ...(formBody.values.has('webSearchEnabled') ? {
          webSearchEnabled: formBody.values.getAll('webSearchEnabled').includes('true')
        } : {}),
        jobDescriptionText: review.formData.jobDescriptionText,
        draftPlainText: review.currentDraftPlainText,
        applicationJobTitle:confirmedRole,
        jobDescriptionSummary:confirmedRole,
        selectedCvHighlights: Array.isArray(review.formData.cvHighlights)
          ? review.formData.cvHighlights
              .map((highlight) => String(highlight ?? "").trim())
              .filter((highlight) =>
                highlight && highlight.toLowerCase() !== "null"
              )
          : [],
        companyValues: selectedResearchPoints.map((point) => point.text),
        selectedResearchPoints,
        organisationName: review.formData.organisationName,
        ...(review.formData.advertiserRelationship||review.formData.jobImportId?{advertiserRelationship:contextMode(review.formData)}:{}),
        ...(review.formData.professionalValues?{candidateProfessionalValues:review.formData.professionalValues}:{}),
        ...(usesCandidateValues(review.formData)?{allowUnknownOrganisation:true}:{}),
        organisationUrl: review.formData.organisationUrl,
        researchSources: !usesCandidateValues(review.formData)&&Array.isArray(review.research?.sources)
          ? review.research.sources
          : [],
        instructions: personalInstructions,
        letterLengthMode,
        maxWords: coverLetterRefinementMaxWords
      });
      if (refinementProposal.error) {
        const error = new Error(refinementProposal.error);
        error.code = refinementProposal.errorCode || 'REFINEMENT_FAILED';
        error.attemptMetadata = refinementProposal.attemptMetadata;
        error.refinementDetails = refinementProposal.failureDetails || {};
        error.rejectedProposal=refinementProposal.rejectedProposal;
        throw error;
      }
      try{resolveScenarioSelection(assignmentEvidenceStore,scenarioState.references);requireScenarioCostApproval(scenarioState,reviewStore.get(reviewId),formBody.values);}catch(error){error.message='Scenario approval or application context changed while polishing. The provider request completed, but this proposal was not accepted. Review evidence before a new request; no automatic retry.';throw error;}
      try{writingState=resolveWritingInput(writingState.references);requireWritingReferenceCostApproval(writingState,reviewStore.get(reviewId),formBody.values);}catch(error){error.message='Writing example or application context changed while polishing. The provider request completed, but this proposal was not accepted. Refresh references and review before a new request; no automatic retry.';throw error;}
      if(writingState.references.length)refinementProposal={...refinementProposal,writingReferenceSnapshot:writingReferenceAudit(writingState)};
      if(scenarioState.references.length)refinementProposal={...refinementProposal,scenarioEvidenceSnapshot:scenarioState};
      const quality=assertLetterLength(refinementProposal.proposedDraft,{mode:letterLengthMode,maxWords:coverLetterRefinementMaxWords,advertUrl:review.formData.jobAdvertLink});
      refinementProposal={...refinementProposal,letterLengthMode,quality,qualityAdvertUrl:review.formData.jobAdvertLink};if(refinementProposal.polishParameters)refinementProposal={...refinementProposal,polishParameters:{...refinementProposal.polishParameters,words:quality.wordCount,narrativeParagraphs:quality.narrativeParagraphs,targetWords:quality.targetMinimum+'–'+quality.maximumWords}};
      rejectedRefinementProposal=null;
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        if(error.code==='REFINEMENT_LENGTH_EXCEEDED'){rejectedRefinementProposal=error.rejectedProposal||{...refinementProposal,letterLengthMode,quality:error.quality,lengthCheckFailed:true,warnings:[error.message]};rejectedRefinementProposal={...rejectedRefinementProposal,attemptMetadata:error.attemptMetadata||null};}
        writeDiagnostic('refinement_failed', { requestId, reviewId,
          ...describeRefinementFailure(error) });
        refinementLastAttempt = error.attemptMetadata || buildPolishingAttempt({requestModel:error.code === 'REFINEMENT_MODEL_INVALID' ? null : polishingModel,
          durationMs:Date.now()-actionStartedAt,tone:letterTone,
          webSearchEnabled:formBody.values.has('webSearchEnabled') ? formBody.values.getAll('webSearchEnabled').includes('true') : true,
          outcome:'failed',errorCode:describeRefinementFailure(error).errorCode});
        const failedProposal = {proposedDraft:'',warnings:[['SCENARIO_SELECTION_INVALID','WRITING_REFERENCE_INVALID'].includes(error.code)||['REFINEMENT_LENGTH_EXCEEDED','REFINEMENT_LENGTH_INVALID'].includes(error.code)?error.message:formatRefinementFailure(error)]};
        refinementProposal = retainSuccessfulProposal(reviewStore.get(reviewId)?.refinementProposal, failedProposal);
      }

      refinementLastAttempt = refinementLastAttempt || refinementProposal.attemptMetadata || null;
      writeDiagnostic('refinement_attempt_metrics', {
        requestId, reviewId,
        ...refinementAttemptLogFields(refinementLastAttempt)
      });
      writeDiagnostic('refinement_completed', {
        requestId,
        reviewId,
        proposalWordCount: wordCount(refinementProposal.proposedDraft),
        warningCount: Array.isArray(refinementProposal.warnings)
          ? refinementProposal.warnings.length
          : 0,
        durationMs: Date.now() - actionStartedAt
      });

      reviewStore.set(reviewId, {
        ...(reviewStore.get(reviewId) || review),
        letterTone,
        polishingModel,
        letterLengthMode,
        rejectedRefinementProposal,
        refinementLastAttempt,
        refinementProposal
      });

      await renderReview(200, refinementProposal);
      return;
    }

    if (method === 'GET' && url.pathname === '/subject-editors.js') {
      try {const code=await readFile(join(__dirname,'subject-editors.js'),'utf8');sendText(response,200,code,{'content-type':'application/javascript'});}
      catch {sendText(response,500,'Local subject controls unavailable.');}
      return;
    }
    if (method === 'POST' && url.pathname === '/review-subject-save') {
      const formBody=await readFormBody(request);
      if(formBody.error){sendJson(response,formBody.error.statusCode,{ok:false,error:formBody.error.message});return;}
      const reviewId=String(formBody.values.get('reviewId')||'').trim();
      const review=reviewStore.get(reviewId);
      if(!review){sendJson(response,410,{ok:false,error:'This review expired. Prepare the application again.'});return;}
      try {
        const updated=reviewWithSavedSubject(review,formBody.values.get('subject'));
        reviewStore.set(reviewId,updated);
        sendJson(response,200,{ok:true,subject:updated.currentDraftSubject});
      }catch(error){if(String(error.code||'').startsWith('REVIEW_STORE_'))throw error;sendJson(response,error.statusCode||400,{ok:false,error:'The application needs a valid single-line subject of at most 300 characters.'});}
      return;
    }

    if (method === 'POST' && url.pathname === '/cover-letter-refinement/apply') {
      const actionStartedAt = Date.now();

      writeDiagnostic('refinement_apply_requested', {
        requestId
      });

      const formBody = await readFormBody(request);

      if (formBody.error) {
        sendText(
          response,
          formBody.error.statusCode,
          formBody.error.message
        );
        return;
      }

      const reviewId = String(
        formBody.values.get('reviewId') || ''
      ).trim();

      const review = reviewStore.get(reviewId);

      if (!review) {
        sendHtml(
          response,
          410,
          renderApplicationForm({
            errors: [
              'This application review is no longer available. Please prepare the application again.'
            ]
          })
        );
        return;
      }

      try{requireConfirmedApplicationRole(review.formData);}catch(error){sendHtml(response,409,await renderCompleteReview({reviewId,applicationRoleMessage:error.message}));return;}

      if(review.refinementProposal?.scenarioEvidenceSnapshot?.references?.length){try{const state=review.refinementProposal.scenarioEvidenceSnapshot;resolveScenarioSelection(assignmentEvidenceStore,state.references);if(JSON.stringify(review.polishingScenarios?.references||[])!==JSON.stringify(state.references))throw Object.assign(new Error('Scenario selection changed after this proposal. Request a fresh reviewed polish.'),{statusCode:409});}catch(error){sendHtml(response,error.statusCode||409,await renderCompleteReview({reviewId,refinementProposal:{...review.refinementProposal,warnings:[...(review.refinementProposal.warnings||[]),error.message]}}));return;}}
      if(review.refinementProposal?.writingReferenceSnapshot?.references?.length){try{assertWritingReferenceSnapshot(getWritingReferenceLibrary(),review.refinementProposal.writingReferenceSnapshot);}catch(error){sendHtml(response,error.statusCode||409,await renderCompleteReview({reviewId,refinementProposal:{...review.refinementProposal,warnings:[...(review.refinementProposal.warnings||[]),error.message]}}));return;}}
      let proposedDraftPlainText = String(
        review.refinementProposal?.proposedDraft || ''
      ).trim();

      if (!proposedDraftPlainText) {
        sendHtml(
          response,
          400,
          await renderCompleteReview({
            formData: review.formData,
            prepared: review.prepared,
            reviewId,
            research: review.research,
            currentDraftPlainText: review.currentDraftPlainText,
            refinementProposal: {
              proposedDraft: '',
              warnings: [
                'There is no refinement proposal available to apply.'
              ]
            }
          })
        );
        return;
      }

      let editedProposalSnapshot=null;const hasEditedProposal=formBody.values.has('editedProposalHtml')||formBody.values.has('editedProposalPlainText');
      if(hasEditedProposal){const expected=createHash('sha256').update(String(review.refinementProposal.proposedDraft||'')).digest('hex');if(formBody.values.get('proposalBodyVersion')!==expected){sendHtml(response,409,await renderCompleteReview({reviewId,refinementProposal:{...review.refinementProposal,warnings:[...(review.refinementProposal.warnings||[]),'Proposal changed after this page opened. Current letter was not changed; review the current proposal again.']}}));return;}
      try{editedProposalSnapshot=snapshotMessage(String(formBody.values.get('editedProposalPlainText')||''),String(formBody.values.get('editedProposalHtml')||''),review.formData.jobAdvertLink||'');proposedDraftPlainText=editedProposalSnapshot.bodyPlainText;}catch(error){sendHtml(response,400,await renderCompleteReview({reviewId,refinementProposal:{...review.refinementProposal,warnings:[...(review.refinementProposal.warnings||[]),'Edited proposal not accepted: '+error.message]}}));return;}}
      let acceptedSubject;
      try {
        acceptedSubject=normalizeSubject(formBody.values.has('proposedSubject')
          ? formBody.values.get('proposedSubject')
          : review.refinementProposal?.proposedSubject ?? currentReviewSubject(review));
      }catch(error){
        await renderReviewSubjectFailure();
        return;
      }
      async function renderReviewSubjectFailure() {
        sendHtml(response,400,await renderCompleteReview({reviewId,
          refinementProposal:{...review.refinementProposal,
            proposedSubject:formBody.values.get('proposedSubject')??'',
            warnings:[...(review.refinementProposal?.warnings||[]),'The application needs a valid single-line subject of at most 300 characters.']}}));
      }

      let acceptance;
      // "Use it anyway": a deliberate override of the length limit only; every other check still applies. Recorded in history.
      let lengthOverride=null;const overrideRequested=formBody.values.get('acceptOverLength')==='true';

      try {
        try{assertLetterLength(proposedDraftPlainText,{mode:review.refinementProposal.letterLengthMode||'standard',maxWords:coverLetterRefinementMaxWords,advertUrl:review.formData.jobAdvertLink});}
        catch(lengthError){if(lengthError.code!=='REFINEMENT_LENGTH_EXCEEDED'||!overrideRequested)throw lengthError;const q=lengthError.quality||{};lengthOverride={wordCount:q.wordCount,maximumWords:q.maximumWords,mode:q.mode||review.refinementProposal.letterLengthMode||'standard',at:new Date().toISOString()};}
        extractOutreachExperienceBody(proposedDraftPlainText, ['micro1']);
        acceptance = acceptRefinedCoverLetter({
          originalDraftPlainText: review.currentDraftPlainText,
          proposedDraftPlainText,
          accepted: true
        });
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        // Applying never blanks the proposal. Over the length limit: say so plainly and offer the Extended review (no AI call).
        const lengthFailed=error.code==='REFINEMENT_LENGTH_EXCEEDED',applyMessage=lengthFailed?error.message.replace(' Retain for review; no automatic retry or truncation.','')+' Your current letter is unchanged. Shorten the proposal and apply again, or use "Review retained proposal in Extended mode" (no AI call).':['REFINEMENT_LENGTH_INVALID'].includes(error.code)?error.message:formatRefinementFailure(error);
        writeDiagnostic('refinement_apply_failed',{requestId,reviewId,...describeRefinementFailure(error)});
        {const draft=editedProposalSnapshot?editedProposalSnapshot.bodyPlainText:proposedDraftPlainText;const retained={...review.refinementProposal,...(editedProposalSnapshot?{proposedDraft:editedProposalSnapshot.bodyPlainText,proposedDraftHtml:editedProposalSnapshot.bodyHtml,highlightPhrases:[],highlightSelections:[]}:{}),warnings:[...(review.refinementProposal.warnings||[]).filter(w=>!/REFINEMENT_LENGTH_EXCEEDED|limit is \d+/.test(w)),applyMessage]};
        const rejected=lengthFailed?{...retained,proposedDraft:draft,quality:error.quality,lengthCheckFailed:true,letterLengthMode:review.refinementProposal.letterLengthMode||'standard',warnings:[applyMessage]}:review.rejectedRefinementProposal||null;
        reviewStore.set(reviewId,{...review,refinementProposal:retained,rejectedRefinementProposal:rejected});sendHtml(response,400,await renderCompleteReview({reviewId}));return;}
      }

      const appliedAt = new Date().toISOString();

      const updatedReview = {
        ...review,
        currentLetterLengthMode:review.refinementProposal.letterLengthMode||'standard',
        currentDraftPlainText: acceptance.finalDraftPlainText,
        currentDraftHtml:editedProposalSnapshot?.bodyHtml||renderCoverLetterHtml(acceptance.finalDraftPlainText,review.refinementProposal.highlightSelections?.length?review.refinementProposal.highlightSelections:review.refinementProposal.highlightPhrases),
        currentDraftSubject: acceptedSubject,
        currentHighlightPhrases: [],
        currentHighlightSelections:hasEditedProposal?[]:review.refinementProposal.highlightSelections||[],
        refinementProposal: {
          appliedMessage:lengthOverride
            ? `Current draft updated from your approved refinement proposal. You chose to use it at ${lengthOverride.wordCount} words, over the ${lengthOverride.mode} limit of ${lengthOverride.maximumWords}.`
            : 'Current draft updated from your approved refinement proposal.'
        },
        rejectedRefinementProposal: null,
        refinementHistory: [
          ...(Array.isArray(review.refinementHistory)
            ? review.refinementHistory
            : []),
          {
            appliedAt,
            ...(review.refinementProposal.writingReferenceSnapshot?{writingReferenceSnapshot:structuredClone(review.refinementProposal.writingReferenceSnapshot)}:{}),
            ...(review.refinementProposal.scenarioEvidenceSnapshot?{scenarioEvidenceSnapshot:structuredClone(review.refinementProposal.scenarioEvidenceSnapshot)}:{}),
            ...(lengthOverride?{lengthOverride}:{}),
            previousSubject: currentReviewSubject(review),
            appliedSubject: acceptedSubject,
            previousDraft: review.currentDraftPlainText,
            appliedDraft: acceptance.finalDraftPlainText
          }
        ]
      };

      reviewStore.set(reviewId, updatedReview);

      writeDiagnostic('refinement_applied', {
        requestId,
        reviewId,
        historyCount: updatedReview.refinementHistory.length,
        previousWordCount: wordCount(review.currentDraftPlainText),
        currentWordCount: wordCount(updatedReview.currentDraftPlainText),
        lengthOverridden: Boolean(lengthOverride),
        durationMs: Date.now() - actionStartedAt
      });

      sendHtml(
        response,
        200,
        (await renderCompleteReview({
          formData: updatedReview.formData,
          prepared: updatedReview.prepared,
          reviewId,
          research: updatedReview.research,
          currentDraftPlainText: updatedReview.currentDraftPlainText,
          refinementProposal: updatedReview.refinementProposal,
          selectedCvRoleCode: updatedReview.selectedCvRoleCode,
          cvSelectionMessage: updatedReview.cvSelectionMessage
        })).replace('id="cover-letter-draft"','id="cover-letter-draft" data-focus-after-accept="true"')
      );
      return;
    }

    if (
      method === "POST" &&
      (url.pathname === "/api/recruiters/import" ||
        url.pathname === "/api/recruiter-contacts/import")
    ) {
      if (!recruiterContactImportService) {
        sendJson(response, 503, {
          ok: false,
          error: "Recruiter contact import is not configured."
        });
        return;
      }

      try {
        const body = await readJsonBody(request);

        const result = await recruiterContactImportService.import({
          sourceUrl: body.sourceUrl,
          emailDomain: body.emailDomain,
          recruiters: body.recruiters
        });

        writeDiagnostic("recruiter_contacts_imported", {
          requestId,
          organisationId: result.organisationId,
          imported: result.imported,
          duplicates: result.duplicates
        });

        sendJson(response, 200, result);
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error
            ? error.message
            : "Recruiter contact import failed."
        });
      }

      return;
    }
 
    if (
      method === "POST" &&
      /^\/api\/reviews\/[^/]+\/resolve-email-domain$/.test(url.pathname)
    ) {
      const reviewId = decodeURIComponent(url.pathname.split("/")[3]);
      const review = reviewStore.get(reviewId);

      if (!review) {
        sendJson(response, 404, {
          ok: false,
          error: "Application review not found."
        });
        return;
      }

      try {
        const body = await readJsonBody(request);

        const job = await emailDomainResolutionService.startResolution({
          reviewId,
          organisation: {
            name: review.formData.organisationName,
            url: review.formData.organisationUrl,
            linkedinUrl: body.linkedinUrl || ""
          }
        });

        sendJson(response, 202, {
          ok: true,
          job
        });
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error
            ? error.message
            : "Email-domain resolution could not be started."
        });
      }

      return;
    }

    if (
      method === "GET" &&
      /^\/api\/email-domain-jobs\/[^/]+$/.test(url.pathname)
    ) {
      const jobId = decodeURIComponent(url.pathname.split("/").pop());
      const job = await emailDomainResolutionService.getJob(jobId);

      if (!job) {
        sendJson(response, 404, {
          ok: false,
          code: "EMAIL_DOMAIN_JOB_INTERRUPTED",
          error: "This email-domain lookup was interrupted, usually because the app restarted. Click Find email domain to start it again."
        });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        job
      });
      return;
    }

    if (
      method === "GET" &&
      /^\/api\/reviews\/[^/]+\/email-domain$/.test(url.pathname)
    ) {
      const reviewId = decodeURIComponent(url.pathname.split("/")[3]);
      const resolution = await emailDomainResolutionService.getResolution(
        reviewId
      );

      sendJson(response, 200, {
        ok: true,
        resolution
      });
      return;
    }

    if (
      method === "GET" &&
      url.pathname === "/api/recruiter-contacts/linking"
    ) {
      if (!recruiterContactStore) {
        sendJson(response, 503, {
          ok: false,
          error: "Recruiter contact store is not configured."
        });
        return;
      }

      try {
        const reviewId = url.searchParams.get("reviewId");

        if (!reviewId) {
          sendJson(response, 400, {
            ok: false,
            error: "reviewId is required."
          });
          return;
        }

        const review = reviewStore.get(reviewId);

        if (!review) {
          sendJson(response, 404, {
            ok: false,
            error: "Application review not found."
          });
          return;
        }

        const contactLinking = await loadContactLinking(reviewId);

        sendJson(response, 200, {
          ok: true,
          linked: contactLinking.linked || [],
          unlinked: contactLinking.unlinked || []
        });
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error
            ? error.message
            : "Unable to load imported contacts."
        });
      }

      return;
    }

    if (
      method === "POST" &&
      url.pathname === "/api/recruiter-contacts/delete"
    ) {
      if (!recruiterContactStore) {
        sendJson(response, 503, {
          ok: false,
          error: "Recruiter contact store is not configured."
        });
        return;
      }

      try {
        const body = await readJsonBody(request);
        const reviewId = body.reviewId;
        const review = reviewStore.get(reviewId);

        if (!review) {
          sendJson(response, 404, {
            ok: false,
            error: "Application review not found."
          });
          return;
        }

        const organisationId = deriveReviewOrganisationId(
          review.formData
        );

        let deletedContacts;

        if (body.action !== undefined) {
          if (!["deleteSelected", "clearDisplayed"].includes(body.action)) {
            sendJson(response, 400, {
              ok: false,
              error: "Unsupported contact deletion action."
            });
            return;
          }

          if (
            !Array.isArray(body.contactIds) ||
            body.contactIds.some((id) =>
              typeof id !== "string" || !id.trim()
            )
          ) {
            sendJson(response, 400, {
              ok: false,
              error: "Contact IDs must be an array of non-empty strings."
            });
            return;
          }

          const explicitIds = [...new Set(
            body.contactIds.map((id) => id.trim())
          )];

          if (!explicitIds.length) {
            if (body.action === "deleteSelected") {
              sendJson(response, 400, {
                ok: false,
                error: "Select at least one imported contact to delete."
              });
            } else {
              sendJson(response, 200, {
                ok: true,
                deleted: 0,
                deletedContacts: []
              });
            }
            return;
          }

          deletedContacts =
            await recruiterContactStore.deleteUnlinkedContacts({
              reviewId,
              contactIds: explicitIds
            });
        } else {
          // Preserve the existing organisation-scoped API contract.
          deletedContacts =
            await recruiterContactStore.deleteUnlinkedContacts({
              organisationId,
              reviewId,
              contactIds: body.contactIds || []
            });
        }

        writeDiagnostic("recruiter_contacts_deleted", {
          requestId,
          reviewId,
          organisationId,
          deleted: deletedContacts.length
        });

        sendJson(response, 200, {
          ok: true,
          deleted: deletedContacts.length,
          deletedContacts
        });
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error
            ? error.message
            : "Unable to delete imported contacts."
        });
      }

      return;
    }


    if (
      method === "POST" &&
      url.pathname === "/api/recruiter-contacts/unlink"
    ) {
      if (!recruiterContactStore) {
        sendJson(response, 503, {
          ok: false,
          error: "Recruiter contact store is not configured."
        });
        return;
      }

      try {
        const body = await readJsonBody(request);
        const reviewId = typeof body.reviewId === "string"
          ? body.reviewId.trim()
          : "";

        if (!reviewStore.has(reviewId)) {
          sendJson(response, 404, {
            ok: false,
            error: "Application review not found."
          });
          return;
        }

        if (!["unlinkSelected", "clearDisplayed"].includes(body.action)) {
          sendJson(response, 400, {
            ok: false,
            error: "Unsupported contact unlink action."
          });
          return;
        }

        if (
          !Array.isArray(body.contactIds) ||
          body.contactIds.some((id) =>
            typeof id !== "string" || !id.trim()
          )
        ) {
          sendJson(response, 400, {
            ok: false,
            error: "Contact IDs must be an array of non-empty strings."
          });
          return;
        }

        const contactIds = [...new Set(
          body.contactIds.map((id) => id.trim())
        )];

        if (!contactIds.length && body.action === "unlinkSelected") {
          sendJson(response, 400, {
            ok: false,
            error: "Select at least one linked contact to unlink."
          });
          return;
        }

        const unlinkedContacts = await recruiterContactStore.unlinkFromReview({
          reviewId,
          contactIds
        });

        sendJson(response, 200, {
          ok: true,
          unlinked: unlinkedContacts.length,
          unlinkedContacts
        });
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        sendJson(response, 400, {
          ok: false,
          error: "Unable to unlink contacts from this application."
        });
      }
      return;
    }


    if (
      method === "POST" &&
      url.pathname === "/api/recruiter-contacts/permanent-delete"
    ) {
      if (!recruiterContactStore) {
        sendJson(response, 503, {
          ok: false,
          error: "Recruiter contact store is not configured."
        });
        return;
      }

      let body;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        sendJson(response, 400, {
          ok: false,
          error: "Request body must be valid JSON."
        });
        return;
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        sendJson(response, 400, {
          ok: false,
          error: "Request body must be an object."
        });
        return;
      }

      const reviewId = typeof body.reviewId === "string"
        ? body.reviewId.trim()
        : "";

      if (!reviewStore.has(reviewId)) {
        sendJson(response, 404, {
          ok: false,
          error: "Application review not found."
        });
        return;
      }

      if (
        body.confirmedPermanent !== true ||
        !Array.isArray(body.contactIds) ||
        !body.contactIds.length ||
        body.contactIds.some((id) =>
          typeof id !== "string" || !id.trim()
        )
      ) {
        sendJson(response, 400, {
          ok: false,
          error: "Confirm permanent deletion and select explicit contact IDs."
        });
        return;
      }

      const contactIds = [...new Set(body.contactIds.map((id) => id.trim()))];

      try {
        const selectedIds = new Set(contactIds);
        const contacts = await recruiterContactStore.listAll();

        // This button is for available rows, not current linked rows.
        const linkedToCurrentReview = contacts.some((contact) =>
          selectedIds.has(contact.id) &&
          Array.isArray(contact.linkedApplicationReviewIds) &&
          contact.linkedApplicationReviewIds.includes(reviewId)
        );

        if (linkedToCurrentReview) {
          sendJson(response, 409, {
            ok: false,
            error:
              "A selected contact is now linked to this application. " +
              "Refresh contacts, unlink it first, then select it in the available table."
          });
          return;
        }

        const result = await recruiterContactStore.permanentlyDeleteContacts({
          contactIds,
          reviewId
        });

        sendJson(response, 200, {
          ok: true,
          deleted: result.deletedContacts.length,
          deletedContacts: result.deletedContacts,
          backupCreated: result.backupCreated
        });
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        if (error.code === "CONTACT_LINKED_TO_CURRENT_REVIEW") {
          sendJson(response, 409, {
            ok: false,
            error: error.message
          });
          return;
        }

        sendJson(response, 500, {
          ok: false,
          error:
            "Permanent deletion could not be completed. " +
            "Check contact-store file permissions and the server terminal."
        });
      }
      return;
    }

    if (method === 'GET' && url.pathname === '/review-page.js') {
      try {
        const content = await readFile(
          join(__dirname, 'review-page.js'),
          'utf8'
        );

        sendText(response, 200, content, {
          'content-type': 'application/javascript'
        });
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        sendText(response, 500, 'Unable to load review-page.js');
      }

      return;
    }

    if (method !== 'GET' && method !== 'POST') {
      sendText(response, 405, 'Method Not Allowed', {
        allow: 'GET, POST'
      });
      return;
    }


    sendText(response, 404, 'Not Found');
  }
}


