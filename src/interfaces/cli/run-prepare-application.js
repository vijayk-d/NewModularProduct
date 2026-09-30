#!/usr/bin/env node

import { stdin, stdout, stderr } from 'node:process';
import {
  formatJsonResponse,
  runPrepareApplicationCommand
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
    const result = runPrepareApplicationCommand(input);

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
