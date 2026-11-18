import { normalize, overlap } from '../shared/text-normalization.js';
import { extractAtsTerms, matchAtsTerms, termsFoundIn, eligibilityChecks } from '../ats/ats-engine.js';

const priorityScore = {
  'very-high': 10,
  high: 7,
  medium: 5,
  low: 2
};

function cvCorpus(cv) {
  return [
    cv.text,
    cv.role_name,
    cv.role_code,
    ...(cv.tags || []),
    ...(cv.use_cases || [])
  ].join(' ');
}

function suggestionsFor({ score, missingKeywords, scClearanceRequired }) {
  if (score >= 85) {
    return [];
  }

  return [
    `Where truthful, show evidence for: ${
      missingKeywords.slice(0, 5).join(', ') ||
      'the highest-priority JD requirements'
    }.`,
    'Mirror the employer wording in the experience and skills sections where truthful.',
    scClearanceRequired
      ? 'State SC/security clearance status explicitly if current and verifiable.'
      : 'Add measurable delivery outcomes to the most relevant role.'
  ];
}

export function scoreCvAgainstJd(jobDescription, cv) {
  const cvText = cvCorpus(cv);
  // Weighted job terms from the shared ATS engine; older saved job descriptions are re-read from their text.
  const terms = Array.isArray(jobDescription.atsTerms)
    ? jobDescription.atsTerms
    : extractAtsTerms(jobDescription.rawText || (jobDescription.keywords || []).join('\n'));
  const match = matchAtsTerms(terms, cvText);
  const matchedKeywords = match.matched;
  const missingKeywords = match.missing.slice(0, 20);

  const keywordComponent = (match.score / 100) * 40;

  const useCaseMatches = termsFoundIn(terms, (cv.use_cases || []).join('\n'));

  const useCaseComponent = terms.length
    ? (
      useCaseMatches.length /
      Math.max(1, Math.min(terms.length, 5))
    ) * 30
    : 0;

  const roleName = cv.role_name || '';

  const roleCategory = normalize(jobDescription.role).includes(normalize(roleName)) ||
    normalize(roleName).includes(normalize(jobDescription.role))
    ? 20
    : overlap(jobDescription.seniority, roleName).length
      ? 10
      : 0;

  const priorityRecency = priorityScore[cv.priority] || 0;

  const score = Math.min(
    100,
    Math.round(
      keywordComponent +
      Math.min(30, useCaseComponent) +
      roleCategory +
      priorityRecency
    )
  );

  return {
    score,
    // keywordScore: weighted share of job terms found. basis says whether the CV text or only its profile was read.
    keywordScore: match.score,
    basis: cv.text ? 'cv-text' : 'cv-profile',
    matchedKeywords,
    missingKeywords,
    eligibility: Array.isArray(jobDescription.eligibility) ? jobDescription.eligibility : eligibilityChecks(jobDescription.rawText || '', cvText),
    suggestions: suggestionsFor({
      score,
      missingKeywords,
      scClearanceRequired: jobDescription.scClearanceRequired
    }),
    components: {
      keywordMatch: Math.round(keywordComponent),
      useCaseAlignment: Math.round(Math.min(30, useCaseComponent)),
      roleCategory,
      priorityRecency
    }
  };
}