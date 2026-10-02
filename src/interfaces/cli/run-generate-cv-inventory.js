import { loadRuntimeConfig } from '../../config/load-runtime-config.js';
import {
  createCvCatalog
} from '../../infrastructure/documents/cv-catalog.js';
import {
  createCvInventoryWriter
} from '../../infrastructure/documents/cv-inventory-writer.js';
import {
  generateCvInventoryCommand
} from './generate-cv-inventory-command.js';

async function run() {
  const config = loadRuntimeConfig({
    env: process.env
  });

  const catalog = createCvCatalog({
    cvFolder: config.storage.cvFolder
  });

  const writer = createCvInventoryWriter({
    dataDirectory: config.storage.dataDirectory
  });

  const result = await generateCvInventoryCommand({
    argumentsList: process.argv.slice(2),
    catalog,
    writer
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
