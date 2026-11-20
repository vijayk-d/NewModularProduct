// System check row for the Gmail scheduler: off, missing set-up, Sheet not reachable, or ready.
// Read-only: it never schedules, sends or changes the scheduler Sheet. Secret values are never reported.
import {schedulingAllowed} from './gmail-scheduler-protocol.js';

const SETUP = 'Run the scheduler set-up for this environment (apps-script/gmail-scheduler/README.md, "Production set-up"), then restart.';

export function missingSchedulerSettings(env = process.env) {
  const missing = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(env.GMAIL_FROM_ADDRESS || '').trim())) missing.push('GMAIL_FROM_ADDRESS');
  if (!/^[a-f0-9-]{36}$/.test(String(env.CLOUD_SCHEDULER_NAMESPACE || ''))) missing.push('CLOUD_SCHEDULER_NAMESPACE');
  if (!String(env.CLOUD_SCHEDULER_SPREADSHEET_ID || '').trim()) missing.push('CLOUD_SCHEDULER_SPREADSHEET_ID');
  if (!/^[a-f0-9]{64}$/.test(String(env.CLOUD_SCHEDULER_SIGNING_KEY || ''))) missing.push('CLOUD_SCHEDULER_SIGNING_KEY');
  for (const key of ['CLOUD_SCHEDULER_OAUTH_CLIENT_ID', 'CLOUD_SCHEDULER_OAUTH_REFRESH_TOKEN']) if (!String(env[key] || '').trim()) missing.push(key);
  return missing;
}

export async function schedulerReadiness({env = process.env, inspect = null, timeoutMs = 20000} = {}) {
  const allowed = schedulingAllowed(env);
  if (!allowed.allowed) return {status: 'off', detail: allowed.reason || 'Scheduling is switched off.'};
  const missing = missingSchedulerSettings(env);
  if (missing.length) return {status: 'fail', detail: 'Scheduling is on, but these settings are missing or invalid: ' + missing.join(', ') + '.', fix: SETUP};
  if (typeof inspect !== 'function') return {status: 'warn', detail: 'Settings are present; the scheduler Sheet was not contacted.'};
  let timer;
  try {
    const result = await Promise.race([inspect(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); })]);
    if (!Array.isArray(result?.receipts)) return {status: 'fail', detail: 'The scheduler Sheet answered, but its tables or identity are not ready.', fix: 'Check the Sheet ID and namespace, and that nmpSchedulerInstall was run in its Apps Script project.'};
    return {status: 'pass', detail: `Ready (${allowed.mode}): the private scheduler Sheet is reachable. Each schedule still needs its own approval.`};
  } catch {
    return {status: 'fail', detail: 'The scheduler Sheet could not be reached. No schedule was created.', fix: 'Check the internet connection and the scheduler sign-in (CLOUD_SCHEDULER_OAUTH_*), then try again.'};
  } finally { clearTimeout(timer); }
}
