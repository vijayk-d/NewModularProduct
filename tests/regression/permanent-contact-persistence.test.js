import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRecruiterContactStore } from "../../src/application/recruiter-contact-store.js";

function contact(id, links = []) {
  return {
    id,
    organisationId: "domain:synthetic-company.test",
    firstName: "Synthetic",
    lastName: id,
    fullName: `Synthetic ${id}`,
    linkedinUrl: `https://www.linkedin.com/in/synthetic-permanent-${id}`,
    emailDomain: "synthetic-company.test",
    selectedEmail: `synthetic.${id}@synthetic-company.test`,
    emailCandidates: [`synthetic.${id}@synthetic-company.test`],
    linkedApplicationReviewIds: links
  };
}

async function fixture(t) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "permanent-contact-persistence-")
  );
  t.after(() => rm(directory, { recursive: true, force: true }));

  const filePath = path.join(directory, "contacts.json");
  const store = createRecruiterContactStore({ filePath });
  await store.upsertMany({
    organisationId: "domain:synthetic-company.test",
    incomingContacts: [
      contact("remove", ["old-review-1", "old-review-2"]),
      contact("keep", ["active-review"]),
      contact("unlinked")
    ]
  });
  return { directory, filePath, store };
}

test("permanent deletion persists and backup retains the pre-deletion data", async (t) => {
  const f = await fixture(t);
  const before = JSON.parse(await readFile(f.filePath, "utf8"));

  const result = await f.store.permanentlyDeleteContacts({
    contactIds: ["remove"]
  });

  assert.equal(result.backupCreated, true);
  assert.deepEqual(result.deletedContacts.map((c) => c.id), ["remove"]);

  const reloaded = createRecruiterContactStore({ filePath: f.filePath });
  assert.deepEqual(
    (await reloaded.listAll()).map((c) => c.id).sort(),
    ["keep", "unlinked"].sort()
  );
  assert.equal((await reloaded.listByReview("old-review-1")).length, 0);
  assert.equal((await reloaded.listByReview("old-review-2")).length, 0);
  assert.equal((await reloaded.listByReview("active-review")).length, 1);

  const files = await readdir(f.directory);
  const backups = files.filter((name) =>
    name.startsWith("contacts.json.before-permanent-delete-") &&
    name.endsWith(".bak")
  );
  assert.equal(backups.length, 1);

  const backup = JSON.parse(
    await readFile(path.join(f.directory, backups[0]), "utf8")
  );
  assert.deepEqual(backup, before);
  assert.ok(!files.some((name) => name.endsWith(".tmp")));
});

test("invalid permanent deletion cannot become bulk deletion", async (t) => {
  const f = await fixture(t);
  const before = await readFile(f.filePath, "utf8");

  for (const contactIds of [undefined, [], "remove", [null], [" "]]) {
    await assert.rejects(
      f.store.permanentlyDeleteContacts({ contactIds }),
      /explicit contact IDs/
    );
    assert.equal(await readFile(f.filePath, "utf8"), before);
    assert.equal((await f.store.listAll()).length, 3);
  }

  const missing = await f.store.permanentlyDeleteContacts({
    contactIds: ["already-missing"]
  });
  assert.equal(missing.deletedContacts.length, 0);
  assert.equal(missing.backupCreated, false);

  const files = await readdir(f.directory);
  assert.deepEqual(files, ["contacts.json"]);
});
