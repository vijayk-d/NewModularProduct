import { assertLetterBodySafe } from './cover-letter-controls.js';

export const OUTREACH_REDIRECTION = "I appreciate the convenience of ATS-based applications, but I believe strong talent is often best understood through a direct conversation. If you are not the direct contact for this position and feel my profile may align with the client's needs, I would be grateful for any redirection to the appropriate hiring manager or colleague.";

export function composeOutreachLetter({ draft, jobTitle, organisationName, advertUrl, candidateName, excludedEmployers = ['micro1'] }) {
  const singleLine = (value, label) => {
    const text = String(value || '').trim();
    if (!text || /[\r\n{}]/.test(text)) throw new Error(`${label} must be supplied as plain single-line text.`);
    return text;
  };
  const title = singleLine(jobTitle, 'Application role');
  const organisation = singleLine(organisationName, 'Organisation name');
  const name = singleLine(candidateName, 'Candidate name');
  const suppliedUrl = singleLine(advertUrl, 'Job advert URL');
  let parsed;
  try { parsed = new URL(suppliedUrl); } catch { throw new Error('A valid job advert URL is required.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Job advert URL must use HTTP or HTTPS.');
  const bodyText = extractOutreachExperienceBody(draft, excludedEmployers);

  return [
    'Dear {{firstname}},',
    `I am applying for the ${title} opportunity at ${organisation}. I would welcome a direct conversation about how my experience could support this role.`,
    `Job advert: ${suppliedUrl}`,
    bodyText,
    OUTREACH_REDIRECTION,
    `Warm regards,\n${name}`
  ].join('\n\n');
}

export function extractOutreachExperienceBody(draft, excludedEmployers = ['micro1']) {
  let body = String(draft || '').trim();
  body = body.replace(/^Dear[^\n]*\n*/i, '').trim();
  body = body.replace(/(?:^|\n)\s*(?:Warm regards|Kind regards|Best regards|Regards|Sincerely),?\s*\n[\s\S]*$/i, '').trim();
  let paragraphs = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length && /^(?:I am applying\b|I would like to apply\b|I am writing to (?:apply|express my interest)\b)/i.test(paragraphs[0])) {
    paragraphs.shift();
  }
  paragraphs = paragraphs.filter(p => !/^I appreciate the convenience of ATS-based applications\b/i.test(p)
    && !/^(?:LinkedIn(?: job advert)?|Job advert)\s*:/i.test(p));
  if (!paragraphs.length) throw new Error('The proposal needs substantive experience paragraphs.');
  const bodyText = paragraphs.join('\n\n');
  assertLetterBodySafe(bodyText, excludedEmployers);
  if (/\{\{[^{}]*\}\}/.test(bodyText)) throw new Error('The proposal contains unresolved placeholders or raw HTML.');
  return bodyText;
}
