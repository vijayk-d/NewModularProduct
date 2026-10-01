import { validateRuntimeConfig } from './validate-runtime-config.js';

export function loadRuntimeConfig({
  env = process.env,
  cwd = process.cwd()
} = {}) {
  return validateRuntimeConfig({ env, cwd });
}
