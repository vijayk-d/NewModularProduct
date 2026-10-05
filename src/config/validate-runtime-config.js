function configError(message) {
  return new Error(`Invalid runtime configuration: ${message}`);
}

function readBoolean(value, name, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }

  throw configError(
    `${name} must be true/false, 1/0, or yes/no.`
  );
}

function readPort(value, name, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw configError(`${name} must be an integer from 1 to 65535.`);
  }

  return port;
}

function requiredWhenEnabled(value, name, enabled) {
  if (!enabled) {
    return String(value || '');
  }

  const normalized = String(value || '').trim();

  if (!normalized) {
    throw configError(`${name} is required when its integration is enabled.`);
  }

  return normalized;
}

export function validateRuntimeConfig({
  env = {},
  cwd = process.cwd()
} = {}) {
  const enablePerplexityResearch = readBoolean(
    env.ENABLE_PERPLEXITY_RESEARCH,
    'ENABLE_PERPLEXITY_RESEARCH'
  );

  const enableCoverLetterRefinement = readBoolean(
    env.ENABLE_COVER_LETTER_REFINEMENT,
    'ENABLE_COVER_LETTER_REFINEMENT'
  );

  const enableGmail = readBoolean(
    env.ENABLE_GMAIL,
    'ENABLE_GMAIL'
  );

  const perplexityEnabled =
    enablePerplexityResearch || enableCoverLetterRefinement;

  return {
    server: {
      host: String(env.HOST || '127.0.0.1').trim() || '127.0.0.1',
      port: readPort(env.PORT, 'PORT', 3000)
    },
    storage: {
      dataDirectory: String(env.DATA_DIRECTORY || `${cwd}/data`).trim(),
      templateDirectory: String(
        env.TEMPLATE_DIRECTORY || `${cwd}/templates`
      ).trim(),
      cvInventoryPath: String(
        env.CV_INVENTORY_PATH || ''
      ).trim(),
      cvFolder: String(env.CV_FOLDER || '').trim(),
      databasePath: String(env.DATABASE_PATH || '').trim()
    },
    features: {
      enablePerplexityResearch,
      enableCoverLetterRefinement,
      enableGmail,
      localDebugLogging: readBoolean(
        env.LOCAL_DEBUG_LOGGING,
        'LOCAL_DEBUG_LOGGING'
      )
    },
    integrations: {
      perplexity: {
        enabled: perplexityEnabled,
        apiKey: requiredWhenEnabled(
          env.PERPLEXITY_API_KEY,
          'PERPLEXITY_API_KEY',
          perplexityEnabled
        )
      },
      gmail: {
        enabled: enableGmail,
        clientId: requiredWhenEnabled(
          env.GMAIL_CLIENT_ID,
          'GMAIL_CLIENT_ID',
          enableGmail
        ),
        clientSecret: requiredWhenEnabled(
          env.GMAIL_CLIENT_SECRET,
          'GMAIL_CLIENT_SECRET',
          enableGmail
        ),
        redirectUri: requiredWhenEnabled(
          env.GMAIL_REDIRECT_URI,
          'GMAIL_REDIRECT_URI',
          enableGmail
        ),
        tokenStorePath: requiredWhenEnabled(
          env.GMAIL_TOKEN_STORE_PATH,
          'GMAIL_TOKEN_STORE_PATH',
          enableGmail
        )
      }
    }
  };
}
