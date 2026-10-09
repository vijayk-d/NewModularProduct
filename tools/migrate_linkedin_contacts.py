import json
from pathlib import Path

path = Path("output/imported-recruiter-contacts.json")
data = json.loads(path.read_text(encoding="utf-8"))

if isinstance(data, list):
    contacts = data
    is_wrapped = False
elif isinstance(data, dict) and isinstance(data.get("contacts"), list):
    contacts = data["contacts"]
    is_wrapped = True
else:
    raise SystemExit(
        "Could not find a contact array. Paste the first 40 lines of "
        "output/imported-recruiter-contacts.json before running migration."
    )

changed = 0
for contact in contacts:
    if contact.get("organisationId") == "unknown:linkedin-import":
        contact["organisationId"] = "domain:linkedin.com"
        changed += 1

if is_wrapped:
    data["contacts"] = contacts
    output = data
else:
    output = contacts

path.write_text(
    json.dumps(output, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8",
)

print(f"Migrated {changed} LinkedIn contacts to domain:linkedin.com")
