export function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value = '') {
  return normalize(value)
    .split(/[^a-z0-9/+.#-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function unique(values = []) {
  return [...new Set(values)];
}

export function overlap(terms = [], text = '') {
  const normalizedText = normalize(text);

  return unique(
    terms
      .map((term) => normalize(term))
      .filter(Boolean)
      .filter((term) => normalizedText.includes(term))
  );
}