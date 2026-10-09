import { createRecruiterContact } from "./recruiter-contact.js";
import { normaliseRecruiterContact } from "./normalise-recruiter-contact.js";

export function createRecruiterContactImportService({ contactStore }) {
  return {
    async import({ sourceUrl, emailDomain, recruiters }) {
      if (!Array.isArray(recruiters) || recruiters.length === 0) {
        throw new Error("No recruiter contacts were supplied.");
      }

      const organisationId = deriveOrganisationId({
        emailDomain,
        sourceUrl
      });

      const incomingContacts = recruiters.map((recruiter) =>
        createRecruiterContact(
          normaliseRecruiterContact(recruiter, { organisationId })
        )
      );

      const result = await contactStore.upsertMany({
        organisationId,
        incomingContacts
      });

      return {
        ok: true,
        organisationId,
        imported: result.imported,
        duplicates: result.duplicates,
        total: result.imported + result.duplicates
      };
    }
  };
}

function deriveOrganisationId({ emailDomain, sourceUrl }) {
  if (emailDomain) {
    return `domain:${String(emailDomain)
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .trim()}`;
  }

  try {
    const hostname = new URL(sourceUrl).hostname
      .toLowerCase()
      .replace(/^www\./, "");

    if (hostname === "linkedin.com") {
      return "domain:linkedin.com";
    }

    if (hostname) {
      return `domain:${hostname}`;
    }
  } catch {
    // Fall through to the unknown organisation identifier.
  }

  return "unknown:linkedin-import";
}
