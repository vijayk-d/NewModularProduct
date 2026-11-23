export const debugEnabled = process.env.LOCAL_DEBUG === 'true';

const sensitiveFieldNames = new Set([
  'jobDescriptionText',
  'jobDescription',
  'coverLetter',
  'coverLetterDraft',
  'draft',
  'plainText',
  'cvHighlights',
  'selectedCvHighlights'
]);

// Free-text fields are left out of failure lines that are written even when debug logging is off.
const freeTextFieldNames = new Set(['message', 'error', 'text', 'detail', 'details']);

export function createDiagnosticWriter({
  enabled = false,
  writer = process.stdout,
  // Failure events ("..._failed") are always written, with a timestamp and codes only, so a production error can be
  // found in the log (Maintenance: "Recent polishing and letter errors") without switching debug logging on.
  alwaysLogFailures = false,
  clock = () => new Date().toISOString()
} = {}) {
  return function writeDiagnostic(event, fields = {}) {
    const failure = String(event).endsWith('_failed');
    if (!enabled && !(alwaysLogFailures && failure)) {
      return;
    }
    const quiet = !enabled;

    const safeFields = Object.entries(fields)
      .filter(([fieldName]) => !sensitiveFieldNames.has(fieldName) && !(quiet && freeTextFieldNames.has(fieldName)))
      .map(([fieldName, value]) => `${fieldName}=${JSON.stringify(value)}`)
      .join(' ');

    writer.write(
      (quiet ? `[APP_ERROR] at=${JSON.stringify(clock())} ` : '') +
      `[LOCAL_DIAGNOSTICS] event=${JSON.stringify(event)}` +
      (safeFields ? ` ${safeFields}` : '') +
      '\n'
    );
  };
}