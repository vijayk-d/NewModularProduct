import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalServer } from "../../src/interfaces/http/create-local-server.js";
import { createRecruiterContactStore } from "../../src/application/recruiter-contact-store.js";

const organisationId = "domain:twinstream.com";

function contact(id, overrides = {}) {
  return {
    id,
    organisationId,
    firstName: "Test",
    lastName: id,
    fullName: `Test ${id}`,
    role: "Recruitment Manager",
    linkedinUrl: `https://www.linkedin.com/in/regression-${id}`,
    source: "linkedin-visible",
    emailDomain: "twinstream.com",
    selectedEmail: `test.${id}@twinstream.com`,
    emailCandidates: [
      `test.${id}@twinstream.com`,
      `${id}.test@twinstream.com`
    ],
    linkedApplicationReviewIds: [],
    ...overrides
  };
}

function prepared() {
  const cv = { role_code: "PM", role_name: "Project Manager" };
  return {
    jobDescription: { role: "Project Manager", location: "London" },
    recommendation: {
      bestCv: cv,
      alternativeCv: null,
      ats: { score: 75 }
    },
    rankedCvs: [{ cv, ats: { score: 75 } }],
    coverLetter: {
      subject: "Regression test application",
      plainText: "Original regression draft."
    }
  };
}

async function fixture(t, mode = "success", linkedOverrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "contact-regression-"));
  const store = createRecruiterContactStore({
    filePath: path.join(directory, "contacts.json")
  });

  await store.upsertMany({
    organisationId,
    incomingContacts: [
      contact("selected"),
      contact("unselected"),
      contact("linked", linkedOverrides),
      contact("other", { organisationId: "domain:other-company.test" }),
      contact("protected", { linkedApplicationReviewIds: ["another-review"] })
    ]
  });

  const server = createLocalServer({
    recruiterContactStore: store,
    prepareApplication: async () => prepared(),
    researchOrganization: mode === "disabled" ? null : async () => {
      if (mode === "failure") throw new Error("Synthetic provider failure");
      return {
        status: "found",
        summary: "Synthetic organisation research.",
        companyValues: ["Collaboration"],
        sources: [],
        provider: "fake",
        researchedAt: "2026-10-09T12:00:00Z",
        emailDomainResearch: {
          emailDomain: "twinstream.com",
          confidence: "high",
          reasoning: "Synthetic fixture",
          evidence: []
        }
      };
    },
    coverLetterRefinementPort: {
      refine: async () => ({
        proposedDraft: "Proposed regression draft.",
        warnings: []
      })
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
    await rm(directory, { recursive: true, force: true });
  });

  async function form(route, values) {
    const response = await fetch(base + route, {
      method: "POST",
      body: new URLSearchParams(values),
      signal: AbortSignal.timeout(10000)
    });
    return { status: response.status, html: await response.text() };
  }

  async function json(route, values) {
    const response = await fetch(base + route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
      signal: AbortSignal.timeout(10000)
    });
    return { status: response.status, data: await response.json() };
  }

  const initial = await form("/applications", {
    jobTitle: "Project Manager",
    jobDescriptionText: "Synthetic project management vacancy.",
    organisationName: "TwinStream",
    organisationUrl: "https://www.linkedin.com/company/twinstream/"
  });

  assert.equal(initial.status, 200);
  const reviewId = initial.html.match(/name="reviewId"\s+value="([^"]+)"/)?.[1];
  assert.ok(reviewId, "Application response must contain a review ID");

  await store.linkToReview({ reviewId, contactIds: ["linked"] });

  return { store, base, reviewId, form, json };
}

function assertContactSections(html) {
  assert.match(html, /class="available-imported-contacts-body"/);
  assert.match(html, /class="linked-imported-contacts-body"/);
  assert.match(html, /Test selected/);
  assert.match(html, /Test linked/);
  assert.match(html, /class="delete-selected-contacts-button"/);
  assert.match(html, /id="email-domain-input"/);
}

for (const mode of ["success", "failure", "disabled"]) {
  test(`organisation research retains contact sections: ${mode}`, async (t) => {
    const f = await fixture(t, mode);
    const result = await f.form("/organisation-research", {
      reviewId: f.reviewId
    });
    assert.equal(result.status, mode === "disabled" ? 503 : 200);
    assertContactSections(result.html);
    assert.equal((await f.store.listAll()).length, 5);
  });
}

