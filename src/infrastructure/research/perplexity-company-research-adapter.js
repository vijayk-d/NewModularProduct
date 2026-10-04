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
        request.companyUrl ? `Official website: ${request.companyUrl}.` : '',
        request.jobDescriptionSummary
          ? `Relevant role context: ${request.jobDescriptionSummary}.`
          : '',
        'Return concise organisation values and a short factual summary.',
        'Cite only sources you actually used.',
        'Do not infer claims about individuals or candidates.'
      ].filter(Boolean).join('\n\n');

      let response;

      try {
        response = await fetchImpl('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'authorization': `Bearer ${apiKey}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You research organisations and return factual, source-backed information. ' +
                  'Never invent facts or make claims about candidates.'
              },
              {
                role: 'user',
                content: prompt
              }
            ]
          })
        });
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
        throw new Error('Perplexity organisation research returned an invalid response.');
      }

      const message = payload?.choices?.[0]?.message?.content;

      if (typeof message !== 'string' || !message.trim()) {
        throw new Error('Perplexity organisation research returned no usable summary.');
      }

      const citations = Array.isArray(payload.citations)
        ? payload.citations
        : Array.isArray(payload.search_results)
          ? payload.search_results
          : [];

      const sources = citations
        .map((citation) => {
          if (typeof citation === 'string') {
            return { title: citation, url: citation };
          }

          return {
            title: String(citation?.title ?? '').trim(),
            url: String(citation?.url ?? citation?.link ?? '').trim()
          };
        })
        .filter((source) => source.title || source.url);

      return {
        status: 'found',
        companyValues: [],
        summary: message.trim(),
        sources,
        researchedAt: now(),
        provider: 'perplexity'
      };
    }
  };
}