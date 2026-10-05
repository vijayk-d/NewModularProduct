import process from 'node:process';

const apiKey = String(process.env.PERPLEXITY_API_KEY || '').trim();
const model = String(process.env.PERPLEXITY_MODEL || 'sonar').trim();

if (!apiKey) {
  console.error(
    '[PERPLEXITY_CHECK] failed reason=PERPLEXITY_API_KEY is not set'
  );
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(
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
              role: 'user',
              content:
                'Reply with exactly: Perplexity connectivity confirmed.'
            }
          ],
          max_tokens: 32
        })
      }
    );

    if (!response.ok) {
      console.error(
        `[PERPLEXITY_CHECK] failed status=${response.status} statusText=${JSON.stringify(response.statusText)}`
      );
      process.exitCode = 1;
    } else {
      const payload = await response.json();
      const content = String(
        payload?.choices?.[0]?.message?.content || ''
      ).trim();

      if (!content) {
        console.error(
          '[PERPLEXITY_CHECK] failed reason=empty completion response'
        );
        process.exitCode = 1;
      } else {
        console.log(
          `[PERPLEXITY_CHECK] success model=${model} response=${JSON.stringify(content)}`
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Unknown network error';

    console.error(
      `[PERPLEXITY_CHECK] failed reason=${JSON.stringify(message)}`
    );

    process.exitCode = 1;
  }
}