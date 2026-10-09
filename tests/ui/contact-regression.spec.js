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

    const makeContact = (id, organisationId = "domain:twinstream.com") => ({
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
      linkedApplicationReviewIds: []
    });

    await store.upsertMany({
      organisationId: "domain:twinstream.com",
      incomingContacts: [
        makeContact("selected"),
        makeContact("unselected"),
        makeContact("other", "domain:other-company.test"),
        makeContact("linked")
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
  const contact = (await app.store.listAll()).find((c) => c.id === "linked");
  contact.emailSource = "inferred";
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
