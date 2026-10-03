import { fillTemplate } from './fill-template.js';
import { validateCoverLetter } from './validate-cover-letter.js';
import { normalize } from '../shared/text-normalization.js';

const ATS_REDIRECTION_PARAGRAPH =
  'I appreciate the convenience of ATS-based applications, but I believe strong talent is often best understood through a direct conversation. If you are not the direct contact for this position and feel my profile may align with the client\'s needs, I would be grateful for any redirection to the appropriate hiring manager or colleague.';

  const CITATION_MARKER_PATTERN = /\[\d+\]/g;

const genericKeywords = new Set([
  'about',
  'advertised',
  'application',
  'based',
  'candidate',
  'company',
  'experience',
  'job',
  'location',
  'opportunity',
  'position',
  'role',
  'team',
  'work',
  'management',
  'required',
  'requiring',
  'responsibilities',
  'responsibility'
]);

const highlightStopWords = new Set([
  'a', 'an', 'about', 'above', 'after', 'also', 'and', 'are', 'as', 'at',
  'be', 'been', 'being', 'below', 'but', 'can', 'could', 'do', 'for',
  'from', 'have', 'if', 'in', 'into', 'is', 'it', 'job', 'more', 'of',
  'on', 'or', 'our', 'role', 'should', 'so', 'such', 'that', 'the',
  'their', 'them', 'there', 'these', 'this', 'those', 'through', 'to',
  'under', 'using', 'via', 'we', 'were', 'with', 'will', 'would', 'you',
  'your'
]);

const htmlTagSplitPattern = /(<[^>]+>)/g;

function toText(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(', ');
  }

  return String(value || '').trim();
}

