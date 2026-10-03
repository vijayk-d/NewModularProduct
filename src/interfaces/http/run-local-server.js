#!/usr/bin/env node

import { loadRuntimeConfig } from '../../config/load-runtime-config.js';
import { createLocalServer } from './create-local-server.js';

const config = loadRuntimeConfig({
  env: process.env
});

const server = createLocalServer();

server.listen(config.server.port, config.server.host, () => {
  process.stdout.write(
    `Application UI available at http://${config.server.host}:${config.server.port}\n`
  );
});
