from pathlib import Path

target = Path("src/interfaces/http/review-page.js")
text = target.read_text(encoding="utf-8")

old = '''        window.location.reload();'''

new = '''        await refreshImportedContacts(reviewId);'''

occurrences = text.count(old)

if occurrences == 0:
    raise SystemExit("Could not find window.location.reload(). No changes made.")

if occurrences != 1:
    raise SystemExit(
        f"Expected exactly one window.location.reload() call, found {occurrences}. "
        "No changes made."
    )

text = text.replace(old, new, 1)
target.write_text(text, encoding="utf-8", newline="\n")
print("Delete action now refreshes only the imported-contacts section.")
