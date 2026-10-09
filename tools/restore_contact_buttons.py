from pathlib import Path

target = Path("src/interfaces/http/rendering.js")
text = target.read_text(encoding="utf-8")

marker = '''          <script nonce="__SCRIPT_NONCE__">
            document
              .getElementById("select-all-contact-links")'''

buttons = '''          <div class="contact-linking-actions" style="display:flex;gap:8px;margin-top:12px;">
            <button
              type="button"
              class="delete-selected-contacts-button"
              data-review-id="${escapeHtml(contactLinking.reviewId)}"
            >
              Delete selected
            </button>
            <button
              type="button"
              class="clear-imported-contacts-button"
              data-review-id="${escapeHtml(contactLinking.reviewId)}"
            >
              Clear imported contacts
            </button>
          </div>
'''

if marker not in text:
    raise SystemExit(
        "Could not find the contact-linking script marker. "
        "No changes were made."
    )

if 'class="delete-selected-contacts-button"' in text:
    print("Delete/clear buttons already exist. No changes made.")
else:
    text = text.replace(marker, buttons + marker, 1)
    target.write_text(text, encoding="utf-8", newline="\n")
    print(f"Restored delete/clear buttons in {target}")
