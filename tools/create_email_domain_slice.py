from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

INFRA = ROOT / "src" / "infrastructure"
APP = ROOT / "src" / "application"
DATA = ROOT / "data"

INFRA.mkdir(parents=True, exist_ok=True)
APP.mkdir(parents=True, exist_ok=True)
DATA.mkdir(parents=True, exist_ok=True)

(INFRA / "perplexity-client.js").write_text(r'''const PERPLEXITY_API_URL =
  "https://api.perplexity.ai/chat/completions";

const BLOCKED_DOMAINS = new Set([
  "linkedin.com",
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "example.com",
  "example.org",
  "example.net"
]);

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  return JSON.parse(fenced ? fenced[1] : text);
}

function normaliseDomain(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9.-]/g, "");
}

function isValidDomain(value) {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value);
}

export function createPerplexityClient({ apiKey }) {
  if (!apiKey) {
    throw new Error(
      "PERPLEXITY_API_KEY is not configured. Add it to the local .env file."
    );
  }

  return {
    async resolveEmailDomain({
      organisationName,
      organisationUrl,
      linkedinUrl
    }) {
      const prompt = `
Research the official corporate email domain for this organisation.

Organisation: ${organisationName || "Unknown"}
Organisation website: ${organisationUrl || "Not provided"}
LinkedIn source: ${linkedinUrl || "Not provided"}

Return only valid JSON with this exact shape:
{
  "emailDomain": "example.com",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Short explanation",
  "evidence": [
    { "title": "Source title", "url": "https://example.com" }
  ]
}

Rules:
- Use the organisation's own website when possible.
- Do not use LinkedIn, Gmail, Outlook, Yahoo, iCloud, or generic email providers.
- If uncertain, return confidence "low" and explain why.
- Do not invent a domain.
`.trim();

      const response = await fetch(PERPLEXITY_API_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            {
              role: "system",
              content:
                "You are a careful research assistant. Return only valid JSON."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(
          `Perplexity request failed with status ${response.status}.`
        );
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("Perplexity returned no research content.");
      }

      const research = extractJson(content);
      const emailDomain = normaliseDomain(research.emailDomain);

      if (!isValidDomain(emailDomain)) {
        throw new Error("Perplexity returned an invalid email domain.");
      }

      if (BLOCKED_DOMAINS.has(emailDomain)) {
        throw new Error(
          `Rejected unsafe or generic email domain: ${emailDomain}`
        );
      }

      return {
        emailDomain,
        confidence: research.confidence || "low",
        reasoning: research.reasoning || "",
        evidence: Array.isArray(research.evidence) ? research.evidence : []
      };
    }
  };
}
''', encoding="utf-8", newline="\n")

(APP / "email-domain-store.js").write_text(r'''import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = join(__dirname, "..", "..", "data", "email-domain-resolutions.json");

async function load() {
  try {
    return JSON.parse(await readFile(STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function save(store) {
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function createEmailDomainStore() {
  return {
    async get(reviewId) {
      const store = await load();

      return store[reviewId] || null;
    },

    async save(reviewId, resolution) {
      const store = await load();

      store[reviewId] = {
        ...resolution,
        resolvedAt: new Date().toISOString()
      };

      await save(store);

      return store[reviewId];
    }
  };
}
''', encoding="utf-8", newline="\n")

(APP / "email-domain-resolution-service.js").write_text(r'''import { createEmailDomainStore } from "./email-domain-store.js";

function generateCandidates(contacts, domain) {
  const candidates = new Set();

  contacts.forEach((contact) => {
    const first = String(contact.firstName || "").trim().toLowerCase();
    const last = String(contact.lastName || "").trim().toLowerCase();

    if (!first || !last) {
      return;
    }

    candidates.add(`${first}.${last}@${domain}`);
    candidates.add(`${last}.${first}@${domain}`);
    candidates.add(`${first}${last}@${domain}`);
    candidates.add(`${first[0]}${last}@${domain}`);
  });

  return [...candidates].map((email) => ({
    email,
    type: "inferred",
    verified: false
  }));
}

export function createEmailDomainResolutionService({
  perplexityClient,
  recruiterContactStore
}) {
  const store = createEmailDomainStore();
  const jobs = new Map();

  async function startResolution({ reviewId, organisation }) {
    const jobId = `email-domain-${reviewId}-${Date.now()}`;

    jobs.set(jobId, {
      jobId,
      reviewId,
      status: "queued",
      startedAt: new Date().toISOString()
    });

    processJob({
      jobId,
      reviewId,
      organisation
    }).catch((error) => {
      jobs.set(jobId, {
        ...jobs.get(jobId),
        status: "failed",
        error: error.message
      });
    });

    return jobs.get(jobId);
  }

  async function processJob({ jobId, reviewId, organisation }) {
    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: "researching"
    });

    const research = await perplexityClient.resolveEmailDomain({
      organisationName: organisation.name,
      organisationUrl: organisation.url,
      linkedinUrl: organisation.linkedinUrl
    });

    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: "validating"
    });

    const contacts = await recruiterContactStore.listByReview(reviewId);
    const linkedContacts = contacts.filter((contact) => contact.reviewId);

    const resolution = await store.save(reviewId, {
      ...research,
      organisation,
      emailCandidates: generateCandidates(
        linkedContacts,
        research.emailDomain
      )
    });

    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: "completed",
      completedAt: new Date().toISOString(),
      result: resolution
    });
  }

  return {
    startResolution,
    async getJob(jobId) {
      return jobs.get(jobId) || null;
    },
    async getResolution(reviewId) {
      return store.get(reviewId);
    }
  };
}
''', encoding="utf-8", newline="\n")

print("Created:")
print(INFRA / "perplexity-client.js")
print(APP / "email-domain-store.js")
print(APP / "email-domain-resolution-service.js")