from pathlib import Path

target = Path("new-modular-product-linkedin-contact-bridge.user.js")
text = target.read_text(encoding="utf-8")

start = text.find("  function extractRole(")
end = text.find("  function extractProfiles(", start)

if start < 0 or end < 0:
    raise SystemExit(
        "Could not locate extractRole. No changes were made."
    )

replacement = r'''  function extractRole(card, profileName) {
    const raw = clean(card?.innerText || "");

    if (!raw) return "";

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
      .filter(Boolean);

    const roleLine = lines.find((line) =>
      line !== profileName &&
      line.length >= 3 &&
      line.length <= 220 &&
      !/^(2nd|3rd|3rd\+|view full profile)$/i.test(line) &&
      !/\b(?:united kingdom|england|scotland|wales|ireland)\b/i.test(line) &&
      !/\bis a mutual connection\b/i.test(line) &&
      !/\bmutual connection\b/i.test(line)
    );

    if (!roleLine) return "";

    return roleLine
      .replace(/\s+(Jess|Raj|Ryan|Andy|David|Swetha|Emma)\s*$/i, "")
      .replace(/\s+(United Kingdom|England|Scotland|Wales)$/i, "")
      .trim();
  }

'''

text = text[:start] + replacement + text[end:]

target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
