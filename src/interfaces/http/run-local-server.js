#!/usr/bin/env node
import '../../config/apply-feature-toggles.js';
import {createAssignmentEvidenceStore} from '../../infrastructure/applications/sqlite-assignment-evidence.js';
import {createApplicationIntelligenceStore} from '../../infrastructure/applications/sqlite-application-intelligence.js';
import {createApplicationIntelligence} from '../../application/application-intelligence.js';
import {createApplicationPackExporter} from '../../infrastructure/applications/application-pack-exporter.js';
import {createTemplateCoverLetterDocuments} from '../../infrastructure/documents/template-cover-letter.js';
import {createSqliteJobImportStore} from '../../infrastructure/applications/sqlite-job-import-store.js';
import { gmailLoadedEnvironment } from '../../application/gmail-runtime-diagnostics.js';
import {createSqliteReviewStore} from '../../infrastructure/applications/sqlite-review-store.js';
import { createOutreachRepository } from '../../infrastructure/outreach/sqlite-outreach-repository.js';

import { createRecruiterContactStore } from "../../application/recruiter-contact-store.js";
import { createRecruiterContactImportService } from "../../application/import-recruiter-contacts.js";
import {deploymentRuntime} from '../../config/deployment-runtime.js';
import {createAchievementEvidenceService} from '../../application/achievement-evidence.js';
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
import { createCvDocumentAdapter } from '../../infrastructure/documents/cv-document-adapter.js';
import { createSelectedCvEvidenceLoader } from '../../application/selected-cv-evidence-loader.js';
import { createLocalServer } from './create-local-server.js';
import { installCvLibrary } from './cv-library-v1.js';
import {resolveCvLibraryRuntime,assertSharedCvReady} from '../../config/shared-cv-library-runtime.js';
import {resolveEvidenceLibraryPath} from '../../config/evidence-library-runtime.js';

const DEFAULT_TEMPLATE_ID = 'standard-cover-letter';
const deployment=deploymentRuntime({env:process.env,projectRoot:fileURLToPath(new URL('../../../',import.meta.url))});

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

const cvLibraryRuntime=resolveCvLibraryRuntime({env:process.env,mode:deployment.mode,projectRoot:fileURLToPath(new URL('../../../',import.meta.url)),server:config.server,legacyInventoryPath:config.storage.cvInventoryPath});
await assertSharedCvReady(cvLibraryRuntime,config.storage.cvFolder);
const cvInventoryRepository = createJsonCvInventoryRepository({
  inventoryPath: cvLibraryRuntime.inventoryPath
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
  filePath: deployment.contacts
});

const recruiterContactImportService = createRecruiterContactImportService({
  contactStore: recruiterContactStore
});

const outreachRepository = createOutreachRepository({
  filePath: deployment.outreach
});

const achievementEvidenceService=createAchievementEvidenceService({inventoryRepository:cvInventoryRepository,documentExtractor:createCvDocumentAdapter({cvFolder:process.env.CV_FOLDER})});
const cvEvidenceLoader = createSelectedCvEvidenceLoader({
  inventoryRepository: cvInventoryRepository,
  linkedinRelativePath: String(process.env.CANDIDATE_LINKEDIN_PDF || '').trim(),
  documentExtractor: createCvDocumentAdapter({ cvFolder: process.env.CV_FOLDER })
});

const applicationReviewStore=createSqliteReviewStore({filePath:deployment.reviews});
const jobImportService=createSqliteJobImportStore({filePath:deployment.imports});
let applicationIntelligence=null,applicationIntelligenceStore=null;
if(deployment.mode==='development'){
 try{applicationIntelligenceStore=createApplicationIntelligenceStore({filePath:path.join(deployment.state,'application-intelligence-v1.db')});applicationIntelligence=createApplicationIntelligence({reviews:applicationReviewStore,outreach:outreachRepository,store:applicationIntelligenceStore,inventory:cvInventoryRepository,documentExtractor:createCvDocumentAdapter({cvFolder:config.storage.cvFolder})});}
 catch{applicationIntelligenceStore?.close();applicationIntelligenceStore=null;console.warn('[APPLICATION_INTELLIGENCE] LOCAL_STORE_UNAVAILABLE');}
}

let assignmentEvidenceStore=null;
try{
 const filePath=resolveEvidenceLibraryPath({env:process.env,mode:deployment.mode,state:deployment.state});
 if(filePath)assignmentEvidenceStore=createAssignmentEvidenceStore({filePath});
}catch{console.warn('[ASSIGNMENT_EVIDENCE] LOCAL_STORE_UNAVAILABLE');}

const server = createLocalServer({
  assignmentEvidenceStore,
  applicationIntelligence,
  coverLetterRefinementMaxWords:config.application.coverLetterRefinementMaxWords,
  jobImportService,
  applicationReviewStore,
  applicationPackExporter:createApplicationPackExporter({cvFolder:config.storage.cvFolder,documents:createTemplateCoverLetterDocuments({stateDirectory:deployment.state}),cvInventory:cvInventoryRepository,candidateName:process.env.CANDIDATE_DISPLAY_NAME||'Vijay DAFAL'}),
  cvEvidenceLoader,
  cvDocumentAdapter:createCvDocumentAdapter({cvFolder:config.storage.cvFolder}),
  cvInventoryRepository,
  achievementEvidenceService,
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
      request: {
        ...request,
        candidateProfile: {
          ...(request.candidateProfile || {}),
          displayName: (
            String(process.env.CANDIDATE_DISPLAY_NAME || '').trim() ||
            String(request.candidateProfile?.displayName || '').trim() ||
            String(request.candidateProfile?.name || '').trim() ||
            String(request.candidateProfile?.firstName || '').trim()
          )
        }
      },
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

// CV_LIBRARY_SHARED_V1_BEGIN
if (cvLibraryRuntime.enabled) {
  installCvLibrary(server, {
    mode: deployment.mode,
    projectRoot,
    sharedDirectory: cvLibraryRuntime.sharedDirectory || '',
    cataloguePath: cvLibraryRuntime.cataloguePath,
    cvFolder: config.storage.cvFolder,
    privateDirectory: cvLibraryRuntime.privateDirectory,
    adapter: createCvDocumentAdapter({cvFolder: config.storage.cvFolder})
  });
}
// CV_LIBRARY_SHARED_V1_END

server.listen(config.server.port, config.server.host, () => {
  process.stdout.write(
    `Application UI available at http://${config.server.host}:${config.server.port}\n`
  );
});

server.on("close", () => {outreachRepository.close();applicationReviewStore.close();jobImportService.close();applicationIntelligenceStore?.close();assignmentEvidenceStore?.close();});



// Wait for active HTTP requests before closing persistent stores.
for(const signal of ['SIGINT','SIGTERM',...(process.platform==='win32'?['SIGBREAK']:[])])process.on(signal,()=>server.close(()=>process.exit(0)));
