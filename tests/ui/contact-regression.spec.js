import { test as base, expect } from "@playwright/test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalServer } from "../../src/interfaces/http/create-local-server.js";
import { createRecruiterContactStore } from "../../src/application/recruiter-contact-store.js";

const test = base.extend({
  app: async ({}, use) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "contact-browser-"));
    const store = createRecruiterContactStore({
      filePath: path.join(directory, "contacts.json")
    });

    const makeContact = (id, organisationId = "domain:twinstream.com", overrides = {}) => ({
      id,
      organisationId,
      firstName: "Test",
      lastName: id,
      fullName: `Test ${id}`,
      role: "Recruitment Manager",
      linkedinUrl: `https://www.linkedin.com/in/browser-${id}`,
      source: "linkedin-visible",
      emailDomain: "twinstream.com",
      selectedEmail: `test.${id}@twinstream.com`,
      emailCandidates: [
        `test.${id}@twinstream.com`,
        `${id}.test@twinstream.com`
      ],
      linkedApplicationReviewIds: [],
      ...overrides
    });

    await store.upsertMany({
      organisationId: "domain:twinstream.com",
      incomingContacts: [
        makeContact("selected"),
        makeContact("unselected"),
        makeContact("other", "domain:other-company.test"),
        makeContact("linked", "domain:twinstream.com", {
          emailSource: "inferred"
        })
      ]
    });

    const cv = { role_code: "PM", role_name: "Project Manager" };
    const server = createLocalServer({
      recruiterContactStore: store,
      prepareApplication: async () => ({
        jobDescription: { role: "Project Manager", location: "London" },
        recommendation: {
          bestCv: cv,
          alternativeCv: null,
          ats: { score: 75 }
        },
        rankedCvs: [{ cv, ats: { score: 75 } }],
        coverLetter: {
          subject: "Browser regression application",
          plainText: "Original browser regression draft."
        }
      }),
      researchOrganization: async () => ({
        status: "found",
        summary: "Synthetic research summary.",
        companyValues: ["Collaboration"],
        sources: [],
        provider: "fake",
        researchedAt: "2026-10-09T12:00:00Z",
        emailDomainResearch: {
          emailDomain: "twinstream.com",
          confidence: "high",
          reasoning: "Synthetic browser fixture.",
          evidence: []
        }
      }),
      coverLetterRefinementPort: {
        refine: async () => ({
          proposedDraft: "Proposed browser regression draft.",
          warnings: []
        })
      }
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      await use({ baseUrl, store });
    } finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      );
      await rm(directory, { recursive: true, force: true });
    }
  }
});

async function prepare(page, app) {
  await page.goto(app.baseUrl);
  await page.locator('[name="jobTitle"]').fill("Project Manager");
  await page.locator('[name="organisationName"]').fill("TwinStream");
  await page.locator('[name="organisationUrl"]').fill(
    "https://www.linkedin.com/company/twinstream/"
  );
  await page.locator('[name="jobDescriptionText"]').fill(
    "Synthetic project management vacancy for browser regression."
  );

  await Promise.all([
    page.waitForNavigation(),
    page.getByRole("button", { name: "Generate application", exact: true }).click()
  ]);

  await expect(page.locator(".available-imported-contacts-body")).toBeVisible();
  return page.locator('input[name="reviewId"]').first().inputValue();
}

function availableRow(page, id) {
  return page.locator(".available-imported-contacts-body tr").filter({
    has: page.locator(`input.contact-link-checkbox[value="${id}"]`)
  });
}

async function clickDeleteAndWait(page, buttonName) {
  const completed = page.waitForResponse((response) =>
    response.url().endsWith("/api/recruiter-contacts/delete") &&
    response.request().method() === "POST"
  );
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const response = await completed;
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.ok).toBe(true);
  return payload;
}

test("delete selected then clear displayed works without researching or saving a domain", async ({ page, app }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const reviewId = await prepare(page, app);
  await app.store.linkToReview({ reviewId, contactIds: ["linked"] });

  await page.getByRole("button", { name: "Refresh contacts", exact: true }).click();
  await expect(availableRow(page, "linked")).toHaveCount(0);

  await availableRow(page, "selected").locator("input").check();
  const deleted = await clickDeleteAndWait(page, "Delete selected");

  expect(deleted.deleted).toBe(1);
  await expect(availableRow(page, "selected")).toHaveCount(0);
  await expect(availableRow(page, "unselected")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete selected", exact: true })
  ).toBeEnabled();

  page.once("dialog", (dialog) => dialog.accept());
  const cleared = await clickDeleteAndWait(page, "Clear imported contacts");

  expect(cleared.deleted).toBe(2);
  await expect(page.locator(".available-imported-contacts-body tr")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clear imported contacts", exact: true })
  ).toBeEnabled();

  expect((await app.store.listAll()).map((contact) => contact.id)).toEqual(["linked"]);
  expect(errors).toEqual([]);
});

