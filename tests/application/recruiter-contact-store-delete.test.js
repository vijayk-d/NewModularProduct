import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRecruiterContactStore } from "../../src/application/recruiter-contact-store.js";

async function createStore() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "recruiter-contact-store-")
  );

  return {
    store: createRecruiterContactStore({
      filePath: path.join(directory, "contacts.json")
    }),
    filePath: path.join(directory, "contacts.json")
  };
}

function contact(id, linkedApplicationReviewIds = []) {
  return {
    id,
    organisationId: "domain:twinstream.com",
    fullName: id,
    role: "Recruitment Manager",
    linkedinUrl: `https://www.linkedin.com/in/${id}`,
    linkedApplicationReviewIds
  };
}

test("deletes selected unlinked contacts only", async () => {
  const { store, filePath } = await createStore();

  await store.upsertMany({
    organisationId: "domain:twinstream.com",
    incomingContacts: [
      contact("delete-me"),
      contact("keep-me"),
      contact("linked", ["review-1"])
    ]
  });

  const deleted = await store.deleteUnlinkedContacts({
    organisationId: "domain:twinstream.com",
    reviewId: "review-1",
    contactIds: ["delete-me"]
  });

  assert.deepEqual(
    deleted.map((item) => item.id),
    ["delete-me"]
  );

  const remaining = JSON.parse(await readFile(filePath, "utf8"));

  assert.deepEqual(
    remaining.map((item) => item.id),
    ["keep-me", "linked"]
  );
});

test("clears all unlinked contacts but protects linked contacts", async () => {
  const { store, filePath } = await createStore();

  await store.upsertMany({
    organisationId: "domain:twinstream.com",
    incomingContacts: [
      contact("unlinked-a"),
      contact("unlinked-b"),
      contact("linked", ["review-1"])
    ]
  });

  const deleted = await store.deleteUnlinkedContacts({
    organisationId: "domain:twinstream.com",
    reviewId: "review-1",
    contactIds: []
  });

  assert.deepEqual(
    deleted.map((item) => item.id),
    ["unlinked-a", "unlinked-b"]
  );

  const remaining = JSON.parse(await readFile(filePath, "utf8"));

  assert.deepEqual(
    remaining.map((item) => item.id),
    ["linked"]
  );
});