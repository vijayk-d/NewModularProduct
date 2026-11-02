import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalServer } from "../../src/interfaces/http/create-local-server.js";
import { createRecruiterContactStore } from "../../src/application/recruiter-contact-store.js";

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
      subject: "Synthetic HTTP error test",
      plainText: "Synthetic original draft."
    }
  };
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "contact-http-errors-"));
  const filePath = path.join(directory, "contacts.json");
  await writeFile(filePath, "[]", "utf8");
  let currentStore = createRecruiterContactStore({ filePath });

  const store = new Proxy({}, {
    get(_target, name) {
      return (...args) => currentStore[name](...args);
    }
  });

  const server = createLocalServer({
    recruiterContactStore: store,
    prepareApplication: async () => prepared()
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
    return fetch(base + route, {
      method: "POST",
      body: new URLSearchParams(values),
      signal: AbortSignal.timeout(10000)
    });
  }

  async function json(route, values) {
    return fetch(base + route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
      signal: AbortSignal.timeout(10000)
    });
  }

  async function setFile(content) {
    await writeFile(filePath, content, "utf8");
    currentStore = createRecruiterContactStore({ filePath });
  }

  async function createReview() {
    const response = await form("/applications", {
      jobTitle: "Project Manager",
      jobDescriptionText: "Synthetic vacancy.",
      organisationName: "Synthetic company"
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    const reviewId = html.match(/name="reviewId"\s+value="([^"]+)"/)?.[1];
    assert.ok(reviewId);
    return reviewId;
  }

  return { base, filePath, form, json, setFile, createReview };
}

test("invalid contact data returns safe JSON errors and remains untouched", async (t) => {
  const f = await fixture(t);
  const reviewId = await f.createReview();
  const broken = "{ synthetic-private-data-invalid";
  await f.setFile(broken);

  const responses = [
    await fetch(
      `${f.base}/api/recruiter-contacts/linking?reviewId=${encodeURIComponent(reviewId)}`,
      { signal: AbortSignal.timeout(10000) }
    ),
    await f.json("/api/recruiter-contacts/delete", {
      reviewId,
      action: "deleteSelected",
      contactIds: ["synthetic"]
    }),
    await f.json("/api/recruiter-contacts/unlink", {
      reviewId,
      action: "unlinkSelected",
      contactIds: ["synthetic"]
    }),
    await f.json("/api/recruiter-contacts/permanent-delete", {
      reviewId,
      confirmedPermanent: true,
      contactIds: ["synthetic"]
    }),
    await f.json("/api/reviews/email-domain/save", {
      reviewId,
      emailDomain: "synthetic-company.test"
    })
  ];

  for (const response of responses) {
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "CONTACT_STORE_INVALID");
    assert.match(payload.error, /Contact data is unavailable/);
    assert.ok(!JSON.stringify(payload).includes(f.filePath));
    assert.ok(!JSON.stringify(payload).includes("synthetic-private-data"));
  }

  assert.equal(await readFile(f.filePath, "utf8"), broken);

  const health = await fetch(f.base + "/api/health");
  assert.equal(health.status, 200);

  await f.setFile("[]");
  const recovered = await fetch(
    `${f.base}/api/recruiter-contacts/linking?reviewId=${encodeURIComponent(reviewId)}`
  );
  assert.equal(recovered.status, 200);
});

test("form routes return a safe page when contact loading fails", async (t) => {
  const f = await fixture(t);
  const reviewId = await f.createReview();
  await f.setFile("{ invalid");

  for (const route of [
    "/organisation-research",
    "/cover-letter-refinement",
    "/review-cv-selection"
  ]) {
    const response = await f.form(route, {
      reviewId,
      selectedCvRoleCode: "PM"
    });
    assert.equal(response.status, 503, route);
    const html = await response.text();
    assert.match(html, /Contact data unavailable/);
    assert.match(html, /CONTACT_STORE_INVALID/);
    assert.ok(!html.includes(f.filePath));
  }

  const health = await fetch(f.base + "/api/health");
  assert.equal(health.status, 200);
});

test("application preparation handles contact-store failure without crashing", async (t) => {
  const f = await fixture(t);
  await f.setFile("{ invalid");

  const response = await f.form("/applications", {
    jobTitle: "Project Manager",
    jobDescriptionText: "Synthetic vacancy."
  });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Contact data unavailable/);

  await f.setFile("[]");
  assert.ok(await f.createReview());
});
