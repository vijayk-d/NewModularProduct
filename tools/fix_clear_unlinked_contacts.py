from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / "src" / "application" / "recruiter-contact-store.js"

text = STORE.read_text(encoding="utf-8")

old = '''    const requestedIds = new Set(contactIds || []);
    const deletedContacts = [];

    const remainingContacts = contacts.filter((contact) => {
      const belongsToOrganisation =
        contact.organisationId === organisationId;

      const isLinkedToReview =
        Array.isArray(contact.linkedApplicationReviewIds) &&
        contact.linkedApplicationReviewIds.includes(reviewId);

      const isRequested =
        !contactIds || requestedIds.has(contact.id);

      const shouldDelete =
        belongsToOrganisation &&
        !isLinkedToReview &&
        isRequested;
'''

new = '''    const requestedIds = new Set(contactIds || []);
    const clearAll = !Array.isArray(contactIds) || contactIds.length === 0;
    const deletedContacts = [];

    const remainingContacts = contacts.filter((contact) => {
      const belongsToOrganisation =
        contact.organisationId === organisationId;

      const isLinkedToReview =
        Array.isArray(contact.linkedApplicationReviewIds) &&
        contact.linkedApplicationReviewIds.includes(reviewId);

      const isRequested =
        clearAll || requestedIds.has(contact.id);

      const shouldDelete =
        belongsToOrganisation &&
        !isLinkedToReview &&
        isRequested;
'''

if old not in text:
    raise SystemExit(
        "ERROR: expected delete logic was not found. "
        "No changes were made."
    )

if text.count(old) != 1:
    raise SystemExit(
        f"ERROR: expected one delete logic block, found {text.count(old)}."
    )

STORE.write_text(
    text.replace(old, new, 1),
    encoding="utf-8",
    newline="\n"
)

print("PATCHED: empty contactIds now clears all unlinked contacts")