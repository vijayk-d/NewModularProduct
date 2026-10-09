from pathlib import Path

target = Path("src/application/import-recruiter-contacts.js")
text = target.read_text(encoding="utf-8")

old = '''    if (hostname && hostname !== "linkedin.com") {
      return `domain:${hostname}`;
    }
  } catch {
    // Fall through to the unknown organisation identifier.
  }

  return "unknown:linkedin-import";'''

new = '''    if (hostname === "linkedin.com") {
      return "domain:linkedin.com";
    }

    if (hostname) {
      return `domain:${hostname}`;
    }
  } catch {
    // Fall through to the unknown organisation identifier.
  }

  return "unknown:linkedin-import";'''

if old not in text:
    raise SystemExit("Expected importer logic was not found. No changes made.")

text = text.replace(old, new, 1)
target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
