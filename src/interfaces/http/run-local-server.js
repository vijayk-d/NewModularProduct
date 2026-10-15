#!/usr/bin/env node
import {createApplicationPackExporter} from '../../infrastructure/applications/application-pack-exporter.js';
import { gmailLoadedEnvironment } from '../../application/gmail-runtime-diagnostics.js';
import {createSqliteReviewStore} from '../../infrastructure/applications/sqlite-review-store.js';
import { createOutreachRepository } from '../../infrastructure/outreach/sqlite-outreach-repository.js';

import { createRecruiterContactStore } from "../../application/recruiter-contact-store.js";
import { createRecruiterContactImportService } from "../../application/import-recruiter-contacts.js";
import { loadRuntimeConfig } from '../../config/load-runtime-config.js';
import {
  createFileTemplateRepository
} from '../../infrastructure/templates/file-template-repository.js';
import {
  createJsonCvInventoryRepository
} from '../../infrastructure/cv-inventory/json-cv-inventory-repository.js';
import {
  prepareApplicationFromRepositories
} from '../../application/prepare-application-from-repositories.js';
import {
  researchOrganization
} from '../../application/research-organization.js';
import {
  createPerplexityCompanyResearchAdapter
} from '../../infrastructure/research/perplexity-company-research-adapter.js';
import {
  createPerplexityCoverLetterRefinementAdapter
} from '../../infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
import { createPdfTextExtractor } from '../../infrastructure/documents/pdf-text-extractor.js';
import { createSelectedCvEvidenceLoader } from '../../application/selected-cv-evidence-loader.js';
import { createLocalServer } from './create-local-server.js';

const DEFAULT_TEMPLATE_ID = 'standard-cover-letter';

const config = loadRuntimeConfig({
  env: process.env
});

process.stdout.write('[GMAIL_CONFIGURATION] '+JSON.stringify({environment:gmailLoadedEnvironment(process.env)},null,2)+'\n');

const localDiagnosticsEnabled =
  config.features.localDebugLogging === true;

if (localDiagnosticsEnabled) {
  process.stdout.write(
    `[LOCAL_DIAGNOSTICS] startup ` +
    `debugEnabled=true ` +
    `cvInventoryPathProvided=${Boolean(config.storage.cvInventoryPath)} ` +
    `templateDirectoryProvided=${Boolean(config.storage.templateDirectory)}\n`
  );
}
const templateRepository = createFileTemplateRepository({
  templateDirectory: config.storage.templateDirectory
});

const cvInventoryRepository = createJsonCvInventoryRepository({
  inventoryPath: config.storage.cvInventoryPath
});

const companyResearchPort = config.features.enablePerplexityResearch
  ? createPerplexityCompanyResearchAdapter({
      apiKey: config.integrations.perplexity.apiKey
    })
  : null;

const coverLetterRefinementPort =
  config.features.enableCoverLetterRefinement
    ? createPerplexityCoverLetterRefinementAdapter({
        apiKey: config.integrations.perplexity.apiKey,
        model: config.integrations.perplexity.refinementModel
      })
    : null;

import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../"
);

const recruiterContactStore = createRecruiterContactStore({
  filePath: path.join(
    projectRoot,
    "output",
    "imported-recruiter-contacts.json"
  )
});

const recruiterContactImportService = createRecruiterContactImportService({
  contactStore: recruiterContactStore
});

const outreachRepository = createOutreachRepository({
  filePath: path.join(projectRoot, "output", "outreach.db")
});

const cvEvidenceLoader = createSelectedCvEvidenceLoader({
  inventoryRepository: cvInventoryRepository,
  linkedinRelativePath: String(process.env.CANDIDATE_LINKEDIN_PDF || '').trim(),
  documentExtractor: createPdfTextExtractor({ cvFolder: process.env.CV_FOLDER })
});

const applicationReviewStore=createSqliteReviewStore({filePath:path.join(projectRoot,'output','application-reviews-v1.db')});
const server = createLocalServer({
  applicationReviewStore,
  applicationPackExporter:createApplicationPackExporter({cvFolder:config.storage.cvFolder}),
  cvEvidenceLoader,
  outreachRepository,
  recruiterContactImportService,
  recruiterContactStore,
  researchOrganization: companyResearchPort
    ? (request) => researchOrganization(
        request,
        { companyResearchPort }
      )
    : null,
  coverLetterRefinementPort,
  localDiagnosticsEnabled,
  prepareApplication(request) {
    if (localDiagnosticsEnabled) {
      process.stdout.write(
        `[LOCAL_DIAGNOSTICS] application_prepare_requested ` +
        `jobTitleProvided=${Boolean(request.jobDescriptionOverrides?.role)} ` +
        `jobDescriptionCharacters=${String(request.jobDescriptionText || '').length} ` +
        `jobAdvertProvided=${Boolean(request.jobAdvertLink)} ` +
        `preferredRoleCodeCount=${Array.isArray(request.preferredRoleCodes) ? request.preferredRoleCodes.length : 0} ` +
        `cvHighlightCount=${Array.isArray(request.cvHighlights) ? request.cvHighlights.length : 0}\n`
      );
    }

    return prepareApplicationFromRepositories({
      request,
      templateId: DEFAULT_TEMPLATE_ID,
      templateRepository,
      cvInventoryRepository
    }).then((prepared) => {
      if (localDiagnosticsEnabled) {
        process.stdout.write(
          `[LOCAL_DIAGNOSTICS] application_prepare_completed ` +
          `recommendedRoleCode=${prepared.recommendation?.bestCv?.role_code || 'none'} ` +
          `atsScore=${Number.isFinite(prepared.recommendation?.ats?.score) ? prepared.recommendation.ats.score : 'none'}\n`
        );
      }

      return prepared;
    });
  }
});

server.listen(config.server.port, config.server.host, () => {
  process.stdout.write(
    `Application UI available at http://${config.server.host}:${config.server.port}\n`
  );
});

server.on("close", () => {outreachRepository.close();applicationReviewStore.close();});


