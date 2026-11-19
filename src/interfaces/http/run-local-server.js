#!/usr/bin/env node
import '../../config/apply-feature-toggles.js';
import {createAssignmentEvidenceStore} from '../../infrastructure/applications/sqlite-assignment-evidence.js';
import {createApplicationIntelligenceStore} from '../../infrastructure/applications/sqlite-application-intelligence.js';
import {createApplicationIntelligence} from '../../application/application-intelligence.js';
import {createApplicationPackExporter} from '../../infrastructure/applications/application-pack-exporter.js';
import {createCvPolisher} from '../../infrastructure/refinement/perplexity-cv-polishing-adapter.js';
import {createWordPdfConverter} from '../../infrastructure/documents/word-pdf-converter.js';
import {createTailoredPdfFiles} from '../../infrastructure/applications/tailored-cv-pdf-files.js';
import {createApplicationOutputFolder} from '../../infrastructure/applications/application-output-folder.js';
import {createWorkflowAutomationStore} from '../../infrastructure/applications/sqlite-workflow-automation-store.js';
import {createOrganisationResearchService} from '../../application/organisation-research-cache.js';
import {providerTimeLimitMs} from '../../infrastructure/provider-time-limit.js';
import {createJsonEmailDomainStore} from '../../infrastructure/applications/json-email-domain-store.js';
import {installCrashHandlers,takePreviousCrash} from '../../infrastructure/crash-record.js';
import {createSystemCheckProbes} from '../../infrastructure/system-check-probes.js';
import {runSystemCheck} from '../../application/system-check.js';
import {createApplicationInsightsStore} from '../../infrastructure/applications/sqlite-application-insights-store.js';
import {createApplicationAnswersStore} from '../../infrastructure/applications/sqlite-application-answers-store.js';
import {createQuestionAnswerWriter} from '../../infrastructure/refinement/perplexity-question-answer-adapter.js';
import {createInsightsSnapshot} from '../../application/insights-snapshot.js';
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
import {createCvTailoringStore} from '../../infrastructure/applications/sqlite-cv-tailoring-store.js';
import {createCvTailoringService} from '../../application/cv-tailoring.js';
import {documentWorker} from '../../infrastructure/documents/cv-document-adapter.js';
import {createWordCvLocator} from '../../infrastructure/documents/word-cv-locator.js';

