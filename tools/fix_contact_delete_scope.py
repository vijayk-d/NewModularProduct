from pathlib import Path

target = Path("src/application/recruiter-contact-store.js")
text = target.read_text(encoding="utf-8")

old = '''    const remainingContacts = contacts.filter((contact) => {
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

      if (shouldDelete) {
        deletedContacts.push(contact);
        return false;
      }

      return true;
    });'''

new = '''    const remainingContacts = contacts.filter((contact) => {
      const isLinkedToReview =
        Array.isArray(contact.linkedApplicationReviewIds) &&
        contact.linkedApplicationReviewIds.includes(reviewId);

      const isRequested =
        clearAll || requestedIds.has(contact.id);

      const isLinkedInImported =
        contact.source === "linkedin-visible" ||
        contact.organisationId === "domain:linkedin.com" ||
        contact.organisationId === "unknown:linkedin-import";

      const shouldDelete =
        !isLinkedToReview &&
        isRequested &&
        (clearAll
          ? isLinkedInImported
          : true);

      if (shouldDelete) {
        deletedContacts.push(contact);
        return false;
      }

      return true;
    });'''

if old not in text:
    raise SystemExit("Expected delete logic was not found. No changes made.")

text = text.replace(old, new, 1)
target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
