from pathlib import Path

target = Path("new-modular-product-linkedin-contact-bridge.user.js")
text = target.read_text(encoding="utf-8")

old = '''      const profileName = profileNameFromAnchor(anchor);

      if (!profileName) return;

      const card = getProfileCard(anchor);

      if (!card) return;

      const { firstName, lastName } = splitName(profileName);
      const role = extractRole(card, profileName);

      if (!firstName || !lastName || !role) return;'''

new = '''      const profileName = profileNameFromAnchor(anchor);

      if (!profileName) {
        console.log(
          "[Clean LinkedIn Bridge] Rejected: no profile name",
          anchor.href,
          anchor.getAttribute("aria-label"),
          anchor.textContent?.slice(0, 120)
        );
        return;
      }

      const card = getProfileCard(anchor);

      if (!card) {
        console.log(
          "[Clean LinkedIn Bridge] Rejected: no card",
          profileName,
          anchor.href
        );
        return;
      }

      const { firstName, lastName } = splitName(profileName);
      const role = extractRole(card, profileName);

      if (!firstName || !lastName || !role) {
        console.log(
          "[Clean LinkedIn Bridge] Rejected: incomplete contact",
          {
            profileName,
            firstName,
            lastName,
            role,
            cardText: card.innerText?.slice(0, 300)
          }
        );
        return;
      }'''

if old not in text:
    raise SystemExit(
        "Extraction block was not found. No changes were made."
    )

text = text.replace(old, new, 1)
target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
