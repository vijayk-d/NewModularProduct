import { refinementAttemptLogFields } from '../../application/refinement-attempt-log.js';
import { buildPolishingApiRequest } from '../../infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
import { estimatePolishingApiRequest } from '../../application/polishing-cost-estimator.js';
import { normalizeLetterTone } from '../../application/cover-letter-controls.js';
import { DEFAULT_POLISHING_MODEL, normalizePolishingModel, buildPolishingAttempt, retainSuccessfulProposal } from '../../application/polishing-model-catalog.js';
import { extractOutreachExperienceBody } from '../../application/compose-outreach-letter.js';
import { describeRefinementFailure, formatRefinementFailure } from '../../application/refinement-error-details.js';
import { createOutreachHttpHandler } from './outreach-queue-http.js';
import { currentReviewSubject, normalizeSubject, reviewWithSavedSubject } from '../../application/review-subject.js';
import { createPerplexityClient } from "../../infrastructure/perplexity-client.js";
import { createEmailDomainResolutionService } from "../../application/email-domain-resolution-service.js";
import { renderApplicationReview, renderRefinementPanel, renderOrganisationResearch, renderField, renderAdvertLink, getSelectableCompanyValues, renderResearchSource, renderOptionalDetail , renderApplicationForm, escapeHtml} from './rendering.js';
import { readFormBody } from './form-body.js';
import { sendText, sendHtml, sendJson } from './responses.js';
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { acceptRefinedCoverLetter } from '../../application/accept-refined-cover-letter.js';
import { attachReviewPageListeners } from './review-page.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const reviewStore = new Map();

import { createDiagnosticWriter } from './diagnostics.js';

const debugEnabled = process.env.LOCAL_DEBUG === 'true';
const localDiagnosticsEnabled = debugEnabled;

const writeDiagnostic = createDiagnosticWriter({
  enabled: localDiagnosticsEnabled
  // Keep any other existing options exactly as they were
});

function splitValues(value = '', separator) {
  return String(value)
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeFormData(values) {
return {
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
  jobDescriptionText: String(
    values.get('jobDescriptionText') || ''
  ).trim(),
  cvHighlights: splitValues(values.get('cvHighlights'), /\r?\n/)
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
  researchOrganization = null,
  coverLetterRefinementPort = null,
  cvEvidenceLoader = null,
  localDiagnosticsEnabled = false,
  diagnosticsWriter = process.stdout,
} = {}) {
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
    recruiterContactStore
  });

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
      unlinked: contacts.filter((contact) =>
        !Array.isArray(contact.linkedApplicationReviewIds) ||
        !contact.linkedApplicationReviewIds.includes(reviewId)
      ),
      linked: contacts.filter((contact) =>
        Array.isArray(contact.linkedApplicationReviewIds) &&
        contact.linkedApplicationReviewIds.includes(reviewId)
      )
    };
  }

  const writeDiagnostic = createDiagnosticWriter({
    enabled: localDiagnosticsEnabled,
    writer: diagnosticsWriter
  });

