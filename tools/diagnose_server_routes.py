from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

SERVER = ROOT / "src" / "interfaces" / "http" / "create-local-server.js"

def show(path, patterns, context=12, max_matches=8):
    print("=" * 100)
    print(f"FILE: {path}")
    print("=" * 100)

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

        for match in matches[:max_matches]:
            start = max(1, match - context)
            end = min(len(lines), match + context)

            print(f"\nMatch at line {match}:")
            for number in range(start, end + 1):
                marker = ">>" if number == match else "  "
                print(f"{marker} {number:4}: {lines[number - 1]}")

show(
    SERVER,
    [
        r"request\.method",
        r"request\.url",
        r"new\s+URL\(",
        r"pathname",
        r"/api/",
        r"/api/recruiters/import",
        r"sendJson\(",
        r"deriveReviewOrganisationId",
        r"organisationName|organisation\.name|companyName",
        r"organisationUrl|companyUrl|advertUrl",
        r"renderOrganisationResearch"
    ],
    context=15,
    max_matches=10
)

print("\nDiagnostic complete. Copy and paste the entire output.")