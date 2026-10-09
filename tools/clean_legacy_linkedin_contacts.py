from pathlib import Path
import json
import sys

if len(sys.argv) != 2:
    raise SystemExit(
        "Usage: python tools/clean_legacy_linkedin_contacts.py "
        "path-to-contact-store.json"
    )

store = Path(sys.argv[1]).resolve()

if not store.exists():
    raise SystemExit(f"Contact store not found: {store}")

contacts = json.loads(store.read_text(encoding="utf-8"))

legacy = [
    contact
    for contact in contacts
    if contact.get("organisationId") == "linkedin:www.linkedin.com"
]

print(f"Store: {store}")
print(f"Legacy records found: {len(legacy)}")

for contact in legacy:
    print(
        contact.get("id"),
        "|",
        contact.get("fullName"),
        "|",
        contact.get("linkedinUrl")
    )

if not legacy:
    print("Nothing to remove.")
    raise SystemExit(0)

confirmation = input(
    "\nType DELETE-LEGACY-LINKEDIN to permanently remove these records: "
).strip()

if confirmation != "DELETE-LEGACY-LINKEDIN":
    print("Cancelled. No changes made.")
    raise SystemExit(0)

backup = store.with_suffix(store.suffix + ".before-legacy-cleanup")
backup.write_text(
    json.dumps(contacts, indent=2, ensure_ascii=False),
    encoding="utf-8"
)

remaining = [
    contact
    for contact in contacts
    if contact.get("organisationId") != "linkedin:www.linkedin.com"
]

store.write_text(
    json.dumps(remaining, indent=2, ensure_ascii=False),
    encoding="utf-8"
)

print(f"Removed {len(legacy)} legacy records.")
print(f"Backup: {backup}")