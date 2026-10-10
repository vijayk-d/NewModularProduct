import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRecruiterContactStore } from "../../src/application/recruiter-contact-store.js";

function contact(id = "synthetic") {
  return {
    id,
    organisationId: "domain:load-safety.test",
    firstName: "Synthetic",
    lastName: id,
    fullName: `Synthetic ${id}`,
    linkedinUrl: `https://www.linkedin.com/in/synthetic-load-${id}`,
    linkedApplicationReviewIds: []
  };
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "contact-load-safety-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "contacts.json");
  return {
    directory,
    filePath,
    store: createRecruiterContactStore({ filePath })
  };
}

test("a missing contact file can initialise a new store", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.store.listAll(), []);

  await f.store.upsertMany({
    organisationId: "domain:load-safety.test",
    incomingContacts: [contact()]
  });

  const saved = JSON.parse(await readFile(f.filePath, "utf8"));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, "synthetic");
});

test("invalid JSON and malformed records are never overwritten by import", async (t) => {
  const f = await fixture(t);

  for (const content of [
    "{ broken JSON",
    "",
    "{}",
    "null",
    "[null]",
    '[{"fullName":"Missing ID"}]'
  ]) {
    await writeFile(f.filePath, content, "utf8");
    const store = createRecruiterContactStore({ filePath: f.filePath });

    await assert.rejects(store.listAll(), {
      code: "CONTACT_STORE_INVALID"
    });

    await assert.rejects(
      store.upsertMany({
        organisationId: "domain:load-safety.test",
        incomingContacts: [contact("incoming")]
      }),
      { code: "CONTACT_STORE_INVALID" }
    );

    assert.equal(await readFile(f.filePath, "utf8"), content);
    assert.deepEqual(await readdir(f.directory), ["contacts.json"]);
  }
});

test("a read error is not treated as an empty contact store", async (t) => {
  const f = await fixture(t);
  await mkdir(f.filePath);

  await assert.rejects(f.store.listAll(), {
    code: "CONTACT_STORE_READ_FAILED"
  });

  await assert.rejects(
    f.store.upsertMany({
      organisationId: "domain:load-safety.test",
      incomingContacts: [contact()]
    }),
    { code: "CONTACT_STORE_READ_FAILED" }
  );

  assert.deepEqual(await readdir(f.filePath), []);
});

test("the queued store recovers after invalid data is repaired", async (t) => {
  const f = await fixture(t);
  await writeFile(f.filePath, "{ broken", "utf8");

  await assert.rejects(f.store.listAll(), {
    code: "CONTACT_STORE_INVALID"
  });

  await writeFile(
    f.filePath,
    "\uFEFF" + JSON.stringify([contact("existing")]),
    "utf8"
  );

  assert.equal((await f.store.listAll())[0].id, "existing");

  await f.store.upsertMany({
    organisationId: "domain:load-safety.test",
    incomingContacts: [contact("new")]
  });

  const disk = JSON.parse(await readFile(f.filePath, "utf8"));
  assert.deepEqual(disk.map((c) => c.id).sort(), ["existing", "new"]);
});
