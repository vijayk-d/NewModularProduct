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

async function fixture(t, mode = "success") {
  const directory = await mkdtemp(path.join(os.tmpdir(), "contact-regression-"));
  const store = createRecruiterContactStore({
    filePath: path.join(directory, "contacts.json")
  });

  await store.upsertMany({
    organisationId,
    incomingContacts: [
      contact("selected"),
      contact("unselected"),
      contact("linked"),
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
