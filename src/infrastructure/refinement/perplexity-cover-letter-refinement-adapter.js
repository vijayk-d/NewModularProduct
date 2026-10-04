export function createPerplexityCoverLetterRefinementAdapter({
  apiKey,
  model = 'sonar',
  fetchImpl = fetch
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('A Perplexity API key is required.');
  }

  return {
    async refine(request) {
      const context = [
        request.jobDescriptionSummary
          ? `Role context: ${request.jobDescriptionSummary}.`
          : '',
        request.selectedCvHighlights.length
          ? `CV evidence:\n- ${request.selectedCvHighlights.join('\n- ')}`
          : '',
        request.companyValues.length
          ? `Organisation values:\n- ${request.companyValues.join('\n- ')}`
          : '',
        request.instructions
          ? `Review instructions: ${request.instructions}`
          : ''
      ].filter(Boolean).join('\n\n');

      const prompt = [
        'Review the following plain-text cover-letter draft.',
        'Identify strengths, risks, unsupported claims, and suggested changes.',
        'Propose an improved draft using only claims supported by the supplied evidence.',
        'Do not invent employment history, qualifications, achievements, or personal details.',
        'Return a concise review and a proposed plain-text draft.',
        context,
        `Draft:\n${request.draftPlainText}`
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
                  'You review job-application cover letters. ' +
                  'Use only supplied evidence, identify unsupported claims, ' +
                  'and never fabricate candidate details.'
              },
              {
                role: 'user',
                content: prompt
              }
            ]
          })
        });
      } catch {
        throw new Error('Perplexity cover-letter refinement is unavailable.');
      }

      if (!response.ok) {
        throw new Error('Perplexity cover-letter refinement is unavailable.');
      }

      let payload;

      try {
        payload = await response.json();
      } catch {
        throw new Error('Perplexity cover-letter refinement returned an invalid response.');
      }

      const message = payload?.choices?.[0]?.message?.content;

      if (typeof message !== 'string' || !message.trim()) {
        throw new Error('Perplexity cover-letter refinement returned no usable draft.');
      }

      return {
        review: {
          strengths: [],
          risks: [],
          unsupportedClaims: [],
          suggestedChanges: []
        },
        proposedDraft: message.trim(),
        citations: [],
        provider: 'perplexity'
      };
    }
  };
}