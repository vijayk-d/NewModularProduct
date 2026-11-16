// Research an organisation automatically once, when its first application is created, then reuse it.
// Manual research (the button) always runs and refreshes the shared copy. No automatic retry on failure.
const DAY = 24 * 60 * 60 * 1000;

export function organisationKey(name) {
  return String(name || '').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}&]+/gu, ' ')
    .replace(/\b(limited|ltd|plc|llp|llc|inc|incorporated|group|uk)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function createOrganisationResearchService({store, research = null, enabled = true, dailyCap = 10, maxAgeDays = 30, clock = () => Date.now()} = {}) {
  if (!store) throw new Error('A workflow automation store is required.');
  const fresh = entry => entry && entry.research?.status === 'found' && clock() - entry.researchedAt <= maxAgeDays * DAY;
  return {
    async forNewApplication({organisationName, organisationUrl = '', jobTitle = ''} = {}) {
      const name = String(organisationName || '').trim(), key = organisationKey(name);
      if (!key) return {source: 'skipped', reason: 'No organisation name.'};
      const cached = store.getResearch(key);
      if (fresh(cached)) return {source: 'cache', research: {...cached.research, reusedFromCache: true, cachedAt: new Date(cached.researchedAt).toISOString()}};
      if (!enabled || typeof research !== 'function') return {source: 'skipped', reason: 'Automatic research is turned off.'};
      if (store.automaticCallsToday() >= dailyCap) return {source: 'skipped', reason: `Daily automatic research limit (${dailyCap}) reached. Use the research button if needed.`};
      store.recordAutomaticCall(); // counted before the call, so a failed call still uses the allowance and is not retried
      let result;
      try { result = await research({companyName: name, companyUrl: String(organisationUrl || '').trim(), jobDescriptionSummary: String(jobTitle || '').trim(), forceRefresh: false}); }
      catch (error) { result = {status: 'error', provider: 'Perplexity', researchedAt: new Date(clock()).toISOString(), error: error instanceof Error ? error.message : 'Organisation research failed.'}; }
      if (result?.status === 'found') store.putResearch(key, name, result, 'automatic');
      return {source: 'automatic', research: {...result, automatic: true}};
    },
    recordManual(organisationName, result) {
      const key = organisationKey(organisationName);
      if (key && result?.status === 'found') store.putResearch(key, String(organisationName).trim(), result, 'manual');
    }
  };
}
