import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRecruiterContactStore } from "../../src/application/recruiter-contact-store.js";

function contact(id) {
  return {
    id,
    organisationId: "domain:queue-company.test",
    firstName: "Synthetic",
    lastName: id,
    fullName: `Synthetic ${id}`,
    linkedinUrl: `https://www.linkedin.com/in/synthetic-queue-${id}`,
    linkedApplicationReviewIds: []
  };
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "contact-queue-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "contacts.json");
  const store = createRecruiterContactStore({ filePath });
  await store.upsertMany({
    organisationId: "domain:queue-company.test",
    incomingContacts: [contact("remove"), contact("keep")]
  });
  return { directory, filePath, store };
}

test("overlapping delete import and link retain all intended changes", async (t) => {
  const f = await fixture(t);

  await Promise.all([
    f.store.permanentlyDeleteContacts({ contactIds: ["remove"] }),
    f.store.upsertMany({
      organisationId: "domain:queue-company.test",
      incomingContacts: [contact("new")]
    }),
    f.store.linkToReview({
      reviewId: "review-1",
      contactIds: ["keep"]
    })
  ]);

  const disk = JSON.parse(await readFile(f.filePath, "utf8"));
  assert.deepEqual(disk.map((c) => c.id).sort(), ["keep", "new"]);
  assert.deepEqual(
    disk.find((c) => c.id === "keep").linkedApplicationReviewIds,
    ["review-1"]
  );
  assert.deepEqual(await f.store.listAll(), disk);

  const files = await readdir(f.directory);
  assert.ok(!files.some((name) => name.endsWith(".tmp")));
});

test("queued permanent deletion rechecks a preceding current-review link", async (t) => {
  const f = await fixture(t);

  const linked = f.store.linkToReview({
    reviewId: "current-review",
    contactIds: ["remove"]
  });
  const deleted = f.store.permanentlyDeleteContacts({
    reviewId: "current-review",
    contactIds: ["remove"]
  });

  await linked;
  await assert.rejects(deleted, {
    code: "CONTACT_LINKED_TO_CURRENT_REVIEW"
  });

  assert.equal((await f.store.listAll()).length, 2);
  assert.equal((await f.store.listByReview("current-review")).length, 1);
});

test("a rejected operation does not block subsequent writes", async (t) => {
  const f = await fixture(t);

  await assert.rejects(
    f.store.permanentlyDeleteContacts({ contactIds: [] }),
    /explicit contact IDs/
  );

  await f.store.linkToReview({
    reviewId: "after-failure",
    contactIds: ["keep"]
  });

  const reloaded = createRecruiterContactStore({ filePath: f.filePath });
  assert.equal((await reloaded.listByReview("after-failure")).length, 1);
});