test("cancelling clear sends no deletion request and preserves contacts", async ({ page, app }) => {
  await prepare(page, app);
  let deleteRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/recruiter-contacts/delete")) {
      deleteRequests += 1;
    }
  });

  const dismissed = new Promise((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.dismiss();
      resolve();
    });
  });

  await page.getByRole("button", {
    name: "Clear imported contacts",
    exact: true
  }).click();
  await dismissed;

  await expect(page.locator(".available-imported-contacts-body tr")).toHaveCount(4);
  expect(deleteRequests).toBe(0);
  expect((await app.store.listAll()).length).toBe(4);
});

test("research polish and apply preserve contacts, email layout and saved domain", async ({ page, app }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const reviewId = await prepare(page, app);
  await app.store.linkToReview({ reviewId, contactIds: ["linked"] });

  await Promise.all([
    page.waitForNavigation(),
    page.getByRole("button", { name: "Research organisation", exact: true }).click()
  ]);

  await expect(page.locator(".available-imported-contacts-body")).toBeVisible();
  await expect(page.locator(".linked-imported-contacts-body")).toBeVisible();
  await expect(page.locator("#email-domain-input")).toHaveValue("twinstream.com");

  await page.locator("#email-domain-input").fill("manual-company.test");
  await page.getByRole("button", { name: "Save domain", exact: true }).click();
  await expect(page.locator("#email-domain-status")).toHaveText(
    "Domain saved for this active review."
  );

  for (const buttonName of ["Polish cover letter", "Use proposal as current draft"]) {
    await Promise.all([
      page.waitForNavigation(),
      page.getByRole("button", { name: buttonName, exact: true }).click()
    ]);

    await expect(page.locator(".available-imported-contacts-body")).toBeVisible();
    await expect(page.locator(".linked-imported-contacts-body")).toBeVisible();
    await expect(page.locator("#email-domain-input")).toHaveValue("manual-company.test");
  }

  await page.getByRole("button", { name: "Refresh contacts", exact: true }).click();
  const row = availableRow(page, "selected");
  await expect(row.locator("td")).toHaveCount(5);
  await expect(row.locator(".contact-role-cell")).toHaveCount(1);
  await expect(row.locator(".contact-email-cell")).toHaveCount(1);
  await expect(row.locator('.contact-email-cell a[href^="mailto:"]')).toHaveCount(2);
  await expect(row).not.toContainText("(inferred)");
  expect(errors).toEqual([]);
});

test("link selected moves only the checked row and retains the page sections", async ({ page, app }) => {
  const reviewId = await prepare(page, app);
  await availableRow(page, "selected").locator("input").check();

  await Promise.all([
    page.waitForNavigation(),
    page.getByRole("button", { name: "Link selected contacts", exact: true }).click()
  ]);

  await expect(availableRow(page, "selected")).toHaveCount(0);
  await expect(availableRow(page, "unselected")).toBeVisible();
  await expect(page.locator(".linked-imported-contacts-body")).toContainText("Test selected");
  await expect(page.locator("#email-domain-input")).toBeVisible();

  const selected = (await app.store.listAll()).find((contact) => contact.id === "selected");
  expect(selected.linkedApplicationReviewIds).toEqual([reviewId]);
});


test("saving a domain refreshes linked emails without losing local draft edits", async ({ page, app }) => {
  const reviewId = await prepare(page, app);
  await app.store.linkToReview({ reviewId, contactIds: ["linked"] });

  await Promise.all([
    page.waitForNavigation(),
    page.getByRole("button", { name: "Research organisation", exact: true }).click()
  ]);

  const localDraft = "Local draft edit must survive saving the domain.";
  await page.locator("#cover-letter-draft").fill(localDraft);

  for (const domain of ["first-company.test", "second-company.test"]) {
    await page.locator("#email-domain-input").fill(domain);

    const saved = page.waitForResponse((response) =>
      response.url().endsWith("/api/reviews/email-domain/save") &&
      response.request().method() === "POST"
    );

    await page.getByRole("button", { name: "Save domain", exact: true }).click();
    expect((await saved).status()).toBe(200);

    await expect(page.locator("#email-domain-status")).toHaveText(
      "Domain saved for this active review."
    );

    const emailCell = page.locator(
      ".linked-imported-contacts-body .contact-email-cell"
    );
    await expect(emailCell.locator("a")).toHaveCount(2);
    await expect(emailCell).toContainText(`test.linked@${domain}`);
    await expect(emailCell).toContainText(`linked.test@${domain}`);
    await expect(emailCell).not.toContainText("@twinstream.com");
    await expect(page.locator("#cover-letter-draft")).toHaveText(localDraft);

    await expect(
      availableRow(page, "selected").locator(".contact-email-cell")
    ).toContainText("test.selected@twinstream.com");
  }
});

