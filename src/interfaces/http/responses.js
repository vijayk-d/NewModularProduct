export function sendText(response, statusCode, text, headers = {}) {
  response.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
    ...headers
  });

  response.end(text);
}

export function sendHtml(response, statusCode, html) {
  const scriptNonce = crypto.randomUUID().replaceAll('-', '');

  const document = html.replaceAll('__SCRIPT_NONCE__', scriptNonce);

  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'nonce-${scriptNonce}'; base-uri 'none'; form-action 'self'`,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer'
  });

  response.end(document);
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });

  response.end(JSON.stringify(payload));
}