test("research, polish, apply and CV selection retain contacts and saved domain", async (t) => {
  const f = await fixture(t);
  const saved = await f.json("/api/reviews/email-domain/save", {
    reviewId: f.reviewId,
    emailDomain: "twinstream.com"
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.ok, true);

  for (const [route, extra] of [
    ["/organisation-research", {}],
    ["/cover-letter-refinement", {}],
    ["/cover-letter-refinement/apply", {}],
    ["/review-cv-selection", { selectedCvRoleCode: "PM" }]
  ]) {
    const result = await f.form(route, { reviewId: f.reviewId, ...extra });
    assert.equal(result.status, 200, route);
    assertContactSections(result.html);
    assert.match(
      result.html,
      /id="email-domain-input"[\s\S]*?value="twinstream\.com"/,
      `${route} must retain the saved domain`
    );
  }
});

test("selected deletion uses saved domain for a LinkedIn-based review", async (t) => {
  const f = await fixture(t);
  await f.json("/api/reviews/email-domain/save", {
    reviewId: f.reviewId,
    emailDomain: "twinstream.com"
  });

  const result = await f.json("/api/recruiter-contacts/delete", {
    reviewId: f.reviewId,
    contactIds: ["selected"]
  });

  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.deleted, 1);
  assert.deepEqual(result.data.deletedContacts.map((c) => c.id), ["selected"]);

  assert.deepEqual(
    (await f.store.listAll()).map((c) => c.id).sort(),
    ["linked", "other", "protected", "unselected"].sort()
  );

  const response = await fetch(
    `${f.base}/api/recruiter-contacts/linking?reviewId=${encodeURIComponent(f.reviewId)}`
  );
  assert.equal(response.status, 200);
  const refreshed = await response.json();
  assert.equal(refreshed.ok, true);
  assert.ok(!refreshed.unlinked.some((c) => c.id === "selected"));
});

test("clear operation respects saved organisation scope and all review links", async (t) => {
  const f = await fixture(t);
  await f.json("/api/reviews/email-domain/save", {
    reviewId: f.reviewId,
    emailDomain: "twinstream.com"
  });

  const result = await f.json("/api/recruiter-contacts/delete", {
    reviewId: f.reviewId,
    contactIds: []
  });

  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.deepEqual(
    result.data.deletedContacts.map((c) => c.id).sort(),
    ["selected", "unselected"]
  );
  assert.deepEqual(
    (await f.store.listAll()).map((c) => c.id).sort(),
    ["linked", "other", "protected"]
  );
});


test("linking selected contacts preserves review state and is idempotent", async (t) => {
  const f = await fixture(t);

  const saved = await f.json("/api/reviews/email-domain/save", {
    reviewId: f.reviewId,
    emailDomain: "twinstream.com"
  });
  assert.equal(saved.status, 200);

  await f.form("/organisation-research", { reviewId: f.reviewId });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await f.form("/recruiter-contacts/link", {
      reviewId: f.reviewId,
      contactIds: "selected"
    });

    assert.equal(result.status, 200);
    assertContactSections(result.html);
    assert.match(result.html, /Selected contacts are linked/);
    assert.match(
      result.html,
      /id="email-domain-input"[\s\S]*?value="twinstream\.com"/
    );

    const linkedBody = result.html.match(
      /<tbody class="linked-imported-contacts-body">([\s\S]*?)<\/tbody>/
    )?.[1];
    const availableBody = result.html.match(
      /<tbody class="available-imported-contacts-body">([\s\S]*?)<\/tbody>/
    )?.[1];

    assert.ok(linkedBody);
    assert.ok(availableBody);
    assert.match(linkedBody, /Test selected/);
    assert.doesNotMatch(availableBody, /Test selected/);
    assert.match(availableBody, /Test unselected/);

    const contacts = await f.store.listAll();
    const selected = contacts.find((c) => c.id === "selected");
    const unselected = contacts.find((c) => c.id === "unselected");

    assert.deepEqual(selected.linkedApplicationReviewIds, [f.reviewId]);
    assert.deepEqual(unselected.linkedApplicationReviewIds, []);
    assert.equal(contacts.length, 5);
  }
});

test("linking rejects empty and unknown selections without changing storage", async (t) => {
  const f = await fixture(t);
  const before = JSON.stringify(await f.store.listAll());

  for (const extra of [{}, { contactIds: "missing-contact" }]) {
    const result = await f.form("/recruiter-contacts/link", {
      reviewId: f.reviewId,
      ...extra
    });

    assert.equal(result.status, 400);
    assertContactSections(result.html);
    assert.equal(JSON.stringify(await f.store.listAll()), before);
  }
});

test("linking rejects an expired review without changing storage", async (t) => {
  const f = await fixture(t);
  const before = JSON.stringify(await f.store.listAll());

  const result = await f.form("/recruiter-contacts/link", {
    reviewId: "expired-review",
    contactIds: "selected"
  });

  assert.equal(result.status, 410);
  assert.equal(JSON.stringify(await f.store.listAll()), before);
});


