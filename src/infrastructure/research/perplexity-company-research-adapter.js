function normalizeText(value = '') {
  return String(value ?? '').trim();
}

function normalizeCompanyValues(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();

  return value.reduce((values, item) => {
    const normalized = normalizeText(item);

    if (!normalized) {
      return values;
    }

    const key = normalized.toLowerCase();

    if (seen.has(key)) {
      return values;
    }

    seen.add(key);
    values.push(normalized);

    return values;
  }, []);
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

  const match = content.match(
    /<organisation-research>\s*([\s\S]*?)\s*<\/organisation-research>/i
  );

  if (!match) {
    return {
      summary: content,
      companyValues: []
    };
  }

  try {
    const parsed = JSON.parse(match[1]);

    return {
      summary: normalizeText(parsed?.summary) || content,
      companyValues: normalizeCompanyValues(parsed?.companyValues)
    };
  } catch {
    return {
      summary: content,
      companyValues: []
    };
  }
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
      const prompt = [
        `Research the organisation "${request.companyName}".`,
        request.companyUrl
          ? `Official website: ${request.companyUrl}.`
          : '',
        request.jobDescriptionSummary
          ? `Relevant role context: ${request.jobDescriptionSummary}.`
          : '',
        'Use web sources and prefer the official organisation website.',
        'Identify only explicitly stated organisation values.',
        'Do not infer values from marketing language.',
        'Return a short factual summary plus values in exactly this tagged JSON block:',
        '<organisation-research>',
        '{"summary":"short factual summary","companyValues":["Value 1","Value 2"]}',
        '</organisation-research>',
        'The companyValues array must contain 0 to 8 concise values.',
        'If no explicit values are found, return an empty companyValues array.',
        'After the tagged block, list only sources actually used.',
        'Do not make claims about candidates or individuals.'
      ].filter(Boolean).join('\n\n');

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
