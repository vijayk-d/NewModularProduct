// Side-effect module: must be the FIRST import of run-local-server.js so every
// later module sees the toggled ENABLE_* flags.
import { applyFeatureToggles, FEATURES } from './feature-toggles.js';

try {
  const result = applyFeatureToggles(process.env);
  if (result.applied) process.stdout.write(`[FEATURE_TOGGLES] ${result.seeded ? 'seeded' : 'applied'} revision ${result.revision} from ${result.file}\n`);
} catch (error) {
  // Fail safe: an unreadable toggle file switches every toggled feature OFF instead of guessing.
  for (const f of FEATURES) process.env[f.env] = 'false';
  process.stdout.write(`[FEATURE_TOGGLES] ERROR ${error.message} All toggled features are OFF until features.json is fixed.\n`);
}
