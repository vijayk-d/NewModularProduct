import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  isDuplicateContact,
  mergeRecruiterContact
} from "./recruiter-contact.js";

export function createRecruiterContactStore({ filePath }) {
  let cache = null;
  let operationQueue = Promise.resolve();

  const store = {
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
        emailDomainSource: "manual",
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


  async unlinkFromReview({ reviewId, contactIds }) {
    if (typeof reviewId !== "string" || !reviewId.trim()) {
      throw new Error("A review ID is required.");
    }
    if (
      !Array.isArray(contactIds) ||
      contactIds.some((id) => typeof id !== "string" || !id.trim())
    ) {
      throw new Error("Contact IDs must be an array of non-empty strings.");
    }

    const ids = new Set(contactIds.map((id) => id.trim()));
    const contacts = await load();
    const unlinked = [];

    const next = contacts.map((contact) => {
      if (
        !ids.has(contact.id) ||
        !Array.isArray(contact.linkedApplicationReviewIds) ||
        !contact.linkedApplicationReviewIds.includes(reviewId)
      ) {
        return contact;
      }

      const updatedContact = {
        ...contact,
        linkedApplicationReviewIds:
          contact.linkedApplicationReviewIds.filter((id) => id !== reviewId)
      };
      unlinked.push(updatedContact);
      return updatedContact;
    });

    if (unlinked.length) {
      try {
        await save(next);
      } catch (error) {
        cache = contacts;
        throw error;
      }
    }
    return unlinked;
  },


  async permanentlyDeleteContacts({ contactIds, reviewId }) {
    if (
      !Array.isArray(contactIds) ||
      !contactIds.length ||
      contactIds.some((id) => typeof id !== "string" || !id.trim())
    ) {
      throw new Error("Select explicit contact IDs for permanent deletion.");
    }

    const ids = new Set(contactIds.map((id) => id.trim()));
    const contacts = await load();
    const deletedContacts = contacts.filter((contact) => ids.has(contact.id));

    if (reviewId !== undefined) {
      if (typeof reviewId !== "string" || !reviewId.trim()) {
        throw new Error("A valid review ID is required.");
      }

      if (deletedContacts.some((contact) =>
        Array.isArray(contact.linkedApplicationReviewIds) &&
        contact.linkedApplicationReviewIds.includes(reviewId)
      )) {
        const error = new Error(
          "A selected contact is linked to this application. Unlink it first."
        );
        error.code = "CONTACT_LINKED_TO_CURRENT_REVIEW";
        throw error;
      }
    }

    if (!deletedContacts.length) {
      return { deletedContacts: [], backupCreated: false };
    }

    const remaining = contacts.filter((contact) => !ids.has(contact.id));
    const suffix = `${Date.now()}-${randomUUID()}`;
    const backupPath = `${filePath}.before-permanent-delete-${suffix}.bak`;
    const temporaryPath = `${filePath}.permanent-delete-${suffix}.tmp`;

    // Back up the current file before replacing it.
    await fs.copyFile(filePath, backupPath);

    try {
      await fs.writeFile(
        temporaryPath,
        JSON.stringify(remaining, null, 2),
        { encoding: "utf8", flag: "wx" }
      );
      await fs.rename(temporaryPath, filePath);
      cache = remaining;
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }

    return { deletedContacts, backupCreated: true };
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

  return Object.fromEntries(
    Object.entries(store).map(([name, operation]) => [
      name,
      (...args) => {
        try {
          const argumentSnapshot = structuredClone(args);
          const result = operationQueue.then(async () => {
            const previousCache = cache === null ? null : structuredClone(cache);
            try {
              const value = await operation(...argumentSnapshot);
              return structuredClone(value);
            } catch (error) {
              cache = previousCache;
              throw error;
            }
          });
          operationQueue = result.then(() => undefined, () => undefined);
          return result;
        } catch (error) {
          return Promise.reject(error);
        }
      }
    ])
  );

  async function load() {
    if (cache !== null) return cache;

    let content;
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch (cause) {
      if (cause.code === "ENOENT") {
        cache = [];
        return cache;
      }

      const error = new Error(
        "The contact store could not be read. " +
        "No contact data has been replaced.",
        { cause }
      );
      error.code = "CONTACT_STORE_READ_FAILED";
      throw error;
    }

    let parsed;
    try {
      parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
    } catch (cause) {
      const error = new Error(
        "The contact store contains invalid JSON. " +
        "Repair it or restore a backup before changing contacts.",
        { cause }
      );
      error.code = "CONTACT_STORE_INVALID";
      throw error;
    }

    if (
      !Array.isArray(parsed) ||
      parsed.some((contact) =>
        !contact ||
        typeof contact !== "object" ||
        Array.isArray(contact) ||
        typeof contact.id !== "string" ||
        !contact.id.trim()
      )
    ) {
      const error = new Error(
        "The contact store must contain an array of contact records " +
        "with non-empty IDs. No contact data has been replaced."
      );
      error.code = "CONTACT_STORE_INVALID";
      throw error;
    }

    cache = parsed;
    return cache;
  }

  async function save(contacts) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.save-${randomUUID()}.tmp`;

    try {
      await fs.writeFile(
        temporaryPath,
        JSON.stringify(contacts, null, 2),
        { encoding: "utf8", flag: "wx" }
      );
      await fs.rename(temporaryPath, filePath);
      cache = contacts;
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
  }
}