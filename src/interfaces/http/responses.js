import crypto from "node:crypto";

export function sendText(response, statusCode, text, headers = {}) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...headers
  });

  response.end(text);
}

export function sendHtml(response, statusCode, html, headers = {}) {
  const scriptNonce = crypto.randomUUID().replaceAll("-", "");
  const document = html.replaceAll(
    "__SCRIPT_NONCE__",
    scriptNonce
  );

  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy":
      headers["content-security-policy"] ||
      "default-src 'self'; style-src 'self' 'unsafe-inline'; " +
        `script-src 'nonce-${scriptNonce}'; ` +
        "base-uri 'none'; form-action 'self'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy":
      (process.env.NMP_ENV || "development") === "development" &&
      String(process.env.PORT || "3000") === "3000" &&
      ["127.0.0.1", "localhost", "::1"].includes(process.env.HOST || "127.0.0.1")
        ? "same-origin" : "no-referrer", // REFERENCE_FORM_ORIGIN_FIX
    ...headers
  });

  response.end(document);
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });

  response.end(JSON.stringify(payload));
}
