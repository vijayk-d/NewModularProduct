from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

RENDERING = ROOT / "src" / "interfaces" / "http" / "rendering.js"
RESPONSES = ROOT / "src" / "interfaces" / "http" / "responses.js"
SERVER = ROOT / "src" / "interfaces" / "http" / "create-local-server.js"


def replace_all(path, old, new, label):
    text = path.read_text(encoding="utf-8")

    if old not in text:
        print(f"SKIPPED: {label}: anchor not found")
        return

    updated = text.replace(old, new)
    path.write_text(updated, encoding="utf-8", newline="\n")
    print(f"PATCHED: {label}: {text.count(old)} occurrence(s)")


# The existing inline review script must contain a literal placeholder.
rendering = RENDERING.read_text(encoding="utf-8")

rendering = rendering.replace(
    '<script nonce="${escapeHtml(scriptNonce)}">',
    '<script nonce="__SCRIPT_NONCE__">'
)

rendering = rendering.replace(
    'nonce="${escapeHtml(scriptNonce)}"',
    'nonce="__SCRIPT_NONCE__"'
)

RENDERING.write_text(rendering, encoding="utf-8", newline="\n")
print("PATCHED: rendering.js: replaced dynamic nonce attributes with placeholder")


# Replace responses.js with one consistent nonce-aware implementation.
RESPONSES.write_text(r'''import crypto from "node:crypto";

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
    "referrer-policy": "no-referrer",
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
''', encoding="utf-8", newline="\n")

print("PATCHED: responses.js: restored nonce-aware sendHtml")


# Remove the duplicate CSP override from the review route if still present.
server = SERVER.read_text(encoding="utf-8")

duplicate = '''          {
            "content-security-policy":
              `script-src 'nonce-${scriptNonce}' 'strict-dynamic'`
          }'''

if duplicate in server:
    server = server.replace(duplicate, "", 1)
    SERVER.write_text(server, encoding="utf-8", newline="\n")
    print("PATCHED: create-local-server.js: removed duplicate CSP override")
else:
    print("SKIPPED: create-local-server.js: duplicate CSP override not found")
    