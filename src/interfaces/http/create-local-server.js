import { createServer } from 'node:http';

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer'
  });

  response.end(html);
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff'
  });

  response.end(text);
}

function renderApplicationForm() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Application preparation</title>
  <style>
    :root {
      color-scheme: light;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      background: #f5f7fb;
      color: #152033;
    }

    body {
      margin: 0;
      padding: 2rem 1rem;
    }

    main {
      max-width: 52rem;
      margin: 0 auto;
      padding: 2rem;
      background: #ffffff;
      border: 1px solid #d7deea;
      border-radius: 0.75rem;
      box-shadow: 0 0.5rem 1.5rem rgb(21 32 51 / 8%);
    }

    h1 {
      margin-top: 0;
    }

    .intro,
    .notice {
      color: #475569;
      line-height: 1.5;
    }

    .notice {
      padding: 1rem;
      border-left: 0.25rem solid #2563eb;
      background: #eff6ff;
    }

    form {
      display: grid;
      gap: 1rem;
    }

    label {
      display: grid;
      gap: 0.4rem;
      font-weight: 600;
    }

    input,
    textarea,
    button {
      font: inherit;
    }

    input,
    textarea {
      box-sizing: border-box;
      width: 100%;
      padding: 0.65rem;
      border: 1px solid #94a3b8;
      border-radius: 0.4rem;
      background: #ffffff;
    }

    textarea {
      min-height: 8rem;
      resize: vertical;
    }

    button {
      justify-self: start;
      padding: 0.7rem 1rem;
      border: 0;
      border-radius: 0.4rem;
      background: #94a3b8;
      color: #ffffff;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <main>
    <h1>Application preparation</h1>
    <p class="intro">Prepare and review a local application draft before manually sending it.</p>

    <form>
      <label>
        Job title
        <input name="jobTitle" type="text" required>
      </label>

      <label>
        Recruiter or hiring manager
        <input name="recruiterName" type="text">
      </label>

      <label>
        Job advert URL
        <input name="jobAdvertLink" type="url">
      </label>

      <label>
        Vacancy reference
        <input name="jobReference" type="text">
      </label>

      <label>
        Preferred CV role codes
        <input name="preferredRoleCodes" type="text" placeholder="SM, ADL">
      </label>

      <label>
        Job description
        <textarea name="jobDescriptionText" required></textarea>
      </label>

      <label>
        CV highlights
        <textarea name="cvHighlights" placeholder="One truthful, role-relevant item per line"></textarea>
      </label>

      <button type="button" disabled>Generate application (coming next)</button>
    </form>

    <p class="notice">This local tool does not send email. Review and send manually.</p>
  </main>
</body>
</html>`;
}

export function createLocalServer() {
  return createServer((request, response) => {
    const method = request.method || 'GET';
    const url = new URL(request.url || '/', 'http://localhost');

    if (method !== 'GET') {
      response.writeHead(405, {
        allow: 'GET',
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff'
      });
      response.end('Method Not Allowed');
      return;
    }

    if (url.pathname === '/') {
      sendHtml(response, 200, renderApplicationForm());
      return;
    }

    sendText(response, 404, 'Not Found');
  });
}
