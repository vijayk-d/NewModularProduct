from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

SERVER = ROOT / "src" / "interfaces" / "http" / "create-local-server.js"
RENDERING = ROOT / "src" / "interfaces" / "http" / "rendering.js"

def show(path, patterns, context=6):
    print("=" * 90)
    print(f"FILE: {path}")
    print("=" * 90)

    if not path.exists():
        print("FILE NOT FOUND")
        return

    lines = path.read_text(encoding="utf-8").splitlines()

    for pattern in patterns:
        print(f"\n--- SEARCH: {pattern} ---")
        matches = []

        for index, line in enumerate(lines, start=1):
            if re.search(pattern, line, re.IGNORECASE):
                matches.append(index)

        if not matches:
            print("NO MATCH")
            continue

        for match in matches[:5]:
            start = max(1, match - context)
            end = min(len(lines), match + context)

            print(f"\nMatch at line {match}:")
            for number in range(start, end + 1):
                marker = ">>" if number == match else "  "
                print(f"{marker} {number:4}: {lines[number - 1]}")

show(
    SERVER,
    [
        r"^import\s",
        r"createRecruiterContactStore|recruiterContactStore",
        r"app\.(get|post|put|delete)\(",
        r"listen\(",
        r"export\s+function\s+createLocalServer|export\s+default"
    ]
)

show(
    RENDERING,
    [
        r"renderApplicationReview\s*\(\{",
        r"contacts\s*=\s*\[\]",
        r"contactLinking",
        r"renderRecruiterContacts\(contacts\)",
        r"Organisation contacts|organisation contacts",
        r"</body>|</html>"
    ]
)

print("\nDiagnostic complete. Copy the entire output and paste it back.")