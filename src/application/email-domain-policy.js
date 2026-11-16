// Pure rules for organisation email domains. Used by the save route and when research finds a domain.
const BLOCKED = ['linkedin.com', 'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'example.com', 'example.org', 'example.net'];

// Returns the lower-case business domain, or '' when the value is not a usable business domain.
export function normaliseBusinessDomain(value) {
  const domain = String(value || '').trim().toLowerCase();
  const labels = domain.split('.');
  const valid = domain.length <= 253 && labels.length >= 2 &&
    labels.every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) &&
    /^[a-z]{2,63}$/.test(labels[labels.length - 1]) &&
    !BLOCKED.some(blocked => domain === blocked || domain.endsWith('.' + blocked));
  return valid ? domain : '';
}

// A newly found domain replaces the old one. Returns the updated form data and whether it changed.
export function adoptResearchedDomain(formData = {}, research = null) {
  const found = normaliseBusinessDomain(research?.emailDomainResearch?.emailDomain);
  const current = String(formData.emailDomain || '').trim().toLowerCase();
  if (!found || found === current) return {formData, changed: false, emailDomain: current};
  return {formData: {...formData, emailDomain: found}, changed: true, emailDomain: found};
}