const DEFAULT_TEMPLATE_ID = 'standard-cover-letter';
const deployment=deploymentRuntime({env:process.env,projectRoot:fileURLToPath(new URL('../../../',import.meta.url))});
// An unexpected error stops the app with a clear [CRASH] line and a small record; the next start reports it once.
installCrashHandlers({stateDirectory:deployment.state});
{const previous=takePreviousCrash(deployment.state);if(previous)console.warn(`[STARTUP] The previous run stopped unexpectedly at ${previous.at||'an unknown time'} (${previous.kind}: ${previous.name}${previous.code?' '+previous.code:''}${previous.frames?.[0]?' at '+previous.frames[0]:''}). Check the log from that time.`);}

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
// Automatic research runs while a new review page loads, so it gets a shorter limit (half, at most 45 s).
const automaticResearchPort = config.features.enablePerplexityResearch
  ? createPerplexityCompanyResearchAdapter({
      apiKey: config.integrations.perplexity.apiKey,
      timeoutMs: Math.min(45000, Math.round(providerTimeLimitMs() / 2))
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

// Workflow automation keeps its own new database; if it cannot open, automation is simply off.
let workflowAutomationStore=null;
try{workflowAutomationStore=createWorkflowAutomationStore({filePath:path.join(deployment.state,'workflow-automation-v1.db')});}catch{console.warn('[WORKFLOW_AUTOMATION] LOCAL_STORE_UNAVAILABLE');}

// Tailored CVs keep their own new database; if it cannot open, the feature is simply off.
// Their PDF copies (made by Word) live in their own state folder; the Gmail workers attach them from TAILORED_CV_FOLDER.
process.env.TAILORED_CV_FOLDER=path.join(deployment.state,'tailored-cv-pdfs');
const candidateDisplayName=process.env.CANDIDATE_DISPLAY_NAME||'Vijay DAFAL';
let cvTailoringStore=null,cvTailoringService=null;
try{cvTailoringStore=createCvTailoringStore({filePath:path.join(deployment.state,'cv-tailoring-v1.db')});cvTailoringService=createCvTailoringService({pdfConverter:createWordPdfConverter(),pdfFiles:createTailoredPdfFiles({folder:process.env.TAILORED_CV_FOLDER}),polisher:createCvPolisher({apiKey:config.integrations.perplexity.apiKey,enabled:config.features.enableCoverLetterRefinement}),reviews:applicationReviewStore,store:cvTailoringStore,worker:payload=>documentWorker(payload),cvFolder:config.storage.cvFolder,locateWord:createWordCvLocator({cvFolder:config.storage.cvFolder}),cvLibrary:async()=>{const data=await cvInventoryRepository.load();return data?.cv_inventory?.cvs||data?.cvs||[];}});}catch{cvTailoringStore?.close();cvTailoringStore=null;console.warn('[CV_TAILORING] LOCAL_STORE_UNAVAILABLE');}

// Application outcomes (insights phase 1) keep their own new database; if it cannot open, recording is simply off.
let insightsStore=null;
try{insightsStore=createApplicationInsightsStore({filePath:path.join(deployment.state,'application-insights-v1.db')});}catch{console.warn('[INSIGHTS] LOCAL_STORE_UNAVAILABLE');}

// Saved portal answers keep their own new database; if it cannot open, the questions helper is simply off.
let answersStore=null;
try{answersStore=createApplicationAnswersStore({filePath:path.join(deployment.state,'application-answers-v1.db')});}catch{console.warn('[QUESTIONS] LOCAL_STORE_UNAVAILABLE');}

// Insights phase 2: the feature snapshot, rebuilt in the background from local data only.
const insightsSnapshot=insightsStore?createInsightsSnapshot({reviews:applicationReviewStore,store:insightsStore,jobImports:jobImportService,
  portalExports:()=>workflowAutomationStore?workflowAutomationStore.portalExports():[],sentEmails:()=>outreachRepository.listSentEmails(),tailoredLatest:id=>cvTailoringStore?cvTailoringStore.latest(id):null}):null;
insightsSnapshot?.start();

let assignmentEvidenceStore=null;
try{
 const filePath=resolveEvidenceLibraryPath({env:process.env,mode:deployment.mode,state:deployment.state});
 if(filePath)assignmentEvidenceStore=createAssignmentEvidenceStore({filePath});
}catch{console.warn('[ASSIGNMENT_EVIDENCE] LOCAL_STORE_UNAVAILABLE');}

// Save to folder: only an explicit APPLICATION_OUTPUT_FOLDER, never a default. Checked on every save; when unset the page explains how to set it.
const applicationOutputFolder=createApplicationOutputFolder({folder:process.env.APPLICATION_OUTPUT_FOLDER||'',forbidden:[projectRoot,deployment.state,config.storage.cvFolder,'D:\\NewModularProduct-Production']});

const server = createLocalServer({
  applicationOutputFolder,
  assignmentEvidenceStore,
  applicationIntelligence,
  coverLetterRefinementMaxWords:config.application.coverLetterRefinementMaxWords,
  jobImportService,
  applicationReviewStore,
  applicationPackExporter:createApplicationPackExporter({cvFolder:config.storage.cvFolder,documents:createTemplateCoverLetterDocuments({stateDirectory:deployment.state}),cvInventory:cvInventoryRepository,candidateName:process.env.CANDIDATE_DISPLAY_NAME||'Vijay DAFAL',wordPathFor:cvTailoringService?(code,pdf)=>cvTailoringService.wordPathForExport(code,pdf):null,tailoredCv:cvTailoringStore?id=>{const l=cvTailoringStore.latest(id);return l?cvTailoringStore.get(id,l.version):null;}:null,recordExport:workflowAutomationStore?(id,link)=>workflowAutomationStore.recordPortalExport(id,link):null}),
  portalExports:workflowAutomationStore?()=>workflowAutomationStore.portalExports():null,
  // Automatic research is on when organisation research is enabled; ENABLE_AUTO_RESEARCH=false turns it off.
  organisationResearchService:workflowAutomationStore?createOrganisationResearchService({store:workflowAutomationStore,research:automaticResearchPort?request=>researchOrganization(request,{companyResearchPort:automaticResearchPort}):null,enabled:String(process.env.ENABLE_AUTO_RESEARCH||'true').toLowerCase()!=='false',dailyCap:Math.max(0,Number.parseInt(process.env.AUTO_RESEARCH_DAILY_CAP||'10',10)||0)}):null,
  cvEvidenceLoader,
  cvTailoringService,
  insightsStore,
  insightsSnapshot,
  answersStore,
  questionWriter:createQuestionAnswerWriter({apiKey:config.integrations.perplexity.apiKey,enabled:config.features.enableCoverLetterRefinement}),
  tailoredCvLatest:cvTailoringStore?id=>cvTailoringStore.latest(id):null,
  relationshipMemory:workflowAutomationStore?{get:key=>workflowAutomationStore.relationshipChoice(key),record:(key,name,relationship)=>workflowAutomationStore.recordRelationshipChoice(key,name,relationship)}:null,
  // Read-only System check page: data files, CV library and files, documents, services and this PC.
  systemCheck:()=>runSystemCheck(createSystemCheckProbes({stateDirectory:deployment.state,cvFolder:config.storage.cvFolder||'',outputFolder:process.env.APPLICATION_OUTPUT_FOLDER||'',outputForbidden:[projectRoot,deployment.state,config.storage.cvFolder,'D:\\NewModularProduct-Production'],cvTailoringService,
    cvLibrary:async()=>{const data=await cvInventoryRepository.load();return data?.cv_inventory?.cvs||data?.cvs||[];},locateWord:createWordCvLocator({cvFolder:config.storage.cvFolder}),
    probeFiles:(root,relativePaths)=>documentWorker({action:'probe',root,relativePaths}),config})),
  // Email-domain lookups live in the state folder; the old file inside the source folder is read once if present.
  emailDomainStore:createJsonEmailDomainStore({filePath:path.join(deployment.state,'email-domain-resolutions-v1.json'),legacyPath:fileURLToPath(new URL('../../../data/email-domain-resolutions.json',import.meta.url))}),
  candidateDisplayName,
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