function toScoreText(value) {
  if (value && typeof value === 'object' && 'score' in value) {
    return `${value.score}%`;
  }

  return value === undefined || value === null || value === ''
    ? ''
    : String(value);
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeGreeting(text = '', firstname = '{{firstname}}') {
  const body = String(text || '').trim();
  const recipient = String(firstname || '{{firstname}}').trim() ||
    '{{firstname}}';
  const salutation = `Dear ${recipient},`;

  if (!body) {
    return salutation;
  }

  const lines = body.split(/\r?\n/);

  if (/^dear\b/i.test(lines[0].trim())) {
    lines[0] = salutation;
    return lines.join('\n').trim();
  }

  return `${salutation}\n\n${body}`;
}

function stripCitationMarkers(text = '') {
  return String(text || '')
    .replace(CITATION_MARKER_PATTERN, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\.(?=[,;:!?])/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .trim();
}

function ensureAtsRedirectionParagraph(text = '') {
  const body = String(text || '').trim();

  if (!body || body.includes(ATS_REDIRECTION_PARAGRAPH)) {
    return body;
  }

  const closingPattern =
    /\n\n((?:Thank you for considering my application\.[\s\S]*)|(?:Warm regards,[\s\S]*)|(?:Kind regards,[\s\S]*)|(?:Best regards,[\s\S]*)|(?:Regards,[\s\S]*))$/i;

  const closingMatch = body.match(closingPattern);

  if (closingMatch) {
    return body.replace(
      closingMatch[1],
      `${ATS_REDIRECTION_PARAGRAPH}\n\n${closingMatch[1]}`
    );
  }

  return `${body}\n\n${ATS_REDIRECTION_PARAGRAPH}`;
}

function meaningfulKeywords(jobDescription) {
  const roleWords = new Set(
    String(jobDescription.role || '')
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter(Boolean)
  );

  const phraseCandidates = [
    'stakeholder management',
    'enterprise transformation',
    'financial services',
    'public sector',
    'cloud delivery',
    'technical delivery',
    'program management',
    'project delivery'
  ];

  const rawText = String(jobDescription.rawText || '').toLowerCase();

  const phrases = phraseCandidates.filter((phrase) =>
    rawText.includes(phrase)
  );

  const phraseWords = new Set(
    phrases.flatMap((phrase) => phrase.split(' '))
  );

  const locations = jobDescription.location || [];

  const locationWords = new Set(
    [...locations, 'uk', 'london', 'europe', 'uae', 'dubai', 'gcc',
      'saudi arabia', 'remote', 'hybrid', 'onsite']
      .flatMap((location) =>
        String(location).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
      )
  );

  const values = [
    ...(jobDescription.methodologies || []),
    ...(jobDescription.domain || []),
    ...(jobDescription.keywords || [])
  ];

  const words = values
    .map((value) => String(value).trim().replace(/[.,;:!?]+$/, ''))
    .filter((value) => {
      const normalized = normalize(value);

      return value.length > 2 &&
        !genericKeywords.has(normalized) &&
        !roleWords.has(normalized) &&
        !phraseWords.has(normalized) &&
        !locationWords.has(normalized) &&
        !locations.some((location) =>
          normalize(location) === normalized
        );
    });

  return [...new Set([...phrases, ...words])]
    .slice(0, 8)
    .map((value) => value.replace(/\b\w/g, (letter) => letter.toUpperCase()));
}

function smartHighlightTerms(
  jobDescription,
  text = '',
  preferredPhrases = []
) {
  const body = normalize(text);

  const preferred = Array.isArray(preferredPhrases)
    ? preferredPhrases
    : [preferredPhrases];

  const candidates = preferred.length
    ? preferred
    : [
      ...(jobDescription.methodologies || []),
      ...(jobDescription.domain || []),
      ...(jobDescription.keywords || []),
      ...meaningfulKeywords(jobDescription)
    ];

  return [...new Set(
    candidates
      .map((term) => String(term || '').trim())
      .filter(Boolean)
  )]
    .filter((term) => {
      const normalized = normalize(term);

      return normalized.length >= 3 &&
        !highlightStopWords.has(normalized) &&
        !genericKeywords.has(normalized) &&
        body.includes(normalized);
    })
    .sort((left, right) => right.length - left.length)
    .slice(0, 8);
}

function highlightTermsInHtml(html = '', terms = []) {
  const keywords = [...new Set(
    (Array.isArray(terms) ? terms : [terms])
      .map((term) => String(term || '').trim())
      .filter(Boolean)
  )].sort((left, right) => right.length - left.length);

  if (!keywords.length) {
    return String(html);
  }

  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${keywords.map(escapeRegExp).join('|')})(?=[^\\p{L}\\p{N}]|$)`,
    'giu'
  );

  return String(html)
    .split(htmlTagSplitPattern)
    .map((segment) => {
      if (!segment || segment.startsWith('<')) {
        return segment;
      }

      return segment.replace(
        pattern,
        (_, prefix, match) =>
          `${prefix}<span data-highlight="true" style="background-color: #fff2a8; color: inherit;">${match}</span>`
      );
    })
    .join('');
}

function templateIsUsable(template) {
  return typeof template === 'string' && template.trim().length > 0;
}

export function generateCoverLetter({
  template,
  jobDescription,
  jd,
  cv,
  bestCv,
  candidateProfile = {},
  recruiter,
  recruiterName,
  companyValues = [],
  refinedCoverLetter = '',
  finalCoverLetter = '',
  atsScore = '',
  cvHighlights = [],
  jdKeywords = [],
  domainMapping = {},
  variantProfiles = {},
  variant = 'default',
  jobAdvertLink = '',
  jobReference = '',
  highlightPhrases = []
} = {}) {
  if (!templateIsUsable(template)) {
    throw new Error('A non-empty cover-letter template is required.');
  }

  const parsedJobDescription = jobDescription || jd;

  if (!parsedJobDescription) {
    throw new Error('A parsed job description is required.');
  }

  const selectedCv = cv || bestCv || {};
  const profile = variantProfiles[variant] ||
    variantProfiles.default ||
    {};

  const recruiterFirstName = String(
    recruiterName || recruiter?.firstname || ''
  ).trim();

  const matchedDomains = (parsedJobDescription.domain || [])
    .flatMap((domain) => domainMapping[domain] || []);

  const highlights = profile.highlights ||
    toText(cvHighlights) ||
    (selectedCv.use_cases || []).slice(0, 3).join(', ') ||
    selectedCv.role_name ||
    'relevant delivery experience';

  const cvText = [
    selectedCv.role_name,
    ...(selectedCv.tags || []),
    ...(selectedCv.use_cases || [])
  ].join(' ').toLowerCase();

  const supportedMethods = (parsedJobDescription.methodologies || [])
    .filter((method) => cvText.includes(String(method).toLowerCase()));

  const methods = supportedMethods.length
    ? supportedMethods.join(' and ')
    : 'pragmatic delivery practices';

  const evidence = profile.evidence ||
    `My relevant experience includes ${highlights}. In these settings, I used ${methods} to coordinate delivery, manage dependencies, and improve collaboration across stakeholders.`;

  const currentRoleEvidence = profile.currentRoleEvidence ||
    candidateProfile.currentRoleEvidence ||
    '';

  const defaultDomainValues = candidateProfile.defaultDomainValues ||
    'I would bring a practical, customer-focused approach to delivery and continuous improvement.';

  const domainValues = profile.domainValues ||
    (matchedDomains.length
      ? `I would bring a practical focus on ${matchedDomains.slice(0, 3).join(', ')}.`
      : defaultDomainValues);

  const regionalNote = (parsedJobDescription.location || [])
    .some((location) =>
      ['uae', 'dubai', 'gcc'].includes(String(location).toLowerCase())
    )
      ? candidateProfile.uaeResidencyNote ||
        'I can support a prompt joining process in the UAE.'
      : '';

  const clearanceNote = parsedJobDescription.scClearanceRequired
    ? candidateProfile.clearanceNote ||
      'I understand that this role requires security clearance and would be pleased to discuss verified eligibility and status.'
    : 'I would be pleased to discuss the role and its priorities.';

  const referenceSuffix = jobReference ? ` (Ref: ${jobReference})` : '';
  const keywordText = toText(jdKeywords) ||
    meaningfulKeywords(parsedJobDescription).join(', ');

  const firstname = recruiterFirstName || '{{firstname}}';

  const recipient = String(
    candidateProfile.displayName ||
    candidateProfile.name ||
    candidateProfile.firstName ||
    'Candidate'
  ).trim() || 'Candidate';

  const generatedCoverLetter = stripCitationMarkers(
    finalCoverLetter || refinedCoverLetter || ''
  );

  const refinedCoverLetterText = generatedCoverLetter
    ? normalizeGreeting(generatedCoverLetter, firstname)
    : '';

  const templateBody = fillTemplate(template, {
    firstname,
    recipient,
    role: parsedJobDescription.role,
    cvHighlights: highlights,
    jdKeywords: keywordText,
    companyValues: toText(companyValues)
      ? `I would also align with company values such as ${toText(companyValues)}.`
      : '',
    refinedCoverLetter: refinedCoverLetterText,
    atsScore: toScoreText(atsScore),
    evidence,
    currentRoleEvidence,
    domainValues,
    regionalNote,
    clearanceNote,
    jobAdvertLink,
    referenceSuffix
  });

  const plainText = ensureAtsRedirectionParagraph(
    refinedCoverLetterText || templateBody
  );

  const subject = `Application for ${parsedJobDescription.role}` +
    `${jobAdvertLink ? ' | LinkedIn' : ''}` +
    `${referenceSuffix} | ${recipient}`;
    
  const selectedHighlights = smartHighlightTerms(
    parsedJobDescription,
    plainText,
    highlightPhrases
  );

  const richText = highlightTermsInHtml(
    plainText.replace(/\n\n/g, '<p>').replace(/\n/g, '<br>'),
    selectedHighlights
  );

  const validation = validateCoverLetter({ plainText, richText });

  return {
    subject,
    richText,
    plainText,
    validation,
    variant,
    variantLabel: profile.label || variant,
    templateBody,
    companyValues: toText(companyValues),
    refinedCoverLetter: refinedCoverLetterText,
    highlightPhrases: selectedHighlights
  };
}
