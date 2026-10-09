from pathlib import Path

target = Path("src/application/import-recruiter-contacts.js")
text = target.read_text(encoding="utf-8")

import_line = 'import { normaliseRecruiterContact } from "./normalise-recruiter-contact.js";\n'

if import_line not in text:
    first_newline = text.find("\n")
    text = (
        text[:first_newline + 1]
        + import_line
        + text[first_newline + 1:]
    )

old = '''      const incomingContacts = recruiters.map((recruiter) =>
        createRecruiterContact({
          ...recruiter,
          organisationId,
          emailDomain,
          sourceUrl
        })
      );'''

new = '''      const incomingContacts = recruiters.map((recruiter) =>
        createRecruiterContact(
          normaliseRecruiterContact(recruiter, { organisationId })
        )
      );'''

if old not in text:
    raise SystemExit(
        "Expected import block was not found. No changes were made."
    )

text = text.replace(old, new, 1)
target.write_text(text, encoding="utf-8", newline="\\n")
print(f"Updated {target}")
