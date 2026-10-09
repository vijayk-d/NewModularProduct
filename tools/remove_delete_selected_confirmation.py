from pathlib import Path

target = Path("src/interfaces/http/review-page.js")
text = target.read_text(encoding="utf-8")

old = '''      var question = deleteSelected
        ? "Delete the selected imported contacts? This cannot be undone."
        : "Delete all unlinked imported contacts for this organisation? " +
          "This cannot be undone.";

      if (!window.confirm(question)) {
        return;
      }'''

new = '''      if (!deleteSelected) {
        var confirmed = window.confirm(
          "Delete all unlinked imported contacts for this organisation? " +
            "This cannot be undone."
        );

        if (!confirmed) {
          return;
        }
      }'''

if old not in text:
    raise SystemExit(
        "Could not find the delete confirmation block. No changes made."
    )

text = text.replace(old, new, 1)
target.write_text(text, encoding="utf-8", newline="\n")
print("Removed confirmation for Delete selected.")
