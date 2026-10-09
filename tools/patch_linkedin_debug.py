from pathlib import Path

target = Path("new-modular-product-linkedin-contact-bridge.user.js")
text = target.read_text(encoding="utf-8")

old = '''  function extractProfiles() {
    const contacts = [];
    const seen = new Set();

    document.querySelectorAll('a[href*="/in/"]').forEach((anchor) => {'''

new = '''  function extractProfiles() {
    const contacts = [];
    const seen = new Set();
    const allAnchors = document.querySelectorAll('a[href*="/in/"]');

    console.log(
      "[Clean LinkedIn Bridge] Found",
      allAnchors.length,
      "profile anchors on this page."
    );

    allAnchors.forEach((anchor) => {'''

if old not in text:
    raise SystemExit(
        "extractProfiles start was not found. No changes made."
    )

text = text.replace(old, new, 1)

old_end = '''    return contacts;
  }

'''

new_end = '''    console.log(
      "[Clean LinkedIn Bridge] Extracted",
      contacts.length,
      "valid contacts before validation."
    );

    if (contacts.length) {
      console.table(
        contacts.map((c) => ({
          firstName: c.firstName,
          lastName: c.lastName,
          role: c.role
        }))
      );
    }

    return contacts;
  }

'''

if old_end not in text:
    raise SystemExit(
        "extractProfiles end was not found. No changes made."
    )

text = text.replace(old_end, new_end, 1)

target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
