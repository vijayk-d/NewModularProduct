from pathlib import Path

target = Path("src/interfaces/http/rendering.js")
text = target.read_text(encoding="utf-8")

# Add stable tbody classes for partial refresh.
text = text.replace(
    "<tbody>${linkedRows}</tbody>",
    '<tbody class="linked-imported-contacts-body">${linkedRows}</tbody>',
    1,
)

text = text.replace(
    "<tbody>${unlinkedRows}</tbody>",
    '<tbody class="available-imported-contacts-body">${unlinkedRows}</tbody>',
    1,
)

# Insert a complete refresh button before the complete delete button.
delete_button_marker = '''            <button
              type="button"
              class="delete-selected-contacts-button"'''

refresh_button = '''            <button
              type="button"
              class="refresh-imported-contacts-button"
              data-review-id="${escapeHtml(contactLinking.reviewId)}"
            >
              Refresh contacts
            </button>
'''

if 'class="refresh-imported-contacts-button"' in text:
    print("Refresh button already exists. No button insertion performed.")
elif delete_button_marker not in text:
    raise SystemExit(
        "Could not find the complete delete-button marker. "
        "No changes were made."
    )
else:
    text = text.replace(
        delete_button_marker,
        refresh_button + delete_button_marker,
        1,
    )

target.write_text(text, encoding="utf-8", newline="\n")
print("Added refresh button and stable contact-table classes.")
