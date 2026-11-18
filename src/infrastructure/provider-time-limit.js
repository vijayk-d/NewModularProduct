// One time limit for every paid provider call, so a stalled call cannot hold a page for ever.
// A stopped call is never retried; the provider may still have charged for it.
export const DEFAULT_PROVIDER_SECONDS = 90;
const MIN_SECONDS = 10, MAX_SECONDS = 600;

// PERPLEXITY_TIMEOUT_SECONDS (10–600) overrides the default; anything else falls back to it.
export function providerTimeLimitMs(env = process.env, fallbackSeconds = DEFAULT_PROVIDER_SECONDS) {
  const raw = String(env?.PERPLEXITY_TIMEOUT_SECONDS ?? '').trim();
  const value = raw === '' ? NaN : Number(raw);
  const seconds = Number.isFinite(value) && value >= MIN_SECONDS && value <= MAX_SECONDS ? value : fallbackSeconds;
  return Math.round(seconds * 1000);
}

// The abort signal covers the request and reading the response body.
export function timeLimitSignal(ms) { return AbortSignal.timeout(ms); }

export function isTimeLimitError(error) {
  const names = [error?.name, error?.cause?.name];
  return names.includes('TimeoutError') || names.includes('AbortError');
}

export function timeLimitMessage(what, ms) {
  return `${what} did not answer within ${Math.round(ms / 1000)} seconds, so it was stopped. It was not retried; the provider may still charge for the call. Try again later.`;
}
