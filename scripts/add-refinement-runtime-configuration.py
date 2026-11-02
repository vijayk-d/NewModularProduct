from __future__ import annotations

from datetime import datetime
from pathlib import Path
import difflib
import shutil
import sys

APPLY = "--apply" in sys.argv

FILES = {
    Path("src/config/validate-runtime-config.js"): None,
    Path("src/config/redact-runtime-config.js"): None,
    Path("src/interfaces/http/run-local-server.js"): None,
    Path("tests/config/runtime-config.test.js"): None
}


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    print("No changes were made.")
    raise SystemExit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)

    if count != 1:
        fail(f"Expected exactly one {label}; found {count}.")

    return text.replace(old, new, 1)


def insert_after_once(text: str, anchor: str, insertion: str, label: str) -> str:
    count = text.count(anchor)

    if count != 1:
        fail(f"Expected exactly one {label}; found {count}.")

    return text.replace(anchor, anchor + insertion, 1)


def update_validate_runtime_config(original: str) -> str:
    content = original

    helpers_anchor = """function readPort(value, name, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw configError(`${name} must be an integer from 1 to 65535.`);
  }

  return port;
}
"""

    helpers_replacement = helpers_anchor + """
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
"""

    content = replace_once(
        content,
        helpers_anchor,
        helpers_replacement,
        "readPort helper"
    )

    perplexity_enabled_anchor = """  const perplexityEnabled =
    enablePerplexityResearch || enableCoverLetterRefinement;
"""

    perplexity_enabled_replacement = """  const perplexityEnabled =
    enablePerplexityResearch || enableCoverLetterRefinement;

  const refinementModel = readNonEmptyString(
    env.PERPLEXITY_REFINEMENT_MODEL,
    'perplexity/glm-5.3-flash'
  );

  const coverLetterRefinementMaxWords = readBoundedInteger(
    env.COVER_LETTER_REFINEMENT_MAX_WORDS,
    'COVER_LETTER_REFINEMENT_MAX_WORDS',
    {
      defaultValue: 450,
      minimum: 120,
      maximum: 450
    }
  );
"""

    content = replace_once(
        content,
        perplexity_enabled_anchor,
        perplexity_enabled_replacement,
        "Perplexity feature configuration"
    )

    storage_to_features_anchor = """    features: {
      enablePerplexityResearch,
"""

    application_block = """    application: {
      coverLetterRefinementMaxWords
    },
"""

    content = replace_once(
        content,
        storage_to_features_anchor,
        application_block + storage_to_features_anchor,
        "features block"
    )

    api_key_anchor = """        apiKey: requiredWhenEnabled(
          env.PERPLEXITY_API_KEY,
          'PERPLEXITY_API_KEY',
          perplexityEnabled
        )
"""

    api_key_replacement = """        apiKey: requiredWhenEnabled(
          env.PERPLEXITY_API_KEY,
          'PERPLEXITY_API_KEY',
          perplexityEnabled
        ),
        refinementModel
"""

    content = replace_once(
        content,
        api_key_anchor,
        api_key_replacement,
        "Perplexity API-key configuration"
    )

    return content


def update_redact_runtime_config(original: str) -> str:
    content = original

    storage_to_features_anchor = """    features: {
      enablePerplexityResearch: Boolean(
"""

    application_block = """    application: {
      coverLetterRefinementMaxWords: Number(
        config.application?.coverLetterRefinementMaxWords || 0
      )
    },
"""

    content = replace_once(
        content,
        storage_to_features_anchor,
        application_block + storage_to_features_anchor,
        "redacted features block"
    )

    api_key_anchor = """        enabled: Boolean(config.integrations?.perplexity?.enabled),
        apiKey: redactSecret(config.integrations?.perplexity?.apiKey)
"""

    api_key_replacement = """        enabled: Boolean(config.integrations?.perplexity?.enabled),
        apiKey: redactSecret(config.integrations?.perplexity?.apiKey),
        refinementModel: String(
          config.integrations?.perplexity?.refinementModel || ''
        )
"""

    content = replace_once(
        content,
        api_key_anchor,
        api_key_replacement,
        "redacted Perplexity integration"
    )

    return content


def update_run_local_server(original: str) -> str:
    content = original

    adapter_import_anchor = """import {
  createPerplexityCompanyResearchAdapter
} from '../../infrastructure/research/perplexity-company-research-adapter.js';
"""

    adapter_import_replacement = adapter_import_anchor + """import {
  createPerplexityCoverLetterRefinementAdapter
} from '../../infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js';
"""

    content = replace_once(
        content,
        adapter_import_anchor,
        adapter_import_replacement,
        "company-research adapter import"
    )

    research_port_anchor = """const server = createLocalServer({
"""

    refinement_port = """const coverLetterRefinementPort =
  config.features.enableCoverLetterRefinement
    ? createPerplexityCoverLetterRefinementAdapter({
        apiKey: config.integrations.perplexity.apiKey,
        model: config.integrations.perplexity.refinementModel
      })
    : null;

"""

    content = replace_once(
        content,
        research_port_anchor,
        refinement_port + research_port_anchor,
        "createLocalServer call"
    )

    return content


