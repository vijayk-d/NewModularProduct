from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

FILES = [
    ROOT / "src" / "interfaces" / "http" / "create-local-server.js",
    ROOT / "src" / "interfaces" / "http" / "rendering.js",
    ROOT / "src" / "interfaces" / "http" / "responses.js",
    ROOT / "src" / "interfaces" / "http" / "review-page.js",
]

PATTERNS = [
    r"Content-Security-Policy",
    r"content-security-policy",
    r"script-src",
    r"scriptNonce",
    r"nonce=",
    r"review-page\.js",
    r"<script",
    r"</script>",
    r"delete-selected-contacts-button",
    r"clear-imported-contacts-button",
    r"recruiter-contacts/delete",
    r"sendHtml\(",
    r"sendText\(",
]

for path in FILES:
    print("=" * 100)
    print(f"FILE: {path}")
    print("=" * 100)

    if not path.exists():
        print("FILE NOT FOUND")
        continue

    lines = path.read_text(encoding="utf-8").splitlines()

    found = set()

    for line_number, line in enumerate(lines, start=1):
        for pattern in PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                found.add(line_number)

    if not found:
        print("NO MATCHES")
        continue

    for line_number in sorted(found):
        start = max(1, line_number - 3)
        end = min(len(lines), line_number + 5)

        print(f"\n--- lines {start}-{end}; match line {line_number} ---")
        for number in range(start, end + 1):
            marker = ">>" if number == line_number else "  "
            print(f"{marker} {number:4}: {lines[number - 1]}")

print("\nDiagnostic complete.")