import { loadRuntimeConfig } from '../../config/load-runtime-config.js';
import {
  createPdfTextExtractor
} from '../../infrastructure/documents/pdf-text-extractor.js';
import {
  inspectCvCommand
} from './inspect-cv-command.js';

async function run() {
  const config = loadRuntimeConfig({
    env: process.env
  });

  const extractor = createPdfTextExtractor({
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
