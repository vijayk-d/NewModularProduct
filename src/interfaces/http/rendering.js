import crypto from 'node:crypto';

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

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderField(name, label, value, options = {}) {
  const {
    type = 'text',
    required = false,
    placeholder = '',
    textarea = false
  } = options;

  const requiredAttribute = required ? ' required' : '';
  const placeholderAttribute = placeholder
    ? ` placeholder="${escapeHtml(placeholder)}"`
    : '';

  if (textarea) {
    return `      <label>
        ${escapeHtml(label)}
        <textarea name="${escapeHtml(name)}"${requiredAttribute}${placeholderAttribute}>${escapeHtml(value)}</textarea>
      </label>`;
  }

  return `      <label>
        ${escapeHtml(label)}
        <input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}"${requiredAttribute}${placeholderAttribute}>
      </label>`;
}

