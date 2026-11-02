import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const OS_KEYS = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC',
  'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA',
  'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432',
  'COMMONPROGRAMFILES', 'COMMONPROGRAMFILES(X86)', 'COMMONPROGRAMW6432',
  'USERNAME', 'USERDOMAIN', 'OS', 'PROCESSOR_ARCHITECTURE',
  'PROCESSOR_IDENTIFIER', 'NUMBER_OF_PROCESSORS',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE',
  'NODE_EXTRA_CA_CERTS', 'PIP_CERT', 'NPM_CONFIG_CAFILE',
  'PLAYWRIGHT_BROWSERS_PATH'
]);
const FLAGS = [
  'ENABLE_GMAIL', 'ENABLE_GMAIL_SENDING', 'ENABLE_GMAIL_DRAFT_CREATION',
  'ENABLE_GMAIL_MAILBOX_CHECK', 'ENABLE_GMAIL_SIGNATURE',
  'ENABLE_PERPLEXITY_RESEARCH', 'ENABLE_COVER_LETTER_REFINEMENT'
];
function configurationError(message) {
  const error = new Error(message);
  error.code = 'DEVELOPMENT_LAUNCHER_CONFIG';
  return error;
}
const enabled = value => ['true', '1', 'yes'].includes(String(value || '').trim().toLowerCase());

export function developmentEnvironment(text, inherited = {}) {
  const configured = parseEnv(String(text).replace(/^\uFEFF/, ''));
  if ((configured.NMP_ENV || 'development') !== 'development') {
    throw configurationError('This launcher is development-only. Set NMP_ENV=development in .env.');
  }
  if (configured.PORT !== undefined && configured.PORT !== '3000') {
    throw configurationError('This development launcher requires PORT=3000 (or omit PORT for the default).');
  }
  if (configured.HOST !== undefined && !['127.0.0.1', 'localhost', '::1'].includes(configured.HOST)) {
    throw configurationError('Development HOST must be a loopback address. No value was changed.');
  }
  const requested = FLAGS.filter(key => enabled(configured[key]));
  if (requested.length && configured.NMP_ALLOW_DEVELOPMENT_INTEGRATIONS !== 'true') {
    throw configurationError('The .env file requests integrations, but the runtime opt-in is missing. Set NMP_ALLOW_DEVELOPMENT_INTEGRATIONS=true once in .env, or disable those integrations there. No feature flag was changed.');
  }
  const result = Object.fromEntries(Object.entries(inherited).filter(([key]) => OS_KEYS.has(key.toUpperCase())));
  for (const [key, value] of Object.entries(configured)) {
    for (const existing of Object.keys(result)) {
      if (existing.toUpperCase() === key.toUpperCase()) delete result[existing];
    }
    result[key] = value;
  }
  return result;
}

export async function main({ checkOnly = false } = {}) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  if (Number(process.versions.node.split('.')[0]) < 24) throw configurationError('Use the existing project Node.js 24+ runtime.');
  if (existsSync(path.join(root, 'release.json'))) throw configurationError('Production release refused. Use the production launcher.');
  if (!existsSync(path.join(root, 'package.json'))) throw configurationError('Project package.json is missing.');
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) throw configurationError('Development .env is missing. No defaults file was created.');
  const configured = developmentEnvironment(readFileSync(envPath, 'utf8'), process.env);
  const state = path.resolve(root, configured.NMP_STATE_DIRECTORY || 'output');
  const relative = path.relative(root, state);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw configurationError('Development state must be inside the development repository. No storage setting was changed.');
  }
  if (checkOnly) {
    console.log('DEVELOPMENT ENV CHECK PASSED: .env parsed; development mode, port and integration opt-in validated.');
    console.log('No secret values displayed. No server, provider call, or file update performed.');
    return;
  }
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, configured);
  process.chdir(root);
  console.log('Starting development server using the project .env.');
  console.log('Inherited application flags and credentials are not used.');
  await import(pathToFileURL(path.join(root, 'src/interfaces/http/run-local-server.js')).href);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--check-config')) throw configurationError('Only --check-config is supported.');
    await main({ checkOnly: args.includes('--check-config') });
  } catch (error) {
    console.error(error?.code === 'DEVELOPMENT_LAUNCHER_CONFIG' ? error.message : 'Development startup failed. Check .env syntax, Node.js 24+, NMP_ENV=development, PORT=3000, loopback HOST, local NMP_STATE_DIRECTORY and NMP_ALLOW_DEVELOPMENT_INTEGRATIONS=true when integrations are requested. No secret values are printed.');
    process.exitCode = 1;
  }
}