test("selected deletion works before research or domain saving", async (t) => {
  const f = await fixture(t);

  const result = await f.json("/api/recruiter-contacts/delete", {
    reviewId: f.reviewId,
    contactIds: ["selected"]
  });

  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.deleted, 1);
  assert.deepEqual(
    result.data.deletedContacts.map((contact) => contact.id),
    ["selected"]
  );

  const remaining = await f.store.listAll();
  assert.ok(!remaining.some((contact) => contact.id === "selected"));
  assert.ok(remaining.some((contact) => contact.id === "unselected"));
  assert.ok(remaining.some((contact) => contact.id === "linked"));

  const response = await fetch(
    `${f.base}/api/recruiter-contacts/linking?reviewId=${encodeURIComponent(f.reviewId)}`
  );
  assert.equal(response.status, 200);
  const refreshed = await response.json();
  assert.equal(refreshed.ok, true);
  assert.ok(!refreshed.unlinked.some((contact) => contact.id === "selected"));
});


test("clear displayed contacts works without domain setup and after selected deletion", async (t) => {
  for (const deleteSelectedFirst of [false, true]) {
    await t.test(
      deleteSelectedFirst ? "delete selected then clear displayed" : "clear displayed directly",
      async (t) => {
        const f = await fixture(t);

        if (deleteSelectedFirst) {
          const selected = await f.json("/api/recruiter-contacts/delete", {
            reviewId: f.reviewId,
            action: "deleteSelected",
            contactIds: ["selected"]
          });
          assert.equal(selected.status, 200);
          assert.equal(selected.data.deleted, 1);
        }

        const ids = deleteSelectedFirst
          ? ["unselected", "other"]
          : ["selected", "unselected", "other"];

        const cleared = await f.json("/api/recruiter-contacts/delete", {
          reviewId: f.reviewId,
          action: "clearDisplayed",
          contactIds: ids
        });

        assert.equal(cleared.status, 200);
        assert.equal(cleared.data.ok, true);
        assert.equal(cleared.data.deleted, ids.length);
        assert.deepEqual(
          cleared.data.deletedContacts.map((c) => c.id).sort(),
          [...ids].sort()
        );
        assert.deepEqual(
          (await f.store.listAll()).map((c) => c.id).sort(),
          ["linked", "protected"].sort()
        );

        const response = await fetch(
          `${f.base}/api/recruiter-contacts/linking?reviewId=${encodeURIComponent(f.reviewId)}`
        );
        assert.equal(response.status, 200);
        const refreshed = await response.json();
        assert.ok(!refreshed.unlinked.some((c) =>
          ["selected", "unselected", "other"].includes(c.id)
        ));

        const repeated = await f.json("/api/recruiter-contacts/delete", {
          reviewId: f.reviewId,
          action: "clearDisplayed",
          contactIds: []
        });
        assert.equal(repeated.status, 200);
        assert.equal(repeated.data.deleted, 0);
        assert.equal((await f.store.listAll()).length, 2);
      }
    );
  }
});

test("explicit deletion protects linked and omitted contacts and rejects empty selection", async (t) => {
  const f = await fixture(t);

  const empty = await f.json("/api/recruiter-contacts/delete", {
    reviewId: f.reviewId,
    action: "deleteSelected",
    contactIds: []
  });
  assert.equal(empty.status, 400);
  assert.equal((await f.store.listAll()).length, 5);

  const cleared = await f.json("/api/recruiter-contacts/delete", {
    reviewId: f.reviewId,
    action: "clearDisplayed",
    contactIds: ["selected", "linked", "protected"]
  });
  assert.equal(cleared.status, 200);
  assert.deepEqual(
    cleared.data.deletedContacts.map((c) => c.id),
    ["selected"]
  );
  assert.deepEqual(
    (await f.store.listAll()).map((c) => c.id).sort(),
    ["unselected", "other", "linked", "protected"].sort()
  );
});


