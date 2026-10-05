import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntimeConfig } from '../../src/config/load-runtime-config.js';

test('loads CV folder from runtime loader options', () => {
  const config = loadRuntimeConfig({
    env: {
      CV_FOLDER: 'D:/app-data/cvs'
    },
    cwd: 'D:/workspace/new-modular-product'
  });

  assert.equal(
    config.storage.cvFolder,
    'D:/app-data/cvs'
  );
});

import { redactRuntimeConfig } from '../../src/config/redact-runtime-config.js';

test('uses safe defaults when no optional configuration is supplied', () => {
  const config = loadRuntimeConfig({
    env: {},
    cwd: 'D:/workspace/new-modular-product'
  });

  assert.deepEqual(config.server, {
    host: '127.0.0.1',
    port: 3000
  });

  assert.deepEqual(config.features, {
    enablePerplexityResearch: false,
    enableCoverLetterRefinement: false,
    enableGmail: false,
    localDebugLogging: false
  });
  assert.equal(
    config.integrations.perplexity.refinementModel,
    'perplexity/glm-5.3-flash'
  );
  assert.equal(
    config.application.coverLetterRefinementMaxWords,
    450
  );

  assert.equal(
    config.storage.templateDirectory,
    'D:/workspace/new-modular-product/templates'
  );

  assert.equal(config.integrations.perplexity.enabled, false);
  assert.equal(config.integrations.perplexity.apiKey, '');
  assert.equal(config.integrations.gmail.enabled, false);
});

test('parses configured server, storage, and feature values', () => {
  const config = loadRuntimeConfig({
    cwd: 'D:/workspace/new-modular-product',
    env: {
      HOST: '0.0.0.0',
      PORT: '8080',
      DATA_DIRECTORY: 'D:/app-data',
      TEMPLATE_DIRECTORY: 'D:/app-templates',
      CV_INVENTORY_PATH: 'D:/app-data/cv-inventory.json',
      DATABASE_PATH: 'D:/app-data/application.db',
      ENABLE_PERPLEXITY_RESEARCH: 'yes',
      ENABLE_COVER_LETTER_REFINEMENT: 'true',
      PERPLEXITY_API_KEY: 'test-perplexity-key',
      PERPLEXITY_REFINEMENT_MODEL: 'perplexity/sonar',
      COVER_LETTER_REFINEMENT_MAX_WORDS: '300'
    }
  });

  assert.equal(config.server.host, '0.0.0.0');
  assert.equal(config.server.port, 8080);
  assert.equal(config.storage.dataDirectory, 'D:/app-data');
  assert.equal(config.storage.templateDirectory, 'D:/app-templates');
  assert.equal(
    config.storage.cvInventoryPath,
    'D:/app-data/cv-inventory.json'
  );
  assert.equal(config.storage.databasePath, 'D:/app-data/application.db');
  assert.equal(config.features.enablePerplexityResearch, true);
  assert.equal(config.features.enableCoverLetterRefinement, true);
  assert.equal(config.integrations.perplexity.enabled, true);
  assert.equal(
    config.integrations.perplexity.refinementModel,
    'perplexity/sonar'
  );
  assert.equal(
    config.application.coverLetterRefinementMaxWords,
    300
  );
  assert.equal(
    config.integrations.perplexity.apiKey,
    'test-perplexity-key'
  );
});

test('rejects invalid boolean feature flags', () => {
  assert.throws(
    () => loadRuntimeConfig({
      env: {
        ENABLE_GMAIL: 'sometimes'
      }
    }),
    {
      message:
        'Invalid runtime configuration: ENABLE_GMAIL must be true/false, 1/0, or yes/no.'
    }
  );
});

test('rejects invalid TCP ports', () => {
  assert.throws(
    () => loadRuntimeConfig({
      env: {
        PORT: '70000'
      }
    }),
    {
      message:
        'Invalid runtime configuration: PORT must be an integer from 1 to 65535.'
    }
  );
});