test("linked selection unlink and clear preserve contact records and local edits", async ({ page, app }) => {
  const reviewId = await prepare(page, app);
  await app.store.linkToReview({
    reviewId,
    contactIds: ["linked", "selected"]
  });
  await app.store.linkToReview({
    reviewId: "another-review",
    contactIds: ["linked"]
  });

  await page.getByRole("button", { name: "Refresh contacts", exact: true }).click();
  await expect(page.locator(".linked-contact-checkbox")).toHaveCount(2);

  const draft = "Keep this local draft during contact actions.";
  await page.locator("#cover-letter-draft").fill(draft);

  await page.locator("#select-all-linked-contacts").check();
  await expect(page.locator(".linked-contact-checkbox:checked")).toHaveCount(2);
  await expect(page.locator(".contact-link-checkbox:checked")).toHaveCount(0);

  await page.locator("#select-all-contact-links").check();
  await page.locator("#select-all-linked-contacts").uncheck();
  await expect(page.locator(".linked-contact-checkbox:checked")).toHaveCount(0);
  await expect(page.locator(".contact-link-checkbox:checked")).toHaveCount(2);

  await page.locator('.linked-contact-checkbox[value="selected"]').check();

  const unlinkResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/recruiter-contacts/unlink") &&
    response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Unlink selected", exact: true }).click();
  expect((await unlinkResponse).status()).toBe(200);

  await expect(page.locator(".linked-contact-checkbox")).toHaveCount(1);
  await expect(availableRow(page, "selected")).toBeVisible();
  await expect(page.locator("#cover-letter-draft")).toHaveText(draft);
  expect((await app.store.listAll()).length).toBe(4);

  let requests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/recruiter-contacts/unlink")) requests += 1;
  });

  const dismissed = new Promise((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.dismiss();
      resolve();
    });
  });
  await page.getByRole("button", { name: "Clear linked contacts", exact: true }).click();
  await dismissed;
  expect(requests).toBe(0);
  await expect(page.locator(".linked-contact-checkbox")).toHaveCount(1);

  page.once("dialog", (dialog) => dialog.accept());
  const clearResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/recruiter-contacts/unlink") &&
    response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Clear linked contacts", exact: true }).click();
  expect((await clearResponse).status()).toBe(200);

  await expect(page.locator(".linked-contact-checkbox")).toHaveCount(0);
  await expect(availableRow(page, "linked")).toBeVisible();
  await expect(page.locator("#cover-letter-draft")).toHaveText(draft);
  await expect(
    page.getByRole("button", { name: "Clear linked contacts", exact: true })
  ).toBeEnabled();

  const contacts = await app.store.listAll();
  expect(contacts.length).toBe(4);
  expect(
    contacts.find((contact) => contact.id === "linked").linkedApplicationReviewIds
  ).toEqual(["another-review"]);
});

test("organisation summary follows refresh domain saving and unlinking", async ({ page, app }) => {
  const reviewId = await prepare(page, app);
  const summary = page.locator(".organisation-contact-summary");
  const rows = page.locator(".organisation-contact-summary-body tr");

  await expect(summary).toBeHidden();

  await app.store.linkToReview({
    reviewId,
    contactIds: ["linked"]
  });
  await page.getByRole("button", {
    name: "Refresh contacts",
    exact: true
  }).click();

  await expect(summary).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Test linked");

  const draft = "Summary updates must not replace this local draft.";
  await page.locator("#cover-letter-draft").fill(draft);

  await page.locator("#email-domain-input").fill("summary-company.test");
  await page.getByRole("button", {
    name: "Save domain",
    exact: true
  }).click();

  await expect(page.locator("#email-domain-status")).toHaveText(
    "Domain saved for this active review."
  );
  await expect(rows).toContainText("summary-company.test");
  await expect(page.locator("#cover-letter-draft")).toHaveText(draft);

  await page.locator('.linked-contact-checkbox[value="linked"]').check();
  await page.getByRole("button", {
    name: "Unlink selected",
    exact: true
  }).click();

  await expect(summary).toBeHidden();
  await expect(rows).toHaveCount(0);
  await expect(availableRow(page, "linked")).toBeVisible();
  await expect(page.locator("#cover-letter-draft")).toHaveText(draft);
  expect((await app.store.listAll()).length).toBe(4);

  await availableRow(page, "linked").locator("input").check();
  await Promise.all([
    page.waitForNavigation(),
    page.getByRole("button", {
      name: "Link selected contacts",
      exact: true
    }).click()
  ]);

  await expect(summary).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("summary-company.test");
});

