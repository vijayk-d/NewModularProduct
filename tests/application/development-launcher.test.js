import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentEnvironment as env } from '../../tools/maintenance/start-development.mjs';

test('.env flags win over inherited application configuration', () => {
  const result = env('NMP_ENV=development\nNMP_ALLOW_DEVELOPMENT_INTEGRATIONS=true\nENABLE_GMAIL=true\nENABLE_GMAIL_SENDING=false\nGMAIL_OAUTH_REFRESH_TOKEN=synthetic-file-token\n', { ENABLE_GMAIL:'false', ENABLE_GMAIL_SENDING:'true', GMAIL_OAUTH_REFRESH_TOKEN:'synthetic-shell-token', NMP_ENV:'production' });
  assert.equal(result.ENABLE_GMAIL, 'true');
  assert.equal(result.ENABLE_GMAIL_SENDING, 'false');
  assert.equal(result.GMAIL_OAUTH_REFRESH_TOKEN, 'synthetic-file-token');
  assert.equal(result.NMP_ENV, 'development');
});
test('absent application values do not leak from the shell', () => {
  const result = env('', { ENABLE_GMAIL:'true', GMAIL_OAUTH_REFRESH_TOKEN:'synthetic-token', NMP_STATE_DIRECTORY:'outside', NODE_OPTIONS:'--require synthetic.js', PERPLEXITY_API_KEY:'synthetic-key' });
  assert.deepEqual(result, {});
});
test('Windows OS keys and certificate configuration survive', () => {
  const result = env('', { SystemRoot:'C:\\Windows', SystemDrive:'C:', Path:'synthetic-path', ComSpec:'synthetic-cmd', HTTPS_PROXY:'http://synthetic.invalid', NODE_EXTRA_CA_CERTS:'synthetic-cert' });
  assert.equal(result.SystemRoot, 'C:\\Windows');
  assert.equal(result.Path, 'synthetic-path');
  assert.equal(result.NODE_EXTRA_CA_CERTS, 'synthetic-cert');
});
test('file OS keys replace inherited case variants', () => {
  const result = env('PATH=file-path', { Path:'shell-path' });
  assert.equal(result.PATH, 'file-path');
  assert.equal(Object.hasOwn(result, 'Path'), false);
});
test('UTF-8 BOM, spaces, Windows paths and punctuation are parsed as data', () => {
  const result = env('\uFEFFCV_FOLDER="D:\\OneDrive Folder\\CV"\nLABEL="A & B ! 100% # reviewed"\n');
  assert.equal(result.CV_FOLDER, 'D:\\OneDrive Folder\\CV');
  assert.equal(result.LABEL, 'A & B ! 100% # reviewed');
});
test('explicitly disabled integrations remain disabled', () => {
  const result = env('ENABLE_GMAIL=false\nENABLE_GMAIL_SENDING=false\n');
  assert.equal(result.ENABLE_GMAIL, 'false');
  assert.equal(result.ENABLE_GMAIL_SENDING, 'false');
  assert.equal(Object.hasOwn(result,'NMP_ALLOW_DEVELOPMENT_INTEGRATIONS'),false);
});
test('requested integrations require the existing explicit opt-in', () => {
  assert.throws(() => env('ENABLE_GMAIL=true'), /opt-in/);
  assert.throws(() => env('ENABLE_GMAIL=true\nNMP_ALLOW_DEVELOPMENT_INTEGRATIONS=yes'), /opt-in/);
});
test('one-time opt-in does not enable otherwise disabled features', () => {
  const result = env('NMP_ALLOW_DEVELOPMENT_INTEGRATIONS=true\nENABLE_GMAIL=false');
  assert.equal(result.ENABLE_GMAIL,'false');
  assert.equal(Object.hasOwn(result,'ENABLE_GMAIL_SENDING'),false);
});
test('production and verification identities are refused', () => {
  assert.throws(() => env('NMP_ENV=production'), /development-only/);
  assert.throws(() => env('NMP_ENV=verification'), /development-only/);
});
test('production port and public bind addresses are refused, not overwritten', () => {
  assert.throws(() => env('PORT=3100'), /PORT=3000/);
  assert.throws(() => env('HOST=0.0.0.0'), /loopback/);
  assert.equal(env('PORT=3000\nHOST=127.0.0.1').PORT,'3000');
});
test('the caller environment object is not changed', () => {
  const inherited = { ENABLE_GMAIL:'true', SystemRoot:'C:\\Windows' };
  env('ENABLE_GMAIL=false', inherited);
  assert.equal(inherited.ENABLE_GMAIL,'true');
  assert.equal(inherited.SystemRoot,'C:\\Windows');
});
