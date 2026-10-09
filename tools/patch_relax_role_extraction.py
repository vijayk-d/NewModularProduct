from pathlib import Path

target = Path("new-modular-product-linkedin-contact-bridge.user.js")
text = target.read_text(encoding="utf-8")

old = '''  function looksLikeLocation(value) {
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
  }'''

new = '''  function looksLikeLocation(value) {
    return (
      /\b(united kingdom|england|scotland|wales|ireland)\b/i.test(value) &&
      value.split(/\s+/).length <= 4
    );
  }

  function looksLikeProfileSummary(value) {
    return (
      value.length > 220 &&
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
      .filter((line) => line.length >= 3 && line.length <= 220);

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
  }'''

if old not in text:
    raise SystemExit(
        "Role extraction block was not found. No changes were made."
    )

text = text.replace(old, new, 1)
target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
