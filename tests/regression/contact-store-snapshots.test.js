import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRecruiterContactStore } from "../../src/application/recruiter-contact-store.js";

const organisationId = "domain:snapshot-company.test";

function contact(id = "one") {
  return {
    id,
    organisationId,
    firstName: "Jane",
    lastName: "Smith",
    fullName: "Jane Smith",
    role: "Recruitment Manager",
    linkedinUrl: `https://www.linkedin.com/in/synthetic-snapshot-${id}`,
    emailDomain: "snapshot-company.test",
    emailSource: "inferred",
    selectedEmail: "jane.smith@snapshot-company.test",
    emailCandidates: ["jane.smith@snapshot-company.test"],
    linkedApplicationReviewIds: []
  };
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "contact-snapshots-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "contacts.json");
  const store = createRecruiterContactStore({ filePath });
  return { filePath, store };
}

test("all contact read methods return detached nested snapshots", async (t) => {
  const f = await fixture(t);
  await f.store.upsertMany({
    organisationId,
    incomingContacts: [contact()]
  });
  await f.store.linkToReview({
    reviewId: "review-1",
    contactIds: ["one"]
  });

  const expected = await f.store.listAll();

  for (const read of [
    () => f.store.listAll(),
    () => f.store.listByOrganisation(organisationId),
    () => f.store.listByReview("review-1")
  ]) {
    const snapshot = await read();
    snapshot[0].fullName = "Changed outside store";
    snapshot[0].emailCandidates.push("outside@other-company.test");
    snapshot[0].linkedApplicationReviewIds.length = 0;
    snapshot.push(contact("outside"));

    assert.deepEqual(await f.store.listAll(), expected);
    assert.deepEqual(
      JSON.parse(await readFile(f.filePath, "utf8")),
      expected
    );
  }
});

test("import arguments are captured before queued execution and stay detached", async (t) => {
  const f = await fixture(t);
  const incoming = contact();
  const request = {
    organisationId,
    incomingContacts: [incoming]
  };

  const pending = f.store.upsertMany(request);

  incoming.fullName = "Changed immediately after call";
  incoming.emailCandidates.push("outside@other-company.test");
  request.incomingContacts.push(contact("outside"));

  await pending;

  let stored = await f.store.listAll();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].fullName, "Jane Smith");
  assert.deepEqual(stored[0].emailCandidates, [
    "jane.smith@snapshot-company.test"
  ]);

  incoming.linkedApplicationReviewIds.push("outside-review");
  await f.store.linkToReview({
    reviewId: "real-review",
    contactIds: ["one"]
  });

  stored = await f.store.listAll();
  assert.deepEqual(stored[0].linkedApplicationReviewIds, ["real-review"]);
  assert.deepEqual(
    JSON.parse(await readFile(f.filePath, "utf8")),
    stored
  );
});

test("link email-update and unlink results cannot mutate stored contacts", async (t) => {
  const f = await fixture(t);
  await f.store.upsertMany({
    organisationId,
    incomingContacts: [contact()]
  });

  const linkRequest = {
    reviewId: "review-1",
    contactIds: ["one"]
  };
  const pendingLink = f.store.linkToReview(linkRequest);
  linkRequest.contactIds[0] = "missing";

  const linked = await pendingLink;
  assert.equal(linked.length, 1);
  linked[0].linkedApplicationReviewIds.push("outside-review");
  linked[0].emailCandidates.length = 0;

  let stored = (await f.store.listAll())[0];
  assert.deepEqual(stored.linkedApplicationReviewIds, ["review-1"]);
  assert.equal(stored.emailCandidates.length, 1);

  const updated = await f.store.updateLinkedEmailCandidates({
    reviewId: "review-1",
    emailDomain: "saved-company.test"
  });
  updated[0].emailCandidates.length = 0;
  updated[0].selectedEmail = "outside@other-company.test";

  stored = (await f.store.listAll())[0];
  assert.equal(stored.emailCandidates.length, 2);
  assert.equal(stored.selectedEmail, "jane.smith@saved-company.test");

  const unlinked = await f.store.unlinkFromReview({
    reviewId: "review-1",
    contactIds: ["one"]
  });
  unlinked[0].linkedApplicationReviewIds.push("outside-review");
  unlinked[0].fullName = "Outside mutation";

  stored = (await f.store.listAll())[0];
  assert.deepEqual(stored.linkedApplicationReviewIds, []);
  assert.equal(stored.fullName, "Jane Smith");
});

test("uncloneable input rejects without blocking the operation queue", async (t) => {
  const f = await fixture(t);

  await assert.rejects(
    f.store.upsertMany({
      organisationId,
      incomingContacts: [{
        ...contact(),
        callback: () => {}
      }]
    })
  );

  await f.store.upsertMany({
    organisationId,
    incomingContacts: [contact()]
  });

  assert.equal((await f.store.listAll()).length, 1);
});
