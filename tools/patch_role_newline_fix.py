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
    const raw = String(card?.innerText || "");

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

        const containsFullName =
          nameTokens.length >= 2 &&
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
