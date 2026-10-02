#!/usr/bin/env node

import { stdin, stdout, stderr } from 'node:process';
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
  formatJsonResponse,
  parseJsonRequest
} from './prepare-application-command.js';

async function readStandardInput(stream) {
  let input = '';

  for await (const chunk of stream) {
    input += chunk;
  }

  return input;
}

async function main() {
  try {
    const input = await readStandardInput(stdin);
    const request = parseJsonRequest(input);

    const config = loadRuntimeConfig({
      env: process.env
    });

    const templateRepository = createFileTemplateRepository({
      templateDirectory: config.storage.templateDirectory
    });

    const cvInventoryRepository = createJsonCvInventoryRepository({
      inventoryPath: config.storage.cvInventoryPath
    });

    const result = await prepareApplicationFromRepositories({
      request,
      templateId: request.templateId,
      templateRepository,
      cvInventoryRepository
    });

    stdout.write(formatJsonResponse(result));
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Unexpected CLI error.';

    stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

main();
