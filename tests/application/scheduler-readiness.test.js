import test from 'node:test';
import assert from 'node:assert/strict';
import {schedulerReadiness, missingSchedulerSettings} from '../../src/application/scheduler-readiness.js';
import {schedulingAllowed} from '../../src/application/gmail-scheduler-protocol.js';

const ready = () => ({NMP_ENV: 'production', ENABLE_CLOUD_SCHEDULING: 'true', ENABLE_GMAIL_SENDING: 'true', GMAIL_FROM_ADDRESS: 'sender@example.test',
  CLOUD_SCHEDULER_NAMESPACE: '11111111-1111-1111-1111-111111111111', CLOUD_SCHEDULER_SPREADSHEET_ID: 'sheet', CLOUD_SCHEDULER_SIGNING_KEY: 'b'.repeat(64),
  CLOUD_SCHEDULER_OAUTH_CLIENT_ID: 'client', CLOUD_SCHEDULER_OAUTH_REFRESH_TOKEN: 'token'});

test('scheduling is allowed per environment', () => {
  assert.equal(schedulingAllowed(ready()).allowed, true);
  assert.equal(schedulingAllowed({...ready(), ENABLE_GMAIL_SENDING: 'false'}).allowed, false);
  assert.equal(schedulingAllowed({...ready(), NMP_ENV: 'verification', NMP_ALLOW_DEVELOPMENT_INTEGRATIONS: 'true'}).allowed, false);
  assert.equal(schedulingAllowed({NMP_ENV: 'development', ENABLE_CLOUD_SCHEDULING: 'true'}).allowed, false, 'development still needs the integrations opt-in');
  assert.equal(schedulingAllowed({NMP_ENV: 'development', ENABLE_CLOUD_SCHEDULING: 'true', NMP_ALLOW_DEVELOPMENT_INTEGRATIONS: 'true'}).allowed, true);
});

test('System check: off, missing settings, unreachable Sheet, ready', async () => {
  assert.equal((await schedulerReadiness({env: {NMP_ENV: 'production'}})).status, 'off');
  const missing = await schedulerReadiness({env: {...ready(), CLOUD_SCHEDULER_SIGNING_KEY: 'short'}});
  assert.equal(missing.status, 'fail'); assert.match(missing.detail, /CLOUD_SCHEDULER_SIGNING_KEY/);
  assert.doesNotMatch(missing.detail, /short|token|client/, 'no secret values in the report');
  assert.deepEqual(missingSchedulerSettings(ready()), []);
  let calls = 0;
  const unreachable = await schedulerReadiness({env: ready(), inspect: async () => { calls++; throw new Error('network'); }});
  assert.equal(unreachable.status, 'fail'); assert.match(unreachable.detail, /could not be reached/);
  assert.equal(calls, 1, 'one read-only call, never retried');
  assert.equal((await schedulerReadiness({env: ready(), inspect: () => new Promise(() => {}), timeoutMs: 20})).status, 'fail');
  assert.equal((await schedulerReadiness({env: ready(), inspect: async () => ({receipts: []})})).status, 'pass');
  assert.equal((await schedulerReadiness({env: ready(), inspect: async () => ({})})).status, 'fail');
});
