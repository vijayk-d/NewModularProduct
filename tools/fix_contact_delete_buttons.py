from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDERING = ROOT / "src" / "interfaces" / "http" / "rendering.js"

OLD = '''            document
              .querySelector(".delete-selected-contacts-button")
              ?.addEventListener("click", async function (event) {
                var reviewId = event.target.dataset.reviewId;

                var contactIds = Array.from(
                  document.querySelectorAll(
                    ".contact-link-checkbox:checked"
                  )
                ).map(function (checkbox) {
                  return checkbox.value;
                });

                if (!contactIds.length) {
                  alert(
                    "Select at least one contact to delete."
                  );

                  return;
                }

                var confirmed = confirm(
                  "Delete the selected imported contacts? " +
                    "This cannot be undone."
                );

                if (!confirmed) {
                  return;
                }

                await deleteContacts(reviewId, contactIds);
              });

            document
              .querySelector(".clear-imported-contacts-button")
              ?.addEventListener("click", async function (event) {
                var reviewId = event.target.dataset.reviewId;

                var confirmed = confirm(
                  "Delete ALL unlinked imported contacts for " +
                    "this review? This cannot be undone."
                );

                if (!confirmed) {
                  return;
                }

                await deleteContacts(reviewId, []);
              });
          </script>'''

NEW = '''            document.addEventListener(
              "click",
              async function (event) {
                var deleteSelectedButton = event.target.closest(
                  ".delete-selected-contacts-button"
                );

                var clearAllButton = event.target.closest(
                  ".clear-imported-contacts-button"
                );

                if (!deleteSelectedButton && !clearAllButton) {
                  return;
                }

                var button = deleteSelectedButton || clearAllButton;
                var reviewId = button.dataset.reviewId;

                if (deleteSelectedButton) {
                  var contactIds = Array.from(
                    document.querySelectorAll(
                      ".contact-link-checkbox:checked"
                    )
                  ).map(function (checkbox) {
                    return checkbox.value;
                  });

                  if (!contactIds.length) {
                    alert(
                      "Select at least one contact to delete."
                    );

                    return;
                  }

                  var confirmed = confirm(
                    "Delete the selected imported contacts? " +
                      "This cannot be undone."
                  );

                  if (!confirmed) {
                    return;
                  }

                  await deleteContacts(reviewId, contactIds);
                  return;
                }

                var clearConfirmed = confirm(
                  "Delete ALL unlinked imported contacts for " +
                    "this review? This cannot be undone."
                );

                if (!clearConfirmed) {
                  return;
                }

                await deleteContacts(reviewId, []);
              }
            );
          </script>'''

text = RENDERING.read_text(encoding="utf-8")

if OLD not in text:
    raise SystemExit(
        "ERROR: could not find the direct button listeners. "
        "No changes were made."
    )

if text.count(OLD) != 1:
    raise SystemExit(
        "ERROR: expected one matching listener block, found "
        f"{text.count(OLD)}. No changes were made."
    )

RENDERING.write_text(
    text.replace(OLD, NEW, 1),
    encoding="utf-8",
    newline="\n"
)

print("PATCHED: contact-delete buttons now use event delegation")
print(f"Updated: {RENDERING}")