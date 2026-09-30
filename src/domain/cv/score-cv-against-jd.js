import { normalize, overlap, unique } from '../shared/text-normalization.js';

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
    `Add evidence for: ${
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
  const matchedKeywords = overlap(jobDescription.keywords, cvText);

  const missingKeywords = unique(
    jobDescription.keywords
      .filter((keyword) => !matchedKeywords.includes(normalize(keyword)))
  ).slice(0, 20);

  const keywordComponent = jobDescription.keywords.length
    ? (matchedKeywords.length / jobDescription.keywords.length) * 40
    : 0;

  const useCaseMatches = overlap(
    jobDescription.keywords,
    (cv.use_cases || []).join(' ')
  );

  const useCaseComponent = jobDescription.keywords.length
    ? (
      useCaseMatches.length /
      Math.max(1, Math.min(jobDescription.keywords.length, 5))
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
    matchedKeywords,
    missingKeywords,
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