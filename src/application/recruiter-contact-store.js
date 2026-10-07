import { promises as fs } from "node:fs";
import path from "node:path";
import {
  isDuplicateContact,
  mergeRecruiterContact
} from "./recruiter-contact.js";

export function createRecruiterContactStore({ filePath }) {
  let cache = null;

  return {
    async listAll() {
      return load();
    },

    async listByReview(reviewId) {
      const contacts = await load();

      return contacts.filter((contact) =>
        Array.isArray(contact.linkedApplicationReviewIds) &&
        contact.linkedApplicationReviewIds.includes(reviewId)
      );
    },

    async linkToReview({ reviewId, contactIds }) {
      const contacts = await load();
      const linked = [];

      for (const contact of contacts) {
        if (!contactIds.includes(contact.id)) {
          continue;
        }

        contact.linkedApplicationReviewIds = Array.isArray(
          contact.linkedApplicationReviewIds
        )
          ? contact.linkedApplicationReviewIds
          : [];

        if (!contact.linkedApplicationReviewIds.includes(reviewId)) {
          contact.linkedApplicationReviewIds.push(reviewId);
        }

        linked.push(contact);
      }

      await save(contacts);

      return linked;
    },

    async listByOrganisation(organisationId) {
      const contacts = await load();
      return contacts.filter(
        (contact) => contact.organisationId === organisationId
      );
    },

    async upsertMany({ organisationId, incomingContacts }) {
    const contacts = await load();
    const result = {
        imported: 0,
        duplicates: 0
    };

    for (const incoming of incomingContacts) {
        const existing = contacts.find((contact) =>
        isDuplicateContact(contact, incoming)
        );

        if (existing) {
        Object.assign(
            existing,
            mergeRecruiterContact(existing, {
            ...incoming,
            lastImportedAt: Date.now()
            })
        );

        result.duplicates += 1;
        continue;
        }

        contacts.push(incoming);
        result.imported += 1;
    }

    await save(contacts);

    return result;
    }  };

  async function load() {
    if (cache) return cache;

    try {
      cache = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
      cache = [];
    }

    return cache;
  }

  async function save(contacts) {
    cache = contacts;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(contacts, null, 2), "utf8");
  }
}