from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDERING = ROOT / "src" / "interfaces" / "http" / "rendering.js"

text = RENDERING.read_text(encoding="utf-8")

start_marker = '''  <script nonce="__SCRIPT_NONCE__">
    function escapeHtml(value) {'''

start = text.find(start_marker)

if start == -1:
    raise SystemExit(
        "ERROR: inline email-domain script was not found. "
        "No changes made."
    )

end = text.find("  </script>", start)

if end == -1:
    raise SystemExit(
        "ERROR: closing tag for inline email-domain script was not found. "
        "No changes made."
    )

end += len("  </script>")

text = text[:start] + text[end:]

RENDERING.write_text(
    text,
    encoding="utf-8",
    newline="\n"
)

print("Removed the inline email-domain script from rendering.js")