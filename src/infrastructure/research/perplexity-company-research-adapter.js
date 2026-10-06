function normalizeText(value = '') {
  return String(value ?? '').trim();
}

function normalizeCompanyValues(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();

  return value.reduce((values, item) => {
    const normalized = normalizeText(item)
      .replace(/\s+/g, ' ')
      .slice(0, 160);

    if (!normalized) {
      return values;
    }

    const key = normalized.toLowerCase();

    if (seen.has(key) || values.length >= 5) {
      return values;
    }

    seen.add(key);
    values.push(normalized);

    return values;
  }, []);
}

function parseJsonObject(value = '') {
  const content = normalizeText(value);

  if (!content.startsWith('{') || !content.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(content);

    return parsed && typeof parsed === 'object'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function normalizeSource(source) {
  const title = normalizeText(source?.title || source?.url);
  const url = normalizeText(source?.url || source?.link);

  if (!title && !url) {
    return null;
  }

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        title,
        url: ''
      };
    }

    return {
      title: title || parsed.href,
      url: parsed.href
    };
  } catch {
    return {
      title,
      url: ''
    };
  }
}

function parseStructuredResearch(text = '') {
  const content = normalizeText(text);

  const taggedMatch = content.match(
    /<organisation-research>\s*([\s\S]*?)\s*<\/organisation-research>/i
  );

  const fencedMatch = content.match(
    /```(?:json)?\s*([\s\S]*?)\s*```/i
  );

  const parsed =
    parseJsonObject(taggedMatch?.[1]) ||
    parseJsonObject(fencedMatch?.[1]) ||
    parseJsonObject(content);

  if (!parsed) {
    return {
      summary: content.slice(0, 800),
      companyValues: []
    };
  }

  return {
    summary: normalizeText(parsed.summary).slice(0, 800),
    companyValues: normalizeCompanyValues(parsed.companyValues)
  };
}

export function createPerplexityCompanyResearchAdapter({
  apiKey,
  model = 'sonar',
  fetchImpl = fetch,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('A Perplexity API key is required.');
  }

  return {
    async research(request) {
      const companyName = normalizeText(request.companyName).slice(0, 120);
      const companyUrl = normalizeText(request.companyUrl).slice(0, 300);
      const jobDescriptionSummary = normalizeText(
        request.jobDescriptionSummary
      ).slice(0, 160);

      const prompt = [
        'Research this organisation using web sources.',
        `Organisation: ${companyName}`,
        companyUrl ? `Official website: ${companyUrl}` : '',
        jobDescriptionSummary ? `Role context: ${jobDescriptionSummary}` : '',
        'Prefer official organisation sources.',
        'Identify only explicitly stated organisation values.',
        'Do not infer values from generic marketing language.',
        'Return ONLY this tagged JSON block. Do not add prose before or after it.',
        '<organisation-research>',
        '{"summary":"Maximum 70 factual words.","companyValues":["Up to 5 explicit values, each under 12 words."]}',
        '</organisation-research>',
        'Use an empty companyValues array if no explicit values can be verified.',
        'Do not make claims about candidates or individuals.'
      ].filter(Boolean).join('\n');

      let response;

      try {
        response = await fetchImpl(
          'https://api.perplexity.ai/chat/completions',
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${apiKey}`,
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: 'system',
                  content:
                    'You research organisations and return factual, ' +
                    'source-backed information. Never invent facts or ' +
                    'make claims about candidates.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ]
            })
          }
        );
      } catch {
        throw new Error('Perplexity organisation research is unavailable.');
      }

      if (!response.ok) {
        throw new Error('Perplexity organisation research is unavailable.');
      }

      let payload;

      try {
        payload = await response.json();
      } catch {
        throw new Error(
          'Perplexity organisation research returned an invalid response.'
        );
      }

      const message = payload?.choices?.[0]?.message?.content;

      if (typeof message !== 'string' || !message.trim()) {
        throw new Error(
          'Perplexity organisation research returned no usable summary.'
        );
      }

      const citations = Array.isArray(payload.citations)
        ? payload.citations
        : Array.isArray(payload.search_results)
          ? payload.search_results
          : [];

      const sources = citations
        .map((citation) => {
          if (typeof citation === 'string') {
            return {
              title: citation,
              url: citation
            };
          }

          return normalizeSource(citation);
        })
        .filter(Boolean);

      const research = parseStructuredResearch(message);

      return {
        status: 'found',
        companyValues: research.companyValues,
        summary: research.summary,
        sources,
        researchedAt: now(),
        provider: 'perplexity'
      };
    }
  };
}
