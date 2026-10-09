from pathlib import Path

target = Path("src/application/import-recruiter-contacts.js")
text = target.read_text(encoding="utf-8")

import_line = (
    'import { normaliseRecruiterContact } '
    'from "./normalise-recruiter-contact.js";'
)

if import_line not in text:
    first_import_end = text.find("\n")
    if first_import_end < 0:
        raise SystemExit("Could not locate the first import line.")

    text = (
        text[:first_import_end + 1]
        + import_line
        + "\n"
        + text[first_import_end + 1:]
    )

start_marker = "const incomingContacts = recruiters.map"
start = text.find(start_marker)

if start < 0:
    raise SystemExit(
        "Could not find 'const incomingContacts = recruiters.map'. "
        "No changes were made."
    )

end_marker = "      );"
end = text.find(end_marker, start)

if end < 0:
    raise SystemExit(
        "Could not find the end of the incomingContacts block. "
        "No changes were made."
    )

end += len(end_marker)

replacement = """const incomingContacts = recruiters.map((recruiter) =>
        createRecruiterContact(
          normaliseRecruiterContact(recruiter, { organisationId })
        )
      );"""

text = text[:start] + replacement + text[end:]

target.write_text(
    text.replace("\r\n", "\n"),
    encoding="utf-8"
)

print(f"Updated {target}")
