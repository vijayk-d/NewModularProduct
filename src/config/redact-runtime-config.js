function redactSecret(value) {
  return String(value || '').trim() ? '[redacted]' : '';
}

export function redactRuntimeConfig(config = {}) {
  return {
    server: {
      host: config.server?.host || '',
      port: config.server?.port || 0
    },
    storage: {
      dataDirectory: config.storage?.dataDirectory || '',
      templateDirectory: config.storage?.templateDirectory || '',
      cvInventoryPath: config.storage?.cvInventoryPath || '',
      cvFolder: config.storage?.cvFolder || '',
      databasePath: config.storage?.databasePath || ''
    },
    application: {
      coverLetterRefinementMaxWords: Number(
        config.application?.coverLetterRefinementMaxWords || 0
      )
    },
    features: {
      enablePerplexityResearch: Boolean(
        config.features?.enablePerplexityResearch
      ),
      enableCoverLetterRefinement: Boolean(
        config.features?.enableCoverLetterRefinement
      ),
      enableGmail: Boolean(config.features?.enableGmail)
    },
    integrations: {
      perplexity: {
        enabled: Boolean(config.integrations?.perplexity?.enabled),
        apiKey: redactSecret(config.integrations?.perplexity?.apiKey),
        refinementModel: String(
          config.integrations?.perplexity?.refinementModel || ''
        )
      },
      gmail: {
        enabled: Boolean(config.integrations?.gmail?.enabled),
        clientId: redactSecret(config.integrations?.gmail?.clientId),
        clientSecret: redactSecret(
          config.integrations?.gmail?.clientSecret
        ),
        redirectUri: config.integrations?.gmail?.redirectUri || '',
        tokenStorePath: config.integrations?.gmail?.tokenStorePath || ''
      }
    }
  };
}
