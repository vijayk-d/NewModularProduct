from pathlib import Path

target = Path("src/interfaces/http/create-local-server.js")
text = target.read_text(encoding="utf-8")

old = '''        const linkedContacts = await loadReviewContacts(reviewId);
        const organisationContacts = await loadOrganisationContacts(
          review.formData
        );

        const linkedContactIds = new Set(
          linkedContacts.map((contact) => contact.id)
        );

        const unlinkedContacts = organisationContacts.filter(
          (contact) => !linkedContactIds.has(contact.id)
        );

        sendJson(response, 200, {
          ok: true,
          linked: linkedContacts,
          unlinked: unlinkedContacts
        });'''

new = '''        const contactLinking = await loadContactLinking(reviewId);

        sendJson(response, 200, {
          ok: true,
          linked: contactLinking.linked || [],
          unlinked: contactLinking.unlinked || []
        });'''

if old not in text:
    raise SystemExit(
        "Could not find the current linking-route body. No changes made."
    )

text = text.replace(old, new, 1)
target.write_text(text, encoding="utf-8", newline="\n")
print("Updated linking route to use loadContactLinking().")
