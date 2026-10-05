from datetime import datetime
from pathlib import Path
import shutil
import sys

TARGET = Path("src/interfaces/http/create-local-server.js")


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    print("No changes were made.")
    raise SystemExit(1)


if not TARGET.is_file():
    fail(f"Could not find {TARGET}")

original = TARGET.read_text(encoding="utf-8")

old = """          selectedCvHighlights: review.formData.cvHighlights || [],
"""

new = """          selectedCvHighlights: Array.isArray(review.formData.cvHighlights)
            ? review.formData.cvHighlights
                .map((highlight) => String(highlight ?? '').trim())
                .filter((highlight) =>
                  highlight && highlight.toLowerCase() !== 'null'
                )
            : [],
"""

count = original.count(old)

if count != 1:
    fail(
        "Expected exactly one refinement selectedCvHighlights assignment; "
        f"found {count}."
    )

updated = original.replace(old, new, 1)

timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = TARGET.with_name(
    f"{TARGET.name}.{timestamp}.before-cv-highlights-normalization.bak"
)

shutil.copy2(TARGET, backup)
TARGET.write_text(updated, encoding="utf-8")

print(f"Updated: {TARGET}")
print(f"Backup:  {backup}")
print("Refinement CV-highlights normalization applied.")