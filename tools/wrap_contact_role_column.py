from pathlib import Path

target = Path("src/interfaces/http/rendering.js")
text = target.read_text(encoding="utf-8")

old_cell = "<td>${escapeHtml(contact.role || \"\")}</td>"
new_cell = '<td class="contact-role-cell">${escapeHtml(contact.role || "")}</td>'

role_cell_count = text.count(old_cell)

if role_cell_count == 0:
    raise SystemExit("Could not find contact Role cells. No changes made.")

text = text.replace(old_cell, new_cell)

css_marker = ".cv-keywords {"
contact_css = '''.contact-role-cell {
  max-width: 28rem;
  overflow-wrap: anywhere;
  white-space: normal;
}

.cv-keywords {'''

if ".contact-role-cell {" in text:
    print("Contact role CSS already exists. No CSS changes made.")
elif css_marker not in text:
    raise SystemExit("Could not find review stylesheet marker. No CSS changes made.")
else:
    text = text.replace(css_marker, contact_css, 1)

target.write_text(text, encoding="utf-8", newline="\n")
print(f"Added wrapping to {role_cell_count} contact Role cells.")
