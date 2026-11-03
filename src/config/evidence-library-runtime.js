import fs from 'node:fs';
import path from 'node:path';
import { featureEnabled } from './feature-toggles.js';

// Verification always uses injected fixtures, never a real library.
export function resolveEvidenceLibraryPath({ env = process.env, mode, state }) {
  if (mode !== 'development' && mode !== 'production') return null;
  if (mode === 'production' && !featureEnabled('evidence-library', { ...env, NMP_ENV: mode })) return null;
  const shared = String(env.NMP_CV_LIBRARY_DIRECTORY || '').trim();
  if (shared) {
    if (!path.isAbsolute(shared)) throw new Error('Shared evidence storage requires an absolute NMP_CV_LIBRARY_DIRECTORY.');
    const directory = path.join(shared, 'evidence');
    fs.mkdirSync(directory, { recursive: true });
    return path.join(directory, 'assignment-evidence-library-v1.db');
  }
  return mode === 'development' ? path.join(state, 'assignment-evidence-library-v1.db') : null;
}
