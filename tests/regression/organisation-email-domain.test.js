import test from "node:test";
import assert from "node:assert/strict";
import {
  createPerplexityCompanyResearchAdapter
} from "../../src/infrastructure/research/perplexity-company-research-adapter.js";
import {
  researchOrganization
} from "../../src/application/research-organization.js";

function structuredResponse(domainResearch) {
  return {
    choices: [{
      message: {
        content: `<organisation-research>${JSON.stringify({
          summary: "Synthetic organisation summary.",
          companyValues: ["Collaboration"],
          ...(domainResearch === undefined
            ? {}
            : { emailDomainResearch: domainResearch })
        })}</organisation-research>`
      }
    }],
    citations: ["https://twinstream.com/"]
  };
}

function domainResearch(emailDomain) {
  return {
    emailDomain,
    confidence: "high",
    reasoning: "Synthetic official-source evidence.",
    evidence: [{
      title: "Official contact page",
      url: "https://twinstream.com/contact"
    }]
  };
}

function adapterFor(domain, calls = []) {
  return createPerplexityCompanyResearchAdapter({
    apiKey: "synthetic-test-key",
    now: () => "2026-10-09T12:00:00Z",
    fetchImpl: async (url, options) => {
      calls.push({
        url,
        body: JSON.parse(options.body)
      });
      return {
        ok: true,
        json: async () => structuredResponse(domain)
      };
    }
  });
}

test("organisation research requests values and domain in one provider call", async () => {
  const calls = [];
  const adapter = adapterFor(domainResearch("twinstream.com"), calls);

  const result = await adapter.research({
    companyName: "TwinStream",
    companyUrl: "https://twinstream.com",
    jobDescriptionSummary: "Project Manager"
  });

  assert.equal(calls.length, 1);
  const prompt = calls[0].body.messages
    .map((message) => message.content)
    .join("\n");

  assert.match(prompt, /companyValues/);
  assert.match(prompt, /emailDomainResearch/);
  assert.equal(result.status, "found");
  assert.deepEqual(result.companyValues, ["Collaboration"]);
  assert.equal(result.emailDomainResearch.emailDomain, "twinstream.com");
  assert.equal(result.emailDomainResearch.confidence, "high");
});

test("application research service retains the domain result and its evidence", async () => {
  const adapter = adapterFor(domainResearch("twinstream.com"));

  const result = await researchOrganization(
    {
      companyName: "TwinStream",
      companyUrl: "https://twinstream.com"
    },
    { companyResearchPort: adapter }
  );

  assert.equal(result.status, "found");
  assert.equal(result.summary, "Synthetic organisation summary.");
  assert.equal(result.emailDomainResearch.emailDomain, "twinstream.com");
  assert.equal(
    result.emailDomainResearch.evidence[0].url,
    "https://twinstream.com/contact"
  );
});

test("missing or unknown domain does not discard successful organisation research", async () => {
  for (const domain of [
    undefined,
    { emailDomain: null, confidence: "low", reasoning: "Unknown", evidence: [] },
    { emailDomain: "", confidence: "low", reasoning: "Unknown", evidence: [] }
  ]) {
    const result = await adapterFor(domain).research({
      companyName: "TwinStream"
    });

    assert.equal(result.status, "found");
    assert.equal(result.summary, "Synthetic organisation summary.");
    assert.deepEqual(result.companyValues, ["Collaboration"]);
    assert.equal(result.emailDomainResearch, undefined);
  }
});

test("unsafe and malformed domains are rejected without losing research", async () => {
  for (const value of [
    "linkedin.com",
    "careers.linkedin.com",
    "gmail.com",
    "example.com",
    "localhost",
    "-invalid.com",
    "invalid-.com",
    "https://user:password@twinstream.com",
    "https://twinstream.com:8443"
  ]) {
    const result = await adapterFor(domainResearch(value)).research({
      companyName: "TwinStream"
    });

    assert.equal(result.status, "found", value);
    assert.equal(result.emailDomainResearch, undefined, value);
    assert.deepEqual(result.companyValues, ["Collaboration"], value);
  }
});

test("valid domain research normalizes URL hostname and rejects unsafe evidence links", async () => {
  const domain = domainResearch("https://WWW.TWINSTREAM.COM/contact");
  domain.confidence = "unsupported";
  domain.evidence.push({
    title: "Unsafe link",
    url: "javascript:alert(1)"
  });

  const result = await adapterFor(domain).research({
    companyName: "TwinStream"
  });

  assert.equal(result.emailDomainResearch.emailDomain, "twinstream.com");
  assert.equal(result.emailDomainResearch.confidence, "low");
  assert.equal(result.emailDomainResearch.evidence.length, 1);
  assert.equal(
    result.emailDomainResearch.evidence[0].url,
    "https://twinstream.com/contact"
  );
});

test("unstructured provider output retains summary without inventing a domain", async () => {
  const adapter = createPerplexityCompanyResearchAdapter({
    apiKey: "synthetic-test-key",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: { content: "Synthetic organisation summary without JSON." }
        }]
      })
    })
  });

  const result = await adapter.research({ companyName: "TwinStream" });

  assert.equal(result.status, "found");
  assert.match(result.summary, /Synthetic organisation summary/);
  assert.equal(result.emailDomainResearch, undefined);
});
