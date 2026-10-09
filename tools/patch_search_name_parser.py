from pathlib import Path

target = Path("new-modular-product-linkedin-contact-bridge.user.js")
text = target.read_text(encoding="utf-8")

start = text.find("  function profileNameFromAnchor(")
end = text.find("  function removeKnownNoise(", start)

if start < 0 or end < 0:
    raise SystemExit(
        "Could not locate profileNameFromAnchor section. "
        "No changes were made."
    )

replacement = r'''  function profileNameFromAnchor(anchor) {
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
        .replace(
          /\s+\d+(?:st|nd|rd|th)?\s*$/i,
          ""
        )
        .trim();

      if (!value) continue;

      if (
        /^(see open roles|open roles|view profile|profile)$/i.test(value)
      ) {
        continue;
      }

      const parts = value.split(/\s+/).filter(Boolean);

      if (
        parts.length >= 2 &&
        parts.length <= 5 &&
        parts.every((part) =>
          /^[A-Za-zÀ-ÖØ-öø-ÿ.'-]+$/.test(part)
        ) &&
        !/\b(at|and|for|of|in|united|kingdom|area)\b/i.test(value)
      ) {
        return value;
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
      const text = clean(node.innerText || node.textContent);
      const profileLinks = node.querySelectorAll(
        'a[href*="/in/"]'
      ).length;

      return (
        profileLinks === 1 &&
        text.length >= 10 &&
        text.length <= 1800
      );
    }) || candidates[0] || null;
  }

'''

text = text[:start] + replacement + text[end:]

target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
