export function createRecruiterContact(input, { now = Date.now } = {}) {
  const firstName = clean(input.firstName);
  const lastName = clean(input.lastName);
  const linkedinUrl = clean(input.linkedinUrl);

  if (!firstName || !lastName) {
    throw new Error("A recruiter contact requires both a first and last name.");
  }

  if (!linkedinUrl) {
    throw new Error("A recruiter contact requires a LinkedIn profile URL.");
  }

  const timestamp = now();

  return {
    id: `contact_${crypto.randomUUID()}`,
    organisationId: clean(input.organisationId),
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    role: clean(input.role),
    linkedinUrl: linkedinUrl.split("?")[0],
    emailDomain: clean(input.emailDomain) || null,
    emailCandidates: [],
    selectedEmail: null,
    source: clean(input.source) || "linkedin-visible",
    sourceUrl: clean(input.sourceUrl),
    verified: Boolean(input.verified),
    outreachStatus: "new",
    firstImportedAt: timestamp,
    lastImportedAt: timestamp
  };
}

export function isDuplicateContact(existing, incoming) {
  if (existing.linkedinUrl && incoming.linkedinUrl) {
    return normaliseUrl(existing.linkedinUrl) === normaliseUrl(incoming.linkedinUrl);
  }

  return (
    existing.fullName.toLowerCase() === incoming.fullName.toLowerCase() &&
    existing.emailDomain?.toLowerCase() === incoming.emailDomain?.toLowerCase()
  );
}

export function mergeRecruiterContact(existing, incoming) {
  return {
    ...existing,
    role: incoming.role || existing.role,
    emailDomain: incoming.emailDomain || existing.emailDomain,
    sourceUrl: incoming.sourceUrl || existing.sourceUrl,
    lastImportedAt: incoming.lastImportedAt
  };
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normaliseUrl(value) {
  return value.split("?")[0].replace(/\/$/, "").toLowerCase();
}