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

export function createDiagnosticWriter({
  enabled = false,
  writer = process.stdout
} = {}) {
  return function writeDiagnostic(event, fields = {}) {
    if (!enabled) {
      return;
    }

    const safeFields = Object.entries(fields)
      .filter(([fieldName]) => !sensitiveFieldNames.has(fieldName))
      .map(([fieldName, value]) => `${fieldName}=${JSON.stringify(value)}`)
      .join(' ');

    writer.write(
      `[LOCAL_DIAGNOSTICS] event=${JSON.stringify(event)}` +
      (safeFields ? ` ${safeFields}` : '') +
      '\n'
    );
  };
}