test("available deletion reports contacts protected by another application", async ({ page, app }) => {
  await prepare(page, app);

  await app.store.linkToReview({
    reviewId: "another-application",
    contactIds: ["selected"]
  });

  await page.getByRole("button", {
    name: "Refresh contacts", exact: true
  }).click();

  await availableRow(page, "selected").locator("input").check();

  const completed = page.waitForResponse((response) =>
    response.url().endsWith("/api/recruiter-contacts/delete") &&
    response.request().method() === "POST"
  );
  await page.getByRole("button", {
    name: "Delete selected", exact: true
  }).click();

  const response = await completed;
  expect(response.status()).toBe(200);
  expect((await response.json()).deleted).toBe(0);

  await expect(page.locator(".available-contact-action-status")).toContainText(
    "Contacts linked to any application are protected"
  );
  await expect(availableRow(page, "selected")).toBeVisible();
  await expect(page.getByRole("button", {
    name: "Delete selected", exact: true
  })).toBeEnabled();

  const contact = (await app.store.listAll()).find((c) => c.id === "selected");
  expect(contact.linkedApplicationReviewIds).toEqual(["another-application"]);
});

test("successful available deletion remains visible when refresh fails", async ({ page, app }) => {
  await prepare(page, app);
  const draft = "Retain this draft when contact refresh fails.";
  await page.locator("#cover-letter-draft").fill(draft);

  await page.route("**/api/recruiter-contacts/linking?*", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: "Synthetic refresh failure"
      })
    })
  );

  await availableRow(page, "selected").locator("input").check();
  await page.getByRole("button", {
    name: "Delete selected", exact: true
  }).click();

  await expect(page.locator(".available-contact-action-status")).toContainText(
    "1 contact(s) deleted."
  );
  await expect(page.locator(".available-contact-action-status")).toContainText(
    "Tables could not refresh"
  );
  await expect(availableRow(page, "selected")).toHaveCount(0);
  await expect(availableRow(page, "unselected")).toBeVisible();
  await expect(page.getByRole("button", {
    name: "Delete selected", exact: true
  })).toBeEnabled();
  await expect(page.getByRole("button", {
    name: "Clear imported contacts", exact: true
  })).toBeEnabled();
  await expect(page.locator("#cover-letter-draft")).toHaveText(draft);

  expect(
    (await app.store.listAll()).some((contact) => contact.id === "selected")
  ).toBe(false);
});

test("permanent delete requires confirmation and removes selected old-linked records", async ({ page, app }) => {
  await prepare(page, app);
  await app.store.linkToReview({
    reviewId: "old-application",
    contactIds: ["selected"]
  });

  await page.getByRole("button", {
    name: "Refresh contacts", exact: true
  }).click();

  const draft = "Permanent contact deletion must preserve local draft edits.";
  await page.locator("#cover-letter-draft").fill(draft);
  await availableRow(page, "selected").locator("input").check();

  let requests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/recruiter-contacts/permanent-delete")) {
      requests += 1;
    }
  });

  const cancelled = new Promise((resolve) => {
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("ALL applications");
      expect(dialog.message()).toContain("Test selected");
      await dialog.dismiss();
      resolve();
    });
  });

  await page.getByRole("button", {
    name: "Permanently delete selected", exact: true
  }).click();
  await cancelled;

  expect(requests).toBe(0);
  await expect(availableRow(page, "selected")).toBeVisible();
  expect((await app.store.listAll()).length).toBe(4);

  page.once("dialog", (dialog) => dialog.accept());
  const completed = page.waitForResponse((response) =>
    response.url().endsWith("/api/recruiter-contacts/permanent-delete") &&
    response.request().method() === "POST"
  );

  await page.getByRole("button", {
    name: "Permanently delete selected", exact: true
  }).click();

  const response = await completed;
  expect(response.status()).toBe(200);
  expect((await response.json()).deleted).toBe(1);

  await expect(availableRow(page, "selected")).toHaveCount(0);
  await expect(availableRow(page, "unselected")).toBeVisible();
  await expect(page.locator(".available-contact-action-status")).toContainText(
    "1 contact(s) permanently deleted"
  );
  await expect(page.locator("#cover-letter-draft")).toHaveText(draft);
  await expect(page.getByRole("button", {
    name: "Permanently delete selected", exact: true
  })).toBeEnabled();

  expect((await app.store.listAll()).length).toBe(3);
  expect((await app.store.listByReview("old-application")).length).toBe(0);
});
