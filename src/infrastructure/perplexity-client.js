const PERPLEXITY_API_URL =
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
  return {
    async resolveEmailDomain({
      organisationName,
      organisationUrl,
      linkedinUrl
    }) {
      if (!apiKey) {
        throw new Error(
          "PERPLEXITY_API_KEY is not configured. Add it to the local .env file."
        );
      }

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
