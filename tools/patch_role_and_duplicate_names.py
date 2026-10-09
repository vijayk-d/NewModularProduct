from pathlib import Path

target = Path("new-modular-product-linkedin-contact-bridge.user.js")
text = target.read_text(encoding="utf-8")

start = text.find("  function profileNameFromAnchor(")
end = text.find("  function extractProfiles(", start)

if start < 0 or end < 0:
    raise SystemExit(
        "Could not locate extraction functions. No changes made."
    )

replacement = r'''  function removeRepeatedName(value) {
    const parts = clean(value).split(/\s+/).filter(Boolean);
    const half = Math.floor(parts.length / 2);

    if (
      half >= 2 &&
      parts.slice(0, half).join(" ").toLowerCase() ===
        parts.slice(half).join(" ").toLowerCase()
    ) {
      return parts.slice(0, half).join(" ");
    }

    return clean(value);
  }

  function profileNameFromAnchor(anchor) {
    const rawValues = [
      anchor.getAttribute("aria-label"),
      anchor.querySelector("span")?.textContent,
      anchor.textContent
    ];

    for (const raw of rawValues) {
      const original = clean(raw);

      if (!original) continue;

      const value = original
        .replace(/^view\s+/i, "")
        .replace(/\s+profile$/i, "")
        .replace(
          /\s*[·•|]\s*(?:\d+(?:st|nd|rd|th)?|\d+\+|connection|connections?|followers?|following).*$/i,
          ""
        )
        .replace(/\s+\d+(?:st|nd|rd|th)?\s*$/i, "")
        .trim();

      if (!value) continue;

      if (
        /^(see open roles|open roles|view profile|profile)$/i.test(value)
      ) {
        continue;
      }

      const normalised = removeRepeatedName(value);
      const parts = normalised.split(/\s+/).filter(Boolean);

      if (
        parts.length >= 2 &&
        parts.length <= 5 &&
        parts.every((part) =>
          /^[A-Za-zÀ-ÖØ-öø-ÿ.'-]+$/.test(part)
        ) &&
        !/\b(at|and|for|of|in|united|kingdom|area)\b/i.test(normalised)
      ) {
        return normalised;
      }
    }

    return "";
  }

  function getProfileCard(anchor) {
    const candidates = [
      anchor.closest("li"),
      anchor.closest("article"),
      anchor.parentElement?.parentElement,
      anchor.parentElement?.parentElement?.parentElement
    ].filter(Boolean);

    return candidates.find((node) => {
      const cardText = clean(node.innerText || node.textContent);
      const profileLinks = node.querySelectorAll(
        'a[href*="/in/"]'
      ).length;

      return (
        profileLinks === 1 &&
        cardText.length >= 10 &&
        cardText.length <= 1800 &&
        !/^.*is a mutual connection$/i.test(cardText)
      );
    }) || null;
  }

  function extractRole(card, profileName) {
    const raw = clean(card?.innerText || "");

    if (!raw) return "";

    const nameTokens = profileName
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const lines = raw
      .split(/\r?\n/)
      .map((line) =>
        clean(line)
          .replace(/^[·•|]\s*/, "")
          .replace(/\b\d+(st|nd|rd|th)\b/gi, "")
          .replace(/\b\d+\s+(other\s+)?mutual connections?\b.*$/i, "")
          .replace(/\b(?:and|is)\s+a\s+mutual connection\b.*$/i, "")
          .replace(/\b(?:connect|message|follow)\b.*$/i, "")
          .trim()
      )
      .filter(Boolean)
      .filter((line) => {
        const lower = line.toLowerCase();

        if (lower === profileName.toLowerCase()) return false;

        const containsFullName = nameTokens.length >= 2 &&
          nameTokens.every((token) => lower.includes(token));

        if (containsFullName) return false;

        if (/^(2nd|3rd|3rd\+|view full profile)$/i.test(line)) {
          return false;
        }

        if (
          /\b(?:united kingdom|england|scotland|wales|ireland)\b/i.test(line)
        ) {
          return false;
        }

        if (/\bmutual connection\b/i.test(line)) return false;

        return line.length >= 3 && line.length <= 220;
      });

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
      /\b(at|@|manager|director|engineer|officer|lead|architect|consultant|analyst)\b/i.test(
        line
      )
    ) || "";
  }

'''

text = text[:start] + replacement + text[end:]
target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
