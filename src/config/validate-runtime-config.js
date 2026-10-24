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

function readBoundedInteger(value, name, {
  defaultValue,
  minimum,
  maximum
}) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw configError(
      `${name} must be an integer from ${minimum} to ${maximum}.`
    );
  }

  return parsed;
}

function readNonEmptyString(value, defaultValue = '') {
  const normalized = String(value ?? '').trim();

  return normalized || defaultValue;
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

  const modernGmail=enableGmail&&readBoolean(env.ENABLE_GMAIL_SENDING,'ENABLE_GMAIL_SENDING');
  if(modernGmail){requiredWhenEnabled(env.GMAIL_OAUTH_REFRESH_TOKEN,'GMAIL_OAUTH_REFRESH_TOKEN',true);requiredWhenEnabled(env.GMAIL_FROM_ADDRESS,'GMAIL_FROM_ADDRESS',true);}
  const perplexityEnabled =
    enablePerplexityResearch || enableCoverLetterRefinement;

  const refinementModel = readNonEmptyString(
    env.PERPLEXITY_REFINEMENT_MODEL,
    'perplexity/glm-5.3-flash'
  );

  const coverLetterRefinementMaxWords = readBoundedInteger(
    env.COVER_LETTER_REFINEMENT_MAX_WORDS,
    'COVER_LETTER_REFINEMENT_MAX_WORDS',
    {
      defaultValue: 500,
      minimum: 120,
      maximum: 500
    }
  );

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
    application: {
      coverLetterRefinementMaxWords
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
        ),
        refinementModel
      },
      gmail: {
        enabled: enableGmail,
        clientId: requiredWhenEnabled(
          modernGmail?env.GMAIL_OAUTH_CLIENT_ID:env.GMAIL_CLIENT_ID,
          modernGmail?'GMAIL_OAUTH_CLIENT_ID':'GMAIL_CLIENT_ID',
          enableGmail
        ),
        clientSecret: requiredWhenEnabled(
          modernGmail?env.GMAIL_OAUTH_CLIENT_SECRET:env.GMAIL_CLIENT_SECRET,
          modernGmail?'GMAIL_OAUTH_CLIENT_SECRET':'GMAIL_CLIENT_SECRET',
          enableGmail
        ),
        redirectUri: requiredWhenEnabled(
          env.GMAIL_REDIRECT_URI,
          'GMAIL_REDIRECT_URI',
          enableGmail&&!modernGmail
        ),
        tokenStorePath: requiredWhenEnabled(
          env.GMAIL_TOKEN_STORE_PATH,
          'GMAIL_TOKEN_STORE_PATH',
          enableGmail&&!modernGmail
        )
      }
    }
  };
}

