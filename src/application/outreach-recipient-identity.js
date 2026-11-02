export function recipientFirstName(contact = {}) {
  const explicit = [contact.firstname, contact.firstName]
    .map(value => String(value ?? '').trim()).find(Boolean);
  const full = String(contact.fullName ?? '').trim();
  const value = explicit || full.split(/\s+/u)[0] || 'Hiring Manager';
  if (value.length > 160 || /[\r\n<>@{}\[\]\/\\:]|https?/i.test(value)) {
    const error = new Error('Recipient name must be plain single-line text, not a URL or placeholder.');
    error.statusCode = 400;
    throw error;
  }
  return value;
}
export function assertResolvedMessage(...values) {
  if (values.some(value => /\{\{|\}\}/.test(String(value ?? '')))) {
    const error = new Error('Final message contains an unsupported or unresolved placeholder.');
    error.statusCode = 400;
    throw error;
  }
}
