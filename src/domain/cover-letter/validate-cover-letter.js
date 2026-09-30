const allowedTokens = new Set([
  '{{firstname}}',
  '{{recipient}}',
  '{{role}}',
  '{{cvHighlights}}',
  '{{jdKeywords}}',
  '{{companyValues}}',
  '{{refinedCoverLetter}}',
  '{{atsScore}}',
  '{{evidence}}',
  '{{currentRoleEvidence}}',
  '{{domainValues}}',
  '{{regionalNote}}',
  '{{clearanceNote}}',
  '{{jobAdvertLink}}',
  '{{referenceSuffix}}'
]);

export function validateCoverLetter({
  plainText = '',
  richText = ''
} = {}) {
  const unresolved = [
    ...String(plainText).matchAll(/{{\s*([\w]+)\s*}}/g)
  ]
    .map((match) => match[1])
    .filter((token) => !allowedTokens.has(`{{${token}}}`));

  const filler = ['about, job, role', 'undefined', 'null'];

  const fillerMatches = filler.filter((phrase) =>
    String(plainText).toLowerCase().includes(phrase)
  );

  const wordCount = String(plainText)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

  const errors = [
    ...(unresolved.length
      ? [`Unresolved template tokens: ${unresolved.join(', ')}.`]
      : []),
    ...(fillerMatches.length
      ? [`Generic filler detected: ${fillerMatches.join(', ')}.`]
      : []),
    ...(!String(richText).includes('<a href=')
      ? ['The advert hyperlink is not embedded in rich text.']
      : [])
  ];

  return {
    valid: errors.length === 0,
    errors,
    wordCount
  };
}
