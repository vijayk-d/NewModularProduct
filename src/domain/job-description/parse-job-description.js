import { normalize, unique } from '../shared/text-normalization.js';
import { extractJobKeywords } from './extract-job-keywords.js';
import { extractAtsTerms, eligibilityChecks, ATS_ENGINE_VERSION } from '../ats/ats-engine.js';

const methodologies = [
  'scrum',
  'safe',
  'kanban',
  'waterfall',
  'prince2',
  'lean',
  'agile',
  'devops',
  'ci/cd'
];

const seniorityTerms = [
  'chief',
  'head',
  'director',
  'lead',
  'principal',
  'senior',
  'manager',
  'mid',
  'junior'
];

const locationTerms = [
  'uk',
  'london',
  'europe',
  'uae',
  'dubai',
  'gcc',
  'saudi arabia',
  'remote',
  'hybrid',
  'onsite'
];

const domainTerms = [
  'financial services',
  'banking',
  'insurance',
  'government',
  'public sector',
  'technology',
  'cloud',
  'data',
  'healthcare'
];

const stopWords = new Set([
  'a', 'an', 'about', 'above', 'after', 'also', 'and', 'are', 'as', 'at',
  'be', 'been', 'being', 'below', 'but', 'can', 'could', 'do', 'for',
  'from', 'have', 'if', 'in', 'into', 'is', 'it', 'job', 'more', 'of',
  'on', 'or', 'our', 'role', 'should', 'so', 'such', 'that', 'the',
  'their', 'them', 'there', 'these', 'this', 'those', 'through', 'to',
  'under', 'using', 'via', 'we', 'were', 'with', 'will', 'would', 'you',
  'your'
]);

function findTerms(normalizedText, terms) {
  return unique(
    terms.filter((term) => normalizedText.includes(normalize(term)))
  );
}

function parseProvidedLocations(location = '') {
  return unique(
    String(location)
      .split(/[,;/|]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function parseJobDescription(text = '', provided = {}) {
  const rawText = String(text);
  const normalizedText = normalize(rawText);

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const inferredRole =
    lines[0]?.replace(/^[#>*\-\s]+/, '').trim() || 'Unspecified role';

  const suppliedLocation = parseProvidedLocations(provided.location);

  return {
    rawText,
    role: provided.role || inferredRole,
    seniority: findTerms(normalizedText, seniorityTerms),
    domain: findTerms(normalizedText, domainTerms),
    methodologies: findTerms(normalizedText, methodologies),
    keywords: extractJobKeywords(rawText),
    // Weighted ATS terms and eligibility (see src/domain/ats/ats-engine.js); keywords above stay for letter wording.
    atsTerms: extractAtsTerms(rawText, {organisationName: provided.organisationName || ''}),
    atsVersion: ATS_ENGINE_VERSION,
    eligibility: eligibilityChecks(rawText),
    location: suppliedLocation.length
      ? suppliedLocation
      : findTerms(normalizedText, locationTerms),
    scClearanceRequired:
      /\bsc clearance\b|security clearance|developed vetting|dv clearance/i
        .test(rawText)
  };
}