def update_runtime_config_tests(original: str) -> str:
    content = original

    default_features = """  assert.deepEqual(config.features, {
  enablePerplexityResearch: false,
  enableCoverLetterRefinement: false,
  enableGmail: false,
  localDebugLogging: false
  });
"""

    default_features_replacement = """  assert.deepEqual(config.features, {
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
"""

    content = replace_once(
        content,
        default_features,
        default_features_replacement,
        "default feature assertions"
    )

    configured_env_anchor = """      ENABLE_PERPLEXITY_RESEARCH: 'yes',
      PERPLEXITY_API_KEY: 'test-perplexity-key'
"""

    configured_env_replacement = """      ENABLE_PERPLEXITY_RESEARCH: 'yes',
      ENABLE_COVER_LETTER_REFINEMENT: 'true',
      PERPLEXITY_API_KEY: 'test-perplexity-key',
      PERPLEXITY_REFINEMENT_MODEL: 'perplexity/sonar',
      COVER_LETTER_REFINEMENT_MAX_WORDS: '300'
"""

    content = replace_once(
        content,
        configured_env_anchor,
        configured_env_replacement,
        "configured Perplexity environment"
    )

    configured_assertions_anchor = """  assert.equal(config.features.enableCoverLetterRefinement, false);
  assert.equal(config.integrations.perplexity.enabled, true);
"""

    configured_assertions_replacement = """  assert.equal(config.features.enableCoverLetterRefinement, true);
  assert.equal(config.integrations.perplexity.enabled, true);
  assert.equal(
    config.integrations.perplexity.refinementModel,
    'perplexity/sonar'
  );
  assert.equal(
    config.application.coverLetterRefinementMaxWords,
    300
  );
"""

    content = replace_once(
        content,
        configured_assertions_anchor,
        configured_assertions_replacement,
        "configured Perplexity assertions"
    )

    key_test_anchor = """test('requires all Gmail OAuth settings only when Gmail is enabled', () => {
"""

    extra_tests = r'''test('rejects invalid cover-letter refinement word limits', () => {
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

'''

    content = replace_once(
        content,
        key_test_anchor,
        extra_tests + key_test_anchor,
        "Gmail test anchor"
    )

    redaction_assertions_anchor = """  assert.equal(redacted.integrations.perplexity.apiKey, '[redacted]');
"""

    redaction_assertions_replacement = """  assert.equal(redacted.integrations.perplexity.apiKey, '[redacted]');
  assert.equal(
    redacted.integrations.perplexity.refinementModel,
    'perplexity/glm-5.3-flash'
  );
  assert.equal(
    redacted.application.coverLetterRefinementMaxWords,
    450
  );
"""

    content = replace_once(
        content,
        redaction_assertions_anchor,
        redaction_assertions_replacement,
        "redaction assertions"
    )

    return content


def main() -> None:
    transformers = {
        Path("src/config/validate-runtime-config.js"): update_validate_runtime_config,
        Path("src/config/redact-runtime-config.js"): update_redact_runtime_config,
        Path("src/interfaces/http/run-local-server.js"): update_run_local_server,
        Path("tests/config/runtime-config.test.js"): update_runtime_config_tests
    }

    originals = {}

    for target in FILES:
        if not target.is_file():
            fail(f"Missing target: {target}")

        originals[target] = target.read_text(encoding="utf-8")

    if "coverLetterRefinementMaxWords" in originals[
        Path("src/config/validate-runtime-config.js")
    ]:
        print("Refinement runtime configuration already appears present.")
        print("No changes were made.")
        return

    updates = {
        target: transformer(originals[target])
        for target, transformer in transformers.items()
    }

    diffs = []

    for target in FILES:
        diffs.append(
            "".join(
                difflib.unified_diff(
                    originals[target].splitlines(keepends=True),
                    updates[target].splitlines(keepends=True),
                    fromfile=str(target),
                    tofile=f"{target} (refinement config)",
                    n=2
                )
            )
        )

    if not APPLY:
        print("Preview only: no files were changed.\n")
        print("\n".join(diffs))
        print("\nApply with:")
        print(
            "  py .\\scripts\\add-refinement-runtime-configuration.py --apply"
        )
        return

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    for target in FILES:
        backup = target.with_name(
            f"{target.name}.{timestamp}.before-refinement-config.bak"
        )

        shutil.copy2(target, backup)
        target.write_text(updates[target], encoding="utf-8")

        print(f"Updated: {target}")
        print(f"Backup:  {backup}")

    print("Refinement runtime configuration applied.")


if __name__ == "__main__":
    main()