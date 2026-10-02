import { loadRuntimeConfig } from '../../config/load-runtime-config.js';
import {
  createCvCatalog
} from '../../infrastructure/documents/cv-catalog.js';

async function run() {
  const config = loadRuntimeConfig({
    env: process.env
  });

  const catalog = createCvCatalog({
    cvFolder: config.storage.cvFolder
  });

  const cvs = await catalog.list();

  process.stdout.write(
    `${JSON.stringify({
      count: cvs.length,
      cvs
    })}\n`
  );
}

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