test('requires Perplexity API key only when a Perplexity feature is enabled', () => {
  assert.throws(
    () => loadRuntimeConfig({
      env: {
        ENABLE_PERPLEXITY_RESEARCH: 'true'
      }
    }),
    {
      message:
        'Invalid runtime configuration: PERPLEXITY_API_KEY is required when its integration is enabled.'
    }
  );

  const disabled = loadRuntimeConfig({
    env: {
      PERPLEXITY_API_KEY: 'unused-key'
    }
  });

  assert.equal(disabled.integrations.perplexity.enabled, false);
  assert.equal(disabled.integrations.perplexity.apiKey, 'unused-key');
});

test('rejects invalid cover-letter refinement word limits', () => {
  for (const value of ['119', '451', 'not-a-number']) {
    assert.throws(
      () => loadRuntimeConfig({
        env: {
          COVER_LETTER_REFINEMENT_MAX_WORDS: value
        }
      }),
      {
        message:
          'Invalid runtime configuration: COVER_LETTER_REFINEMENT_MAX_WORDS must be an integer from 120 to 450.'
      }
    );
  }
});

test('requires a Perplexity API key when only refinement is enabled', () => {
  assert.throws(
    () => loadRuntimeConfig({
      env: {
        ENABLE_COVER_LETTER_REFINEMENT: 'true'
      }
    }),
    {
      message:
        'Invalid runtime configuration: PERPLEXITY_API_KEY is required when its integration is enabled.'
    }
  );
});

test('requires all Gmail OAuth settings only when Gmail is enabled', () => {
  assert.throws(
    () => loadRuntimeConfig({
      env: {
        ENABLE_GMAIL: 'true',
        GMAIL_CLIENT_ID: 'client-id'
      }
    }),
    {
      message:
        'Invalid runtime configuration: GMAIL_CLIENT_SECRET is required when its integration is enabled.'
    }
  );

  const config = loadRuntimeConfig({
    env: {
      ENABLE_GMAIL: 'true',
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REDIRECT_URI: 'http://localhost:3000/oauth/callback',
      GMAIL_TOKEN_STORE_PATH: 'D:/app-data/gmail-tokens.json'
    }
  });

  assert.equal(config.integrations.gmail.enabled, true);
  assert.equal(config.integrations.gmail.clientId, 'client-id');
});

test('redacts API keys and OAuth secrets from configuration diagnostics', () => {
  const config = loadRuntimeConfig({
    env: {
      ENABLE_PERPLEXITY_RESEARCH: 'true',
      PERPLEXITY_API_KEY: 'perplexity-secret',
      ENABLE_GMAIL: 'true',
      GMAIL_CLIENT_ID: 'gmail-client-id',
      GMAIL_CLIENT_SECRET: 'gmail-client-secret',
      GMAIL_REDIRECT_URI: 'http://localhost:3000/oauth/callback',
      GMAIL_TOKEN_STORE_PATH: 'D:/app-data/gmail-tokens.json'
    }
  });

  const redacted = redactRuntimeConfig(config);
  const serialized = JSON.stringify(redacted);

  assert.equal(redacted.integrations.perplexity.apiKey, '[redacted]');
  assert.equal(
    redacted.integrations.perplexity.refinementModel,
    'perplexity/glm-5.3-flash'
  );
  assert.equal(
    redacted.application.coverLetterRefinementMaxWords,
    450
  );
  assert.equal(redacted.integrations.gmail.clientId, '[redacted]');
  assert.equal(redacted.integrations.gmail.clientSecret, '[redacted]');
  assert.ok(!serialized.includes('perplexity-secret'));
  assert.ok(!serialized.includes('gmail-client-id'));
  assert.ok(!serialized.includes('gmail-client-secret'));
  assert.equal(
    redacted.integrations.gmail.redirectUri,
    'http://localhost:3000/oauth/callback'
  );
});

