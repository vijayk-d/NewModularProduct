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

const templateRepository = createFileTemplateRepository({
  templateDirectory: config.storage.templateDirectory
});

const cvInventoryRepository = createJsonCvInventoryRepository({
  inventoryPath: config.storage.cvInventoryPath
});

const server = createLocalServer({
  prepareApplication(request) {
    return prepareApplicationFromRepositories({
      request,
      templateId: DEFAULT_TEMPLATE_ID,
      templateRepository,
      cvInventoryRepository
    });
  }
});

server.listen(config.server.port, config.server.host, () => {
  process.stdout.write(
    `Application UI available at http://${config.server.host}:${config.server.port}\n`
  );
});
