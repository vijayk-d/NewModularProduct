#!/usr/bin/env node

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
import { createLocalServer } from './create-local-server.js';

const DEFAULT_TEMPLATE_ID = 'standard-cover-letter';

const config = loadRuntimeConfig({
  env: process.env
});

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

const server = createLocalServer({
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
