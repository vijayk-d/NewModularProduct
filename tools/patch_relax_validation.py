from pathlib import Path

target = Path("new-modular-product-linkedin-contact-bridge.user.js")
text = target.read_text(encoding="utf-8")

old = '''        const invalid = contacts.filter((contact) =>
          !contact.firstName ||
          !contact.lastName ||
          !contact.role ||
          contact.lastName.split(/\\s+/).length > 4 ||
          /open roles|mutual connection|united kingdom|greater/i.test(
            `${contact.lastName} ${contact.role}`
          )
        );

        if (invalid.length) {
          console.table(invalid);
          throw new Error(
            `${invalid.length} contacts failed validation. Nothing was imported.`
          );
        }

        const result = await importContacts(contacts);'''

new = '''        const invalid = contacts.filter((contact) =>
          !contact.firstName ||
          !contact.lastName ||
          !contact.role ||
          contact.lastName.split(/\\s+/).length > 6 ||
          /open roles|mutual connection/i.test(
            `${contact.lastName} ${contact.role}`
          )
        );

        if (invalid.length) {
          console.table(invalid);
          throw new Error(
            `${invalid.length} contacts failed validation. Nothing was imported.`
          );
        }

        const result = await importContacts(contacts);'''

if old not in text:
    raise SystemExit(
        "Validation block was not found. No changes were made."
    )

text = text.replace(old, new, 1)
target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
