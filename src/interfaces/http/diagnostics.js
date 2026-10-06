export const debugEnabled = process.env.LOCAL_DEBUG === 'true';

export function createDiagnosticWriter({
  enabled = false,
  writer = process.stdout
} = {}) {
  return function writeDiagnostic(event, fields = {}) {
    if (!enabled) {
      return;
    }

    // Paste the exact existing field-sanitising and output logic here.
  };
}