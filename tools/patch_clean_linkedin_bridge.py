from pathlib import Path

target = Path("new-modular-product-linkedin-contact-bridge.user.js")
text = target.read_text(encoding="utf-8")

start = text.find("  function profileNameFromAnchor(")
end = text.find("  function importContacts(", start)

if start < 0 or end < 0:
    raise SystemExit(
        "Could not locate the extraction section. "
        "No changes were made."
    )

replacement = r'''  function profileNameFromAnchor(anchor) {
    const values = [
      anchor.getAttribute("aria-label"),
      anchor.querySelector("span")?.textContent,
      anchor.textContent
    ];

    for (const raw of values) {
      const value = clean(raw)
        .replace(/^view\s+/i, "")
        .replace(/\s+profile$/i, "")
        .trim();

      if (!value) continue;

      if (/^(see open roles|open roles|view profile|profile)$/i.test(value)) {
        continue;
      }

      if (
        /^[A-Za-zÀ-ÖØ-öø-ÿ.'-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ.'-]+){1,4}$/.test(value) &&
        !/\b(at|and|for|of|in|united|kingdom|area)\b/i.test(value)
      ) {
        return value;
      }
    }

    return "";
  }

  function splitName(name) {
    const parts = clean(name).split(/\s+/).filter(Boolean);

    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || ""
    };
  }

  function getProfileCard(anchor) {
    let node = anchor;

    for (let depth = 0; node && depth < 8; depth += 1) {
      const cardText = clean(node.innerText || node.textContent);
      const profileLinks = node.querySelectorAll('a[href*="/in/"]').length;

      if (
        profileLinks === 1 &&
        cardText.length >= 20 &&
        cardText.length <= 1200
      ) {
        return node;
      }

      node = node.parentElement;
    }

    return null;
  }

  function removeKnownNoise(value) {
    return clean(value)
      .replace(/\b\d+(st|nd|rd|th)\b/gi, " ")
      .replace(/\b\d+\s+(other\s+)?mutual connections?\b.*$/i, " ")
      .replace(/\b(?:and|is)\s+a\s+mutual connection\b.*$/i, " ")
      .replace(/\b(?:connect|message|follow)\b.*$/i, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function looksLikeLocation(value) {
    return (
      /\b(united kingdom|england|scotland|wales|ireland)\b/i.test(value) ||
      /\barea\b/i.test(value) ||
      /,\s*[A-Za-z]+/.test(value)
    );
  }

  function looksLikeProfileSummary(value) {
    return (
      value.length > 160 ||
      /\b(no cold sales|not a big linkedin|professional networking)\b/i.test(value)
    );
  }

  function extractRole(card, profileName) {
    const raw = clean(card?.innerText || "");

    if (!raw) return "";

    const withoutName = clean(
      raw.replace(
        new RegExp(
          profileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        ),
        " "
      )
    );

    const lines = withoutName
      .split(/\r?\n/)
      .map(removeKnownNoise)
      .filter(Boolean)
      .filter((line) => !looksLikeLocation(line))
      .filter((line) => !looksLikeProfileSummary(line))
      .filter((line) => !/^(2nd|3rd|connect|message|follow)$/i.test(line))
      .filter((line) => line.length >= 3 && line.length <= 180);

    const role = lines.find((line) =>
      roleKeywords.some((keyword) =>
        line.toLowerCase().includes(keyword)
      )
    );

    if (role) {
      return role
        .replace(/\s+(Jess|Raj|Ryan|Andy|David|Swetha|Emma)\s*$/i, "")
        .replace(/\s+(United Kingdom|England|Scotland|Wales)$/i, "")
        .trim();
    }

    return lines.find((line) =>
      /\b(at|@|manager|director|engineer|officer|lead|architect)\b/i.test(line)
    ) || "";
  }

  function extractProfiles() {
    const contacts = [];
    const seen = new Set();

    document.querySelectorAll('a[href*="/in/"]').forEach((anchor) => {
      const linkedinUrl = anchor.href.split("?")[0];

      if (
        seen.has(linkedinUrl) ||
        /\/opportunities\//i.test(linkedinUrl)
      ) {
        return;
      }

      const profileName = profileNameFromAnchor(anchor);

      if (!profileName) return;

      const card = getProfileCard(anchor);

      if (!card) return;

      const { firstName, lastName } = splitName(profileName);
      const role = extractRole(card, profileName);

      if (!firstName || !lastName || !role) return;

      seen.add(linkedinUrl);

      contacts.push({
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        role,
        location: "",
        linkedinUrl,
        emailDomain: EMAIL_DOMAIN,
        source: "linkedin-visible",
        verified: false
      });
    });

    return contacts;
  }

'''

text = text[:start] + replacement + text[end:]

validation_marker = "        const result = await importContacts(contacts);"

validation = '''        const invalid = contacts.filter((contact) =>
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

if validation_marker not in text:
    raise SystemExit(
        "Could not locate the import call. "
        "Extraction was not saved."
    )

text = text.replace(validation_marker, validation, 1)

target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
