function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00c2\u00b7/g, " ")
    .replace(/\u00c2\u00a3/g, "£")
    .replace(/\u00e2\u0080\u0099/g, "'")
    .replace(/\u00e2\u0080\u0093/g, "-")
    .replace(/\u00e2\u0080\u0094/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseName(value) {
  return cleanText(value)
    .replace(/^view\s+/i, "")
    .replace(/[’']s profile$/i, "")
    .replace(/\s*[·•]\s*\d+(st|nd|rd|th)?\s*/i, " ")
    .replace(/\s+\d+(st|nd|rd|th)\s*/i, " ")
    .trim();
}

function splitName(value) {
  const parts = normaliseName(value)
    .split(/\s+/)
    .filter(Boolean);

  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || ""
  };
}

function cleanRole(value, profileName) {
  let role = cleanText(value);

  if (profileName) {
    role = role.replace(profileName, "");
  }

  return role
    .replace(/\b\d+(st|nd|rd|th)\s+degree\s+connection\b/gi, "")
    .replace(/\b\d+(st|nd|rd|th)\b/gi, "")
    .replace(/\b\d+\s+(other\s+)?mutual connections?\b/gi, "")
    .replace(/\b(and|is)\s+a\s+mutual connection\b/gi, "")
    .replace(/\b(connect|message|follow)\b/gi, "")
    .replace(/\s*[·•]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseRecruiterContact(
  incoming,
  { organisationId }
) {
  const suppliedName = cleanText(
    incoming.fullName ||
      [incoming.firstName, incoming.lastName]
        .filter(Boolean)
        .join(" ")
  );

  const { firstName, lastName } = splitName(suppliedName);
  const role = cleanRole(
    incoming.role,
    [firstName, lastName].filter(Boolean).join(" ")
  );

  const emailDomain = cleanText(incoming.emailDomain)
    .replace(/^@/, "")
    .toLowerCase();

  const namePart = (value) =>
    cleanText(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const first = namePart(firstName);
  const last = namePart(lastName);

  let selectedEmail = cleanText(incoming.selectedEmail);
  let emailSource = selectedEmail
    ? cleanText(incoming.emailSource) || "supplied"
    : null;

  const emailCandidates = [];

  if (selectedEmail) {
    emailCandidates.push(selectedEmail);
  }

  if (emailDomain && first && last) {
    emailCandidates.push(
      `${first}.${last}@${emailDomain}`,
      `${last}.${first}@${emailDomain}`
    );
  }

  const uniqueCandidates = [...new Set(emailCandidates)];

  if (!selectedEmail && uniqueCandidates.length) {
    selectedEmail = uniqueCandidates[0];
    emailSource = "inferred";
  }
  return {
    ...incoming,
    organisationId,
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" "),
    role,
    location: cleanText(incoming.location),
    linkedinUrl: cleanText(incoming.linkedinUrl),
    emailDomain,
    emailCandidates: uniqueCandidates,
    selectedEmail,
    emailSource,
    source: "linkedin-visible",
    verified: false
  };
}