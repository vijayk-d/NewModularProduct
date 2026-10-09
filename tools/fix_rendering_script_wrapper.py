from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDERING = ROOT / "src" / "interfaces" / "http" / "rendering.js"

text = RENDERING.read_text(encoding="utf-8")

old = '''  </script>
 <script nonce="${escapeHtml(scriptNonce)}">
${renderRecruiterContacts(contacts)}

${renderContactLinking(contactLinking)}

${renderEmailDomainResolution(reviewId)}
'''

new = '''  </script>

${renderRecruiterContacts(contacts)}

${renderContactLinking(contactLinking)}

${renderEmailDomainResolution(reviewId)}

  <script
    nonce="${escapeHtml(scriptNonce)}"
    type="module"
    src="/review-page.js"
  ></script>
'''

if old not in text:
    raise SystemExit(
        "ERROR: expected malformed script wrapper was not found. "
        "No changes were made."
    )

if text.count(old) != 1:
    raise SystemExit(
        f"ERROR: expected one malformed wrapper, found {text.count(old)}. "
        "No changes were made."
    )

RENDERING.write_text(
    text.replace(old, new, 1),
    encoding="utf-8",
    newline="\n"
)

print("PATCHED: moved rendered review markup outside script")
print("PATCHED: added nonce-bearing review-page.js module")