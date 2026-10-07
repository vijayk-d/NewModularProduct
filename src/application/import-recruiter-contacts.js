import {
  createRecruiterContact,
  isDuplicateContact,
  mergeRecruiterContact
} from "./recruiter-contact.js";

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
        createRecruiterContact({
          ...recruiter,
          organisationId,
          emailDomain,
          sourceUrl
        })
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
    return `domain:${emailDomain.toLowerCase()}`;
  }

  try {
    const hostname = new URL(sourceUrl).hostname;

    return `linkedin:${hostname}`;
  } catch {
    return "organisation:unknown";
  }
}