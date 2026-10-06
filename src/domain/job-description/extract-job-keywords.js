import { normalize, tokenize, unique } from '../shared/text-normalization.js';

const stopWords = new Set([
  'a', 'an', 'about', 'above', 'after', 'again', 'also', 'and', 'are',
  'as', 'at', 'be', 'been', 'being', 'below', 'but', 'can', 'could',
  'do', 'does', 'for', 'from', 'have', 'has', 'had', 'if', 'in', 'into',
  'is', 'it', 'its', 'job', 'join', 'me', 'more', 'of', 'on', 'or',
  'our', 'role', 'so', 'such', 'that', 'the', 'their', 'them', 'there',
  'these', 'this', 'those', 'through', 'to', 'under', 'using', 'us',
  'via', 'we', 'were', 'with', 'will', 'would', 'you', 'your'
]);

const allowedShortTerms = new Set([
  'uk', 'sc', 'dv', 'qa', 'ai', 'saas', 'safe'
]);

function cleanToken(value) {
  const cleaned = normalize(String(value || ''))
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
    .trim();

  if (!cleaned) {
    return '';
  }

  if (stopWords.has(cleaned)) {
    return '';
  }

  if (cleaned.length < 3 && !allowedShortTerms.has(cleaned)) {
    return '';
  }

  return cleaned;
}

function singularCandidate(value) {
  if (value.endsWith('ies') && value.length > 4) {
    return `${value.slice(0, -3)}y`;
  }

  if (
    value.endsWith('s') &&
    !value.endsWith('ss') &&
    !value.endsWith('us') &&
    value.length > 4
  ) {
    return value.slice(0, -1);
  }

  return '';
}

export function extractJobKeywords(text = '') {
  const cleanedTokens = unique(
    tokenize(String(text))
      .map(cleanToken)
      .filter(Boolean)
  );

  const available = new Set(cleanedTokens);
  const output = [];
  const claimedSingulars = new Set();

  for (const token of cleanedTokens) {
    const singular = singularCandidate(token);

    if (singular && available.has(singular)) {
      output.push({ pendingSingular: singular });
      claimedSingulars.add(singular);
      continue;
    }

    if (claimedSingulars.has(token)) {
      output.push(token);
      continue;
    }

    output.push(token);
  }

  return unique(
    output.map((item) => item.pendingSingular || item)
  );
}
