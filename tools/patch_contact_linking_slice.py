from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REVIEW_PAGE = ROOT / "src" / "interfaces" / "http" / "review-page.js"
TEST_FILE = ROOT / "tests" / "application" / "recruiter-contact-store-delete.test.js"

review_page = REVIEW_PAGE.read_text(encoding="utf-8")

if "delete-selected-contacts-button" not in review_page:
    raise SystemExit(
        "ERROR: review-page.js does not contain the contact deletion handler."
    )

if "Missing review ID." not in review_page:
    anchor = '''      var reviewId = button.dataset.reviewId;
      var deleteSelected = button.classList.contains(
        "delete-selected-contacts-button"
      );
'''

    replacement = '''      var reviewId = button.dataset.reviewId;

      if (!reviewId) {
        window.alert("Missing review ID.");
        return;
      }

      var deleteSelected = button.classList.contains(
        "delete-selected-contacts-button"
      );
'''

    if anchor not in review_page:
        raise SystemExit(
            "ERROR: could not find the reviewId handler anchor."
        )

    review_page = review_page.replace(anchor, replacement, 1)
    print("PATCHED: review-page.js: validate review ID")
else:
    print("SKIPPED: review-page.js: review ID validation already exists")

if "querySelectorAll(" not in review_page:
    anchor = '''      button.disabled = true;

      try {
'''

    replacement = '''      document
        .querySelectorAll(
          ".delete-selected-contacts-button, " +
            ".clear-imported-contacts-button"
        )
        .forEach(function (item) {
          item.disabled = true;
        });

      try {
'''

    if anchor not in review_page:
        raise SystemExit(
            "ERROR: could not find the delete-handler button anchor."
        )

    review_page = review_page.replace(anchor, replacement, 1)
    print("PATCHED: review-page.js: disable contact buttons")
else:
    print("SKIPPED: review-page.js: button disabling already exists")

if "item.disabled = false" not in review_page:
    anchor = '''        alert(
          error instanceof Error
            ? error.message
            : "Unable to delete imported contacts."
        );

        button.disabled = false;
'''

    replacement = '''        alert(
          error instanceof Error
            ? error.message
            : "Unable to delete imported contacts."
        );

        document
          .querySelectorAll(
            ".delete-selected-contacts-button, " +
              ".clear-imported-contacts-button"
          )
          .forEach(function (item) {
            item.disabled = false;
          });
'''

    if anchor not in review_page:
        raise SystemExit(
            "ERROR: could not find the delete-handler error anchor."
        )

    review_page = review_page.replace(anchor, replacement, 1)
    print("PATCHED: review-page.js: re-enable contact buttons")
else:
    print("SKIPPED: review-page.js: button re-enable already exists")

REVIEW_PAGE.write_text(
    review_page,
    encoding="utf-8",
    newline="\n"
)

TEST_FILE.parent.mkdir(parents=True, exist_ok=True)

if TEST_FILE.exists():
    print("SKIPPED: delete-store test already exists")
else:
    TEST_FILE.write_text(r'''import test from "node:test";
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
''', encoding="utf-8", newline="\n")

    print("CREATED: recruiter-contact-store-delete.test.js")

print("\nContact-linking slice patch complete.")