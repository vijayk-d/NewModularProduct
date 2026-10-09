from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "src" / "application" / "recruiter-contact-import-service.js"

if not TARGET.exists():
    raise SystemExit(f"File not found: {TARGET}")

text = TARGET.read_text(encoding="utf-8")

if "normalise-recruiter-contact.js" not in text:
    imports = '''import { normaliseRecruiterContact } from "./normalise-recruiter-contact.js";
'''
    first_import_end = text.find("\n", text.find("import "))
    text = text[:first_import_end + 1] + imports + text[first_import_end + 1:]

old = "incomingContacts: recruiters"

if old in text:
    text = text.replace(
        old,
        '''incomingContacts: recruiters.map((contact) =>
          normaliseRecruiterContact(contact, { organisationId })
        )''',
        1
    )
else:
    print(
        "WARNING: expected recruiters payload was not found. "
        "Inspect recruiter-contact-import-service.js."
    )

TARGET.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated: {TARGET}")