// new changes to be addeduntil here
  const wordCount = (value = '') => String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;


  async function renderCompleteReview(options) {
    const stored = reviewStore.get(options.reviewId);
    const base = stored ? {
      formData: stored.formData,
      prepared: stored.prepared,
      research: stored.research,
      currentDraftPlainText: stored.currentDraftPlainText,
      currentDraftSubject: currentReviewSubject(stored),
      currentHighlightPhrases: stored.currentHighlightPhrases || [],
      letterTone: stored.letterTone || 'professional',
      polishingModel: stored.polishingModel || DEFAULT_POLISHING_MODEL,
      polishingModelExplicit: Boolean(stored.polishingModel),
      refinementLastAttempt: stored.refinementLastAttempt || null,
      refinementProposal: stored.refinementProposal,
      selectedCvRoleCode: stored.selectedCvRoleCode,
      cvSelectionMessage: stored.cvSelectionMessage
    } : {};

    return renderApplicationReview({
      ...base,
      ...options,
      contacts: await loadReviewContacts(options.reviewId),
      contactLinking: await loadContactLinking(options.reviewId)
    });
  }


  function isContactStoreLoadError(error) {
    return [
      "CONTACT_STORE_INVALID",
      "CONTACT_STORE_READ_FAILED"
    ].includes(error?.code);
  }

  function sendSafeRequestFailure(request, response, error) {
    if (response.writableEnded || response.destroyed) return;
    if (response.headersSent) {
      response.destroy();
      return;
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

  const handleOutreach = createOutreachHttpHandler({
    repository: outreachRepository, contactStore: recruiterContactStore,
    getReview: (id) => reviewStore.get(id)
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
    const method = request.method || 'GET';
    const url = new URL(request.url || '/', 'http://localhost');
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

      const formBody = await readFormBody(request);

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

        const prepared = await prepareApplication({
        jobDescriptionText: formData.jobDescriptionText,
        jobDescriptionOverrides: {
          role: formData.jobTitle
        },
        recruiterName: formData.stakeholderSource,
        jobAdvertLink: formData.jobAdvertLink,
        jobReference: formData.jobReference,
        preferredRoleCodes: formData.preferredRoleCodes,
        cvHighlights: formData.cvHighlights
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
        selectedCvRoleCode: prepared.recommendation?.bestCv?.role_code || '',
        cvSelectionMessage: '',
        createdAt: Date.now()
      });

        sendHtml(
          response,
          200,
          await renderCompleteReview({
            formData,
            prepared,
            reviewId,
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

        const emailDomain = String(body.emailDomain || "")
          .trim()
          .toLowerCase();

        const labels = emailDomain.split(".");
        const blocked = [
          "linkedin.com", "gmail.com", "googlemail.com",
          "outlook.com", "hotmail.com", "yahoo.com", "icloud.com",
          "example.com", "example.org", "example.net"
        ];

        const valid =
          emailDomain.length <= 253 &&
          labels.length >= 2 &&
          labels.every((label) =>
            label.length <= 63 &&
            /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
          ) &&
          /^[a-z]{2,63}$/.test(labels[labels.length - 1]) &&
          !blocked.some((domain) =>
            emailDomain === domain ||
            emailDomain.endsWith(`.${domain}`)
          );

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

      sendHtml(
        response,
        200,
        await renderCompleteReview({
          formData: review.formData,
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

    if (method === 'POST' && url.pathname === '/cover-letter-refinement/estimate') {
      const formBody = await readFormBody(request);
      if (formBody.error) {sendJson(response, formBody.error.statusCode, {ok:false,error:formBody.error.message});return;}
      const reviewId = String(formBody.values.get('reviewId') || '').trim();
      const review = reviewStore.get(reviewId);
      if (!review) {sendJson(response,410,{ok:false,error:'This review expired. Prepare it again; no provider call was made.'});return;}
      try {
        const selectedModel = normalizePolishingModel(formBody.values.get('polishingModel') || review.polishingModel || DEFAULT_POLISHING_MODEL);
        const cvEvidence = cvEvidenceLoader ? await cvEvidenceLoader(review) : {};
        const ids = formBody.values.getAll('selectedResearchPointIds').map(value=>String(value).trim());
        const selectedResearchPoints = getSelectableCompanyValues(review.research).filter(point=>ids.includes(point.id));
        const requestForEstimate = {...cvEvidence,draftPlainText:review.currentDraftPlainText,
          jobDescriptionSummary:review.formData.jobTitle,jobDescriptionText:review.formData.jobDescriptionText,
          selectedCvHighlights:Array.isArray(review.formData.cvHighlights)?review.formData.cvHighlights.map(value=>String(value||'').trim()).filter(value=>value&&value.toLowerCase()!=='null'):[],
          companyValues:selectedResearchPoints.map(point=>point.text),selectedResearchPoints,
          organisationName:review.formData.organisationName,organisationUrl:review.formData.organisationUrl,
          researchSources:Array.isArray(review.research?.sources)?review.research.sources:[],instructions:'',maxWords:450,
          letterTone:normalizeLetterTone(formBody.values.get('letterTone')||review.letterTone||'professional'),excludedEmployers:['micro1'],
          webSearchEnabled:formBody.values.getAll('webSearchEnabled').includes('true')};
        const apiBody = buildPolishingApiRequest(requestForEstimate,selectedModel);
        sendJson(response,200,{ok:true,...estimatePolishingApiRequest(apiBody)});
      } catch(error) {
        const known=['REFINEMENT_MODEL_INVALID','REFINEMENT_TONE_INVALID','CV_EVIDENCE_UNAVAILABLE','LINKEDIN_EVIDENCE_UNAVAILABLE'].includes(error.code);
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
            selectedCvRoleCode: review.selectedCvRoleCode,
            cvSelectionMessage: review.cvSelectionMessage,
            contacts: refinementReviewContacts,
            contactLinking: refinementContactLinking
          })
        );
      };

      if (typeof coverLetterRefinementPort?.refine !== 'function') {
        await renderReview(503, {
          proposedDraft: '',
          warnings: [
            'Cover-letter refinement is disabled. Enable ENABLE_COVER_LETTER_REFINEMENT and restart the local server.'
          ]
        });
        return;
      }

      if (!review.research || review.research.status !== 'found') {
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
           formBody.values.get('polishingConfirmedModel') !== formBody.values.get('polishingModel'))) {
        await renderReview(409,retainSuccessfulProposal(review.refinementProposal,{proposedDraft:'',
          warnings:['Review and confirm the local cost estimate before polishing. No provider call was made.']}));
        return;
      }

      const selectedIds = formBody.values
        .getAll('selectedResearchPointIds')
        .map((value) => String(value).trim())
        .filter(Boolean);

      const selectedResearchPoints = getSelectableCompanyValues(
        review.research
      ).filter((point) => selectedIds.includes(point.id));

      let refinementProposal;
      let letterTone = review.letterTone || 'professional';
      let polishingModel = review.polishingModel || DEFAULT_POLISHING_MODEL;
      let refinementLastAttempt = null;

      writeDiagnostic('refinement_provider_requested', {
        requestId,
        reviewId,
        selectedValueCount: selectedResearchPoints.length,
        cvHighlightCount: Array.isArray(review.formData.cvHighlights)
          ? review.formData.cvHighlights.length
          : 0
      });

      try {
      letterTone = normalizeLetterTone(formBody.values.get('letterTone') || letterTone);
      review.letterTone = letterTone;
      polishingModel = normalizePolishingModel(formBody.values.get('polishingModel') || polishingModel);
      review.polishingModel = polishingModel;
      const cvEvidence = cvEvidenceLoader ? await cvEvidenceLoader(review) : {};
      refinementProposal = await coverLetterRefinementPort.refine({
        ...cvEvidence,
        ...(formBody.values.has('polishingModel') || review.polishingModel !== DEFAULT_POLISHING_MODEL ? {polishingModel} : {}),
        letterTone,
        excludedEmployers: ['micro1'],
        ...(formBody.values.has('webSearchEnabled') ? {
          webSearchEnabled: formBody.values.getAll('webSearchEnabled').includes('true')
        } : {}),
        jobDescriptionText: review.formData.jobDescriptionText,
        draftPlainText: review.currentDraftPlainText,
        jobDescriptionSummary: review.formData.jobTitle,
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
        organisationUrl: review.formData.organisationUrl,
        researchSources: Array.isArray(review.research.sources)
          ? review.research.sources
          : [],
        instructions: "",
        maxWords: 450
      });
      if (refinementProposal.error) {
        const error = new Error(refinementProposal.error);
        error.code = refinementProposal.errorCode || 'REFINEMENT_FAILED';
        error.attemptMetadata = refinementProposal.attemptMetadata;
        error.refinementDetails = refinementProposal.failureDetails || {};
        throw error;
      }
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
        writeDiagnostic('refinement_failed', { requestId, reviewId,
          ...describeRefinementFailure(error) });
        refinementLastAttempt = error.attemptMetadata || buildPolishingAttempt({requestModel:error.code === 'REFINEMENT_MODEL_INVALID' ? null : polishingModel,
          durationMs:Date.now()-actionStartedAt,tone:letterTone,
          webSearchEnabled:formBody.values.has('webSearchEnabled') ? formBody.values.getAll('webSearchEnabled').includes('true') : true,
          outcome:'failed',errorCode:describeRefinementFailure(error).errorCode});
        const failedProposal = {proposedDraft:'',warnings:[formatRefinementFailure(error)]};
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
      }catch(error){sendJson(response,error.statusCode||400,{ok:false,error:'The application needs a valid single-line subject of at most 300 characters.'});}
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

      const proposedDraftPlainText = String(
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

      try {
        extractOutreachExperienceBody(proposedDraftPlainText, ['micro1']);
        acceptance = acceptRefinedCoverLetter({
          originalDraftPlainText: review.currentDraftPlainText,
          proposedDraftPlainText,
          accepted: true
        });
      } catch (error) {
        if (isContactStoreLoadError(error)) throw error;
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
                formatRefinementFailure(error)
              ]
            }
          })
        );
        return;
      }

      const appliedAt = new Date().toISOString();

      const updatedReview = {
        ...review,
        currentDraftPlainText: acceptance.finalDraftPlainText,
        currentDraftSubject: acceptedSubject,
        currentHighlightPhrases: review.refinementProposal.highlightPhrases || [],
        refinementProposal: {
          appliedMessage:
            'Current draft updated from your approved refinement proposal.'
        },
        refinementHistory: [
          ...(Array.isArray(review.refinementHistory)
            ? review.refinementHistory
            : []),
          {
            appliedAt,
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
          cvSelectionMessage: updatedReview.cvSelectionMessage
        })
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
          error: "Email-domain resolution job not found."
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
