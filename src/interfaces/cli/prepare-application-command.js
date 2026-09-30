import { prepareApplication } from '../../application/prepare-application.js';

export function parseJsonRequest(input = '') {
  const source = String(input || '').trim();

  if (!source) {
    throw new Error('Expected a JSON application request on standard input.');
  }

  try {
    return JSON.parse(source);
  } catch {
    throw new Error('Standard input must contain valid JSON.');
  }
}

export function runPrepareApplicationCommand(input = '') {
  const request = parseJsonRequest(input);
  return prepareApplication(request);
}

export function formatJsonResponse(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
