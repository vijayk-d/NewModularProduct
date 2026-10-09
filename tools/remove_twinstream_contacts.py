from pathlib import Path
import json

store = Path("output/imported-recruiter-contacts.json")
backup = store.with_suffix(".json.before-clean-reimport")

contacts = json.loads(store.read_text(encoding="utf-8"))

backup.write_text(
    json.dumps(contacts, indent=2, ensure_ascii=False),
    encoding="utf-8"
)

kept = [
    contact
    for contact in contacts
    if contact.get("organisationId") != "domain:twinstream.com"
]

store.write_text(
    json.dumps(kept, indent=2, ensure_ascii=False),
    encoding="utf-8"
)

print(f"Removed {len(contacts) - len(kept)} TwinStream contacts.")
print(f"Backup: {backup}")
