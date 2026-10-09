from pathlib import Path

target = Path("src/interfaces/http/rendering.js")
text = target.read_text(encoding="utf-8")

marker = '''          <script>
            document
              .getElementById("select-all-contact-links")'''

replacement = '''          <script nonce="__SCRIPT_NONCE__">
            document
              .getElementById("select-all-contact-links")'''

if marker not in text:
    raise SystemExit(
        "Contact-linking script block was not found. "
        "No changes were made."
    )

text = text.replace(marker, replacement, 1)
target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
