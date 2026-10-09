from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDERING = ROOT / "src" / "interfaces" / "http" / "rendering.js"

text = RENDERING.read_text(encoding="utf-8")

if "export function renderApplicationReview" not in text:
    raise SystemExit(
        "ERROR: rendering.js does not contain the original renderer. "
        "Restore it from Git before continuing."
    )

if "export function escapeHtml" not in text:
    helper = '''export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

'''

    first_export = text.find("export function")

    if first_export == -1:
        raise SystemExit(
            "ERROR: could not find an exported renderer."
        )

    text = text[:first_export] + helper + text[first_export:]

# Add a nonce to existing inline script tags only.
text = text.replace(
    "<script>",
    '<script nonce="__SCRIPT_NONCE__">'
)

RENDERING.write_text(
    text,
    encoding="utf-8",
    newline="\n"
)

print("PATCHED: restored escapeHtml export")
print("PATCHED: nonce-marked existing inline scripts")