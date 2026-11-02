import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mergeRecruiterContact } from "../../src/application/recruiter-contact.js";
import { createRecruiterContactStore } from "../../src/application/recruiter-contact-store.js";

function contact(overrides = {}) {
  return {
    id: "reimport-contact",
    organisationId: "domain:original-company.test",
    firstName: "Jane",
    lastName: "Smith",
    fullName: "Jane Smith",
    linkedinUrl: "https://www.linkedin.com/in/synthetic-reimport-contact",
    role: "Old role",
    emailDomain: "original-company.test",
    emailCandidates: [
      "jane.smith@original-company.test",
      "smith.jane@original-company.test"
    ],
    selectedEmail: "jane.smith@original-company.test",
    emailSource: "inferred",
    sourceUrl: "https://www.linkedin.com/company/original/people/",
    linkedApplicationReviewIds: [],
    verified: false,
    lastImportedAt: 1,
    ...overrides
  };
}

const incoming = contact({
  role: "Updated role",
  emailDomain: "imported-company.test",
  emailCandidates: ["jane.smith@imported-company.test"],
  selectedEmail: "jane.smith@imported-company.test",
  sourceUrl: "https://www.linkedin.com/company/imported/people/",
  lastImportedAt: 2
});

test("re-import preserves supplied verified and unknown-source selected emails", () => {
  for (const overrides of [
    { emailSource: "supplied" },
    { verified: true },
    { emailSource: null }
  ]) {
    const existing = contact(overrides);
    const result = mergeRecruiterContact(existing, incoming);

    assert.equal(result.selectedEmail, existing.selectedEmail);
    assert.equal(result.emailDomain, existing.emailDomain);
    assert.deepEqual(result.emailCandidates, existing.emailCandidates);
    assert.equal(result.verified, existing.verified);
    assert.equal(result.role, "Updated role");
    assert.equal(result.lastImportedAt, 2);
  }
});

test("re-import preserves linked contact email state and review associations", () => {
  const existing = contact({
    linkedApplicationReviewIds: ["review-1", "review-2"]
  });
  const result = mergeRecruiterContact(existing, incoming);

  assert.equal(result.selectedEmail, existing.selectedEmail);
  assert.deepEqual(result.emailCandidates, existing.emailCandidates);
  assert.deepEqual(result.linkedApplicationReviewIds, ["review-1", "review-2"]);
  assert.equal(result.role, "Updated role");
});

test("ordinary unlinked inferred contacts can refresh inferred email data", () => {
  const result = mergeRecruiterContact(contact(), incoming);

  assert.equal(result.emailDomain, "imported-company.test");
  assert.equal(result.selectedEmail, "jane.smith@imported-company.test");
  assert.deepEqual(result.emailCandidates, incoming.emailCandidates);
});

test("saved manual email state survives store reload and duplicate re-import", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "email-reimport-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const filePath = path.join(directory, "contacts.json");
  const store = createRecruiterContactStore({ filePath });

  await store.upsertMany({
    organisationId: "domain:original-company.test",
    incomingContacts: [contact()]
  });
  await store.linkToReview({
    reviewId: "review-1",
    contactIds: ["reimport-contact"]
  });
  await store.updateLinkedEmailCandidates({
    reviewId: "review-1",
    emailDomain: "saved-company.test"
  });

  const reloaded = createRecruiterContactStore({ filePath });
  const result = await reloaded.upsertMany({
    organisationId: "domain:imported-company.test",
    incomingContacts: [incoming]
  });

  assert.equal(result.imported, 0);
  assert.equal(result.duplicates, 1);

  const contacts = await reloaded.listAll();
  assert.equal(contacts.length, 1);
  const stored = contacts[0];

  assert.equal(stored.emailDomainSource, "manual");
  assert.equal(stored.emailDomain, "saved-company.test");
  assert.equal(stored.selectedEmail, "jane.smith@saved-company.test");
  assert.deepEqual(stored.emailCandidates, [
    "jane.smith@saved-company.test",
    "smith.jane@saved-company.test"
  ]);
  assert.equal(stored.role, "Updated role");
  assert.deepEqual(stored.linkedApplicationReviewIds, ["review-1"]);
});
