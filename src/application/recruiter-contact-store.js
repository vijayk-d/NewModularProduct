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


  async updateLinkedEmailCandidates({ reviewId, emailDomain }) {
    if (typeof reviewId !== "string" || !reviewId.trim()) {
      throw new Error("A review ID is required.");
    }

    const domain = String(emailDomain || "").trim().toLowerCase();
    const labels = domain.split(".");
    const blocked = [
      "linkedin.com", "gmail.com", "googlemail.com",
      "outlook.com", "hotmail.com", "yahoo.com", "icloud.com",
      "example.com", "example.org", "example.net"
    ];

    if (
      domain.length > 253 ||
      labels.length < 2 ||
      !labels.every((label) =>
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
      ) ||
      !/^[a-z]{2,63}$/.test(labels.at(-1)) ||
      blocked.some((value) =>
        domain === value || domain.endsWith(`.${value}`)
      )
    ) {
      throw new Error("A valid business email domain is required.");
    }

    const namePart = (value) => String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    const contacts = await load();
    const changed = [];

    const nextContacts = contacts.map((contact) => {
      if (
        !Array.isArray(contact.linkedApplicationReviewIds) ||
        !contact.linkedApplicationReviewIds.includes(reviewId)
      ) {
        return contact;
      }

      const first = namePart(contact.firstName);
      const last = namePart(contact.lastName);

      if (!first || !last) {
        return contact;
      }

      const generated = [...new Set([
        `${first}.${last}@${domain}`,
        `${last}.${first}@${domain}`
      ])];

      const existingSelected = String(contact.selectedEmail || "").trim();
      const preserveSelected = Boolean(
        existingSelected &&
        (contact.verified === true || contact.emailSource !== "inferred")
      );

      const updatedContact = {
        ...contact,
        emailDomain: domain,
        emailCandidates: [...new Set([
          ...(preserveSelected ? [existingSelected] : []),
          ...generated
        ])],
        selectedEmail: preserveSelected ? existingSelected : generated[0],
        emailSource: preserveSelected
          ? contact.emailSource || "supplied"
          : "inferred"
      };

      changed.push(updatedContact);
      return updatedContact;
    });

    if (changed.length) {
      await save(nextContacts);
    }

    return changed;
  },

  async deleteUnlinkedContacts({
    organisationId,
    reviewId,
    contactIds
  }) {
    if (
      contactIds !== undefined &&
      !Array.isArray(contactIds)
    ) {
      throw new Error("Contact IDs must be an array.");
    }

    const isBulkClear =
      contactIds === undefined || contactIds.length === 0;

    if (
      isBulkClear &&
      (typeof organisationId !== "string" || !organisationId.trim())
    ) {
      throw new Error("An organisation ID is required for deletion.");
    }

    const contacts = await load();
    const requestedIds = new Set(contactIds || []);
    const clearAll = contactIds === undefined || contactIds.length === 0;
    const deletedContacts = [];

    const remainingContacts = contacts.filter((contact) => {
      const belongsToOrganisation =
        contact.organisationId === organisationId;

      const isLinked =
        Array.isArray(contact.linkedApplicationReviewIds) &&
        contact.linkedApplicationReviewIds.length > 0;

      const isRequested =
        clearAll || requestedIds.has(contact.id);

      const shouldDelete =
        !isLinked &&
        isRequested &&
        (!clearAll || belongsToOrganisation);

      if (shouldDelete) {
        deletedContacts.push(contact);
        return false;
      }

      return true;
    });

    await save(remainingContacts);
    return deletedContacts;
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