from pathlib import Path

target = Path("new-modular-product-linkedin-contact-bridge.user.js")
text = target.read_text(encoding="utf-8")

if "function splitName(" in text:
    print("splitName already exists. No changes made.")
    raise SystemExit(0)

marker = "  function getProfileCard(anchor) {"

if marker not in text:
    raise SystemExit(
        "Could not find getProfileCard. No changes were made."
    )

insertion = '''  function splitName(name) {
    const parts = clean(name).split(/\\s+/).filter(Boolean);

    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || ""
    };
  }

'''

text = text.replace(marker, insertion + marker, 1)

target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