test("saved domain replaces generated linked emails and leaves unlinked contacts unchanged", async (t) => {
  const f = await fixture(t, "success", {
    emailSource: "inferred"
  });
  const contacts = await f.store.listAll();

  const unlinkedBefore = JSON.stringify(
    contacts.filter((c) => c.id !== "linked")
  );

  for (const domain of ["first-company.test", "second-company.test"]) {
    const result = await f.json("/api/reviews/email-domain/save", {
      reviewId: f.reviewId,
      emailDomain: domain
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.ok, true);
    assert.equal(result.data.updatedContacts, 1);

    const stored = (await f.store.listAll()).find((c) => c.id === "linked");
    assert.deepEqual(stored.emailCandidates, [
      `test.linked@${domain}`,
      `linked.test@${domain}`
    ]);
    assert.equal(stored.selectedEmail, `test.linked@${domain}`);
    assert.equal(stored.emailSource, "inferred");

    assert.equal(
      JSON.stringify((await f.store.listAll()).filter((c) => c.id !== "linked")),
      unlinkedBefore
    );
  }

  const reloaded = await f.form("/organisation-research", {
    reviewId: f.reviewId
  });
  assert.equal(reloaded.status, 200);
  assert.match(
    reloaded.html,
    /value="second-company\.test"/
  );
});

test("saved domain preserves supplied and verified selected emails", async (t) => {
  for (const verified of [false, true]) {
    const f = await fixture(t, "success", {
      selectedEmail: "published@original-company.test",
      emailSource: verified ? "inferred" : "supplied",
      verified
    });

    const result = await f.json("/api/reviews/email-domain/save", {
      reviewId: f.reviewId,
      emailDomain: "new-company.test"
    });

    assert.equal(result.status, 200);
    const stored = (await f.store.listAll()).find((c) => c.id === "linked");
    assert.equal(stored.selectedEmail, "published@original-company.test");
    assert.ok(stored.emailCandidates.includes("published@original-company.test"));
    assert.ok(stored.emailCandidates.includes("test.linked@new-company.test"));
    assert.ok(stored.emailCandidates.includes("linked.test@new-company.test"));
    assert.equal(stored.verified, verified);
  }
});

test("invalid saved domain changes neither contacts nor the saved review domain", async (t) => {
  const f = await fixture(t);
  const saved = await f.json("/api/reviews/email-domain/save", {
    reviewId: f.reviewId,
    emailDomain: "valid-company.test"
  });
  assert.equal(saved.status, 200);

  const before = JSON.stringify(await f.store.listAll());

  for (const invalid of ["gmail.com", "https://company.test", "person@company.test"]) {
    const result = await f.json("/api/reviews/email-domain/save", {
      reviewId: f.reviewId,
      emailDomain: invalid
    });
    assert.equal(result.status, 400);
    assert.equal(JSON.stringify(await f.store.listAll()), before);
  }

  const review = await f.form("/organisation-research", {
    reviewId: f.reviewId
  });
  assert.equal(review.status, 200);
  assert.match(review.html, /value="valid-company\.test"/);
});

test("permanent deletion removes old-linked contacts but preserves ordinary protection", async (t) => {
  const f = await fixture(t);

  const ordinary = await f.json("/api/recruiter-contacts/delete", {
    reviewId: f.reviewId,
    action: "deleteSelected",
    contactIds: ["protected"]
  });
  assert.equal(ordinary.status, 200);
  assert.equal(ordinary.data.deleted, 0);

  const permanent = await f.json("/api/recruiter-contacts/permanent-delete", {
    reviewId: f.reviewId,
    confirmedPermanent: true,
    contactIds: ["protected", "protected"]
  });
  assert.equal(permanent.status, 200);
  assert.equal(permanent.data.deleted, 1);
  assert.equal(permanent.data.backupCreated, true);
  assert.deepEqual(
    permanent.data.deletedContacts.map((contact) => contact.id),
    ["protected"]
  );

  assert.deepEqual(
    (await f.store.listAll()).map((contact) => contact.id).sort(),
    ["selected", "unselected", "linked", "other"].sort()
  );
  assert.equal((await f.store.listByReview("another-review")).length, 0);

  const repeated = await f.json("/api/recruiter-contacts/permanent-delete", {
    reviewId: f.reviewId,
    confirmedPermanent: true,
    contactIds: ["protected"]
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.deleted, 0);
});

test("permanent deletion rejects missing confirmation invalid IDs and current links", async (t) => {
  const f = await fixture(t);
  const before = JSON.stringify(await f.store.listAll());

  for (const extra of [
    { contactIds: ["protected"] },
    { confirmedPermanent: false, contactIds: ["protected"] },
    { confirmedPermanent: true, contactIds: [] },
    { confirmedPermanent: true, contactIds: "protected" },
    { confirmedPermanent: true, contactIds: [null] }
  ]) {
    const result = await f.json("/api/recruiter-contacts/permanent-delete", {
      reviewId: f.reviewId,
      ...extra
    });
    assert.equal(result.status, 400);
    assert.equal(JSON.stringify(await f.store.listAll()), before);
  }

  const currentLinked = await f.json("/api/recruiter-contacts/permanent-delete", {
    reviewId: f.reviewId,
    confirmedPermanent: true,
    contactIds: ["linked", "protected"]
  });
  assert.equal(currentLinked.status, 409);
  assert.equal(JSON.stringify(await f.store.listAll()), before);

  const expired = await f.json("/api/recruiter-contacts/permanent-delete", {
    reviewId: "expired-review",
    confirmedPermanent: true,
    contactIds: ["protected"]
  });
  assert.equal(expired.status, 404);
  assert.equal(JSON.stringify(await f.store.listAll()), before);
});
