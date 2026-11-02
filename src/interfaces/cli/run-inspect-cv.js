import { loadRuntimeConfig } from '../../config/load-runtime-config.js';
import {
  createCvDocumentAdapter
} from '../../infrastructure/documents/cv-document-adapter.js';
import {
  inspectCvCommand
} from './inspect-cv-command.js';

async function run() {
  const config = loadRuntimeConfig({
    env: process.env
  });

  const extractor = createCvDocumentAdapter({
    cvFolder: config.storage.cvFolder
  });

  const result = await inspectCvCommand({
    argumentsList: process.argv.slice(2),
    extractor